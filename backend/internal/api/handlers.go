package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"project-management-backend/internal/middleware"
	"project-management-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
)

type Handler struct {
	db *sql.DB
}

func NewHandler(db *sql.DB) *Handler {
	return &Handler{db: db}
}

// GetProjects 获取所有项目（轻量级版本，用于列表展示）
func (h *Handler) GetProjects(c *gin.Context) {
	// 查询项目列表，包含团队成员字段（个人视图需要）
	query := `
		SELECT id, name, system, priority, business_problem, key_result_ids, weekly_update, 
		       last_week_update, status, proposal_date, launch_date, created_at, followers,
		       product_managers, backend_developers, frontend_developers, qa_testers
		FROM projects
		ORDER BY created_at DESC
	`

	rows, err := h.db.Query(query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var projects []models.Project

	for rows.Next() {
		var p models.Project
		var keyResultIds pq.StringArray
		var followers pq.StringArray
		var productManagers, backendDevelopers, frontendDevelopers, qaTesters []byte

		err := rows.Scan(
			&p.ID, &p.Name, &p.System, &p.Priority, &p.BusinessProblem, &keyResultIds,
			&p.WeeklyUpdate, &p.LastWeekUpdate, &p.Status,
			&p.ProposalDate, &p.LaunchDate, &p.CreatedAt, &followers,
			&productManagers, &backendDevelopers, &frontendDevelopers, &qaTesters,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// 转换数组类型
		p.KeyResultIds = []string(keyResultIds)
		p.Followers = []string(followers)

		// 解析JSONB字段
		json.Unmarshal(productManagers, &p.ProductManagers)
		json.Unmarshal(backendDevelopers, &p.BackendDevelopers)
		json.Unmarshal(frontendDevelopers, &p.FrontendDevelopers)
		json.Unmarshal(qaTesters, &p.QaTesters)

		// 初始化空数组（避免前端null检查）
		if p.ProductManagers == nil {
			p.ProductManagers = []models.TeamMember{}
		}
		if p.BackendDevelopers == nil {
			p.BackendDevelopers = []models.TeamMember{}
		}
		if p.FrontendDevelopers == nil {
			p.FrontendDevelopers = []models.TeamMember{}
		}
		if p.QaTesters == nil {
			p.QaTesters = []models.TeamMember{}
		}
		p.Comments = []models.Comment{}
		p.ChangeLog = []models.ChangeLogEntry{}
		p.Documents = []models.Document{}

		projects = append(projects, p)
	}

	c.JSON(http.StatusOK, projects)
}

// GetProjectDetail 获取项目详情（包含所有字段和time slots）
func (h *Handler) GetProjectDetail(c *gin.Context) {
	projectID := c.Param("projectId")

	query := `
		SELECT id, name, system, priority, business_problem, key_result_ids, weekly_update, 
		       last_week_update, status, product_managers, backend_developers, 
		       frontend_developers, qa_testers, proposal_date, launch_date, 
		       created_at, followers, comments, change_log, documents
		FROM projects
		WHERE id = $1
	`

	var p models.Project
	var keyResultIds pq.StringArray
	var followers pq.StringArray
	var productManagers, backendDevelopers, frontendDevelopers, qaTesters []byte
	var comments, changeLog, documents []byte

	err := h.db.QueryRow(query, projectID).Scan(
		&p.ID, &p.Name, &p.System, &p.Priority, &p.BusinessProblem, &keyResultIds,
		&p.WeeklyUpdate, &p.LastWeekUpdate, &p.Status, &productManagers,
		&backendDevelopers, &frontendDevelopers, &qaTesters,
		&p.ProposalDate, &p.LaunchDate, &p.CreatedAt, &followers, &comments, &changeLog, &documents,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Project not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 转换数组类型
	p.KeyResultIds = []string(keyResultIds)
	p.Followers = []string(followers)

	// 解析JSONB字段
	json.Unmarshal(productManagers, &p.ProductManagers)
	json.Unmarshal(backendDevelopers, &p.BackendDevelopers)
	json.Unmarshal(frontendDevelopers, &p.FrontendDevelopers)
	json.Unmarshal(qaTesters, &p.QaTesters)
	json.Unmarshal(comments, &p.Comments)
	json.Unmarshal(changeLog, &p.ChangeLog)
	json.Unmarshal(documents, &p.Documents)

	// 初始化空的TimeSlots
	h.initializeEmptyTimeSlots(&p)

	// 加载时段数据
	err = h.loadAllTimeSlots([]models.Project{p}, []string{p.ID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load time slots: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, p)
}

// loadTimeSlots 加载项目的多时段数据
func (h *Handler) loadTimeSlots(project *models.Project) error {
	query := `
		SELECT user_id, role_key, start_date, end_date, description
		FROM time_slots 
		WHERE project_id = $1
		ORDER BY role_key, user_id, start_date
	`

	rows, err := h.db.Query(query, project.ID)
	if err != nil {
		return err
	}
	defer rows.Close()

	// 创建映射来组织时段数据
	timeSlotMap := make(map[string]map[string][]models.TimeSlot)

	for rows.Next() {
		var userID, roleKey, description string
		var startDate, endDate *string

		err := rows.Scan(&userID, &roleKey, &startDate, &endDate, &description)
		if err != nil {
			return err
		}

		timeSlot := models.TimeSlot{
			ID:          "slot_" + userID + "_" + roleKey,
			Description: &description,
		}

		if startDate != nil {
			timeSlot.StartDate = *startDate
		}
		if endDate != nil {
			timeSlot.EndDate = *endDate
		}

		if timeSlotMap[roleKey] == nil {
			timeSlotMap[roleKey] = make(map[string][]models.TimeSlot)
		}
		timeSlotMap[roleKey][userID] = append(timeSlotMap[roleKey][userID], timeSlot)
	}

	// 将时段数据分配给对应的团队成员
	h.assignTimeSlotsToMembers(project.ProductManagers, timeSlotMap["productManagers"])
	h.assignTimeSlotsToMembers(project.BackendDevelopers, timeSlotMap["backendDevelopers"])
	h.assignTimeSlotsToMembers(project.FrontendDevelopers, timeSlotMap["frontendDevelopers"])
	h.assignTimeSlotsToMembers(project.QaTesters, timeSlotMap["qaTesters"])

	return nil
}

// assignTimeSlotsToMembers 将时段数据分配给团队成员
func (h *Handler) assignTimeSlotsToMembers(members []models.TeamMember, userTimeSlots map[string][]models.TimeSlot) {
	for i := range members {
		if timeSlots, exists := userTimeSlots[members[i].UserID]; exists {
			members[i].TimeSlots = timeSlots
		} else {
			// 如果没有时段数据，创建一个默认的空时段
			members[i].TimeSlots = []models.TimeSlot{}
		}
	}
}

// initializeEmptyTimeSlots 初始化空的时段数据
func (h *Handler) initializeEmptyTimeSlots(project *models.Project) {
	for i := range project.ProductManagers {
		project.ProductManagers[i].TimeSlots = []models.TimeSlot{}
	}
	for i := range project.BackendDevelopers {
		project.BackendDevelopers[i].TimeSlots = []models.TimeSlot{}
	}
	for i := range project.FrontendDevelopers {
		project.FrontendDevelopers[i].TimeSlots = []models.TimeSlot{}
	}
	for i := range project.QaTesters {
		project.QaTesters[i].TimeSlots = []models.TimeSlot{}
	}
}

// loadAllTimeSlots 批量加载所有项目的时段数据
func (h *Handler) loadAllTimeSlots(projects []models.Project, projectIDs []string) error {
	if len(projectIDs) == 0 {
		return nil
	}

	// 构建IN查询的占位符
	placeholders := make([]string, len(projectIDs))
	args := make([]interface{}, len(projectIDs))
	for i, id := range projectIDs {
		placeholders[i] = "$" + strconv.Itoa(i+1)
		args[i] = id
	}

	query := `
		SELECT project_id, user_id, role_key, start_date, end_date, description
		FROM time_slots 
		WHERE project_id IN (` + strings.Join(placeholders, ",") + `)
		ORDER BY project_id, role_key, user_id, start_date
	`

	rows, err := h.db.Query(query, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	// 创建项目ID到索引的映射
	projectIndexMap := make(map[string]int)
	for i, project := range projects {
		projectIndexMap[project.ID] = i
	}

	// 创建映射来组织时段数据
	projectTimeSlots := make(map[string]map[string]map[string][]models.TimeSlot)

	for rows.Next() {
		var projectID, userID, roleKey, description string
		var startDate, endDate *string

		err := rows.Scan(&projectID, &userID, &roleKey, &startDate, &endDate, &description)
		if err != nil {
			return err
		}

		timeSlot := models.TimeSlot{
			ID:          "slot_" + userID + "_" + roleKey,
			Description: &description,
		}

		if startDate != nil {
			timeSlot.StartDate = *startDate
		}
		if endDate != nil {
			timeSlot.EndDate = *endDate
		}

		if projectTimeSlots[projectID] == nil {
			projectTimeSlots[projectID] = make(map[string]map[string][]models.TimeSlot)
		}
		if projectTimeSlots[projectID][roleKey] == nil {
			projectTimeSlots[projectID][roleKey] = make(map[string][]models.TimeSlot)
		}
		projectTimeSlots[projectID][roleKey][userID] = append(projectTimeSlots[projectID][roleKey][userID], timeSlot)
	}

	// 将时段数据分配给对应的项目和团队成员
	for projectID, timeSlotMap := range projectTimeSlots {
		if projectIndex, exists := projectIndexMap[projectID]; exists {
			project := &projects[projectIndex]
			h.assignTimeSlotsToMembers(project.ProductManagers, timeSlotMap["productManagers"])
			h.assignTimeSlotsToMembers(project.BackendDevelopers, timeSlotMap["backendDevelopers"])
			h.assignTimeSlotsToMembers(project.FrontendDevelopers, timeSlotMap["frontendDevelopers"])
			h.assignTimeSlotsToMembers(project.QaTesters, timeSlotMap["qaTesters"])
		}
	}

	return nil
}

// CreateProject 创建新项目
func (h *Handler) CreateProject(c *gin.Context) {
	var project models.Project
	if err := c.ShouldBindJSON(&project); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 生成唯一ID和设置创建时间
	now := time.Now()
	project.ID = "p" + strconv.FormatInt(now.UnixNano(), 10)
	project.CreatedAt = now.Format(time.RFC3339)

	// 处理必填字段的默认值
	if project.Name == "" {
		project.Name = "未命名项目"
	}
	if project.Priority == "" {
		project.Priority = "日常需求"
	}
	if project.Status == "" {
		project.Status = "未开始"
	}

	// 处理日期字段的空字符串问题
	if project.ProposalDate != nil && *project.ProposalDate == "" {
		project.ProposalDate = nil
	}
	if project.LaunchDate != nil && *project.LaunchDate == "" {
		project.LaunchDate = nil
	}

	// 初始化数组字段
	if project.KeyResultIds == nil {
		project.KeyResultIds = []string{}
	}
	if project.Followers == nil {
		project.Followers = []string{}
	}
	if project.ProductManagers == nil {
		project.ProductManagers = []models.TeamMember{}
	}
	if project.BackendDevelopers == nil {
		project.BackendDevelopers = []models.TeamMember{}
	}
	if project.FrontendDevelopers == nil {
		project.FrontendDevelopers = []models.TeamMember{}
	}
	if project.QaTesters == nil {
		project.QaTesters = []models.TeamMember{}
	}
	if project.Comments == nil {
		project.Comments = []models.Comment{}
	}
	if project.ChangeLog == nil {
		project.ChangeLog = []models.ChangeLogEntry{}
	}

	// 开始事务
	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback()

	// 序列化JSONB字段
	productManagersJSON, _ := json.Marshal(project.ProductManagers)
	backendDevelopersJSON, _ := json.Marshal(project.BackendDevelopers)
	frontendDevelopersJSON, _ := json.Marshal(project.FrontendDevelopers)
	qaTestersJSON, _ := json.Marshal(project.QaTesters)
	commentsJSON, _ := json.Marshal(project.Comments)
	changeLogJSON, _ := json.Marshal(project.ChangeLog)
	documentsJSON, _ := json.Marshal(project.Documents)

	// 插入项目基本信息
	query := `
		INSERT INTO projects (
			id, name, system, priority, business_problem, key_result_ids, weekly_update, 
			last_week_update, status, product_managers, backend_developers, 
			frontend_developers, qa_testers, proposal_date, launch_date, 
			created_at, followers, comments, change_log, documents
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`

	_, err = tx.Exec(query,
		project.ID, project.Name, project.System, project.Priority, project.BusinessProblem,
		pq.Array(project.KeyResultIds), project.WeeklyUpdate, project.LastWeekUpdate,
		project.Status, productManagersJSON, backendDevelopersJSON,
		frontendDevelopersJSON, qaTestersJSON, project.ProposalDate, project.LaunchDate,
		project.CreatedAt, pq.Array(project.Followers), commentsJSON, changeLogJSON, documentsJSON)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 插入多时段数据
	timeSlotQuery := `
		INSERT INTO time_slots (id, project_id, user_id, role_key, start_date, end_date, description)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`

	// 处理各个角色的多时段数据
	roleMap := map[string][]models.TeamMember{
		"productManagers":    project.ProductManagers,
		"backendDevelopers":  project.BackendDevelopers,
		"frontendDevelopers": project.FrontendDevelopers,
		"qaTesters":          project.QaTesters,
	}

	for roleKey, members := range roleMap {
		for _, member := range members {
			for _, timeSlot := range member.TimeSlots {
				slotID := "slot_" + strconv.FormatInt(time.Now().UnixNano(), 10)

				var startDate, endDate interface{}
				if timeSlot.StartDate != "" {
					startDate = timeSlot.StartDate
				}
				if timeSlot.EndDate != "" {
					endDate = timeSlot.EndDate
				}

				_, err = tx.Exec(timeSlotQuery,
					slotID, project.ID, member.UserID, roleKey,
					startDate, endDate, timeSlot.Description)

				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save time slots: " + err.Error()})
					return
				}
			}
		}
	}

	// 提交事务
	if err = tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transaction"})
		return
	}

	c.JSON(http.StatusCreated, project)
}

// UpdateProject 更新项目
func (h *Handler) UpdateProject(c *gin.Context) {
	projectID := c.Param("projectId")

	var updates models.Project
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 首先获取现有项目
	var existing models.Project
	query := `
		SELECT id, name, system, priority, business_problem, key_result_ids, weekly_update, 
		       last_week_update, status, product_managers, backend_developers, 
		       frontend_developers, qa_testers, proposal_date, launch_date, 
		       created_at, followers, comments, change_log, documents
		FROM projects WHERE id = $1
	`

	var keyResultIds pq.StringArray
	var followers pq.StringArray
	var productManagers, backendDevelopers, frontendDevelopers, qaTesters []byte
	var comments, changeLog, documents []byte

	err := h.db.QueryRow(query, projectID).Scan(
		&existing.ID, &existing.Name, &existing.System, &existing.Priority, &existing.BusinessProblem, &keyResultIds,
		&existing.WeeklyUpdate, &existing.LastWeekUpdate, &existing.Status, &productManagers,
		&backendDevelopers, &frontendDevelopers, &qaTesters,
		&existing.ProposalDate, &existing.LaunchDate, &existing.CreatedAt, &followers, &comments, &changeLog, &documents,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Project not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	// 转换现有数据
	existing.KeyResultIds = []string(keyResultIds)
	existing.Followers = []string(followers)
	json.Unmarshal(productManagers, &existing.ProductManagers)
	json.Unmarshal(backendDevelopers, &existing.BackendDevelopers)
	json.Unmarshal(frontendDevelopers, &existing.FrontendDevelopers)
	json.Unmarshal(qaTesters, &existing.QaTesters)
	json.Unmarshal(comments, &existing.Comments)
	json.Unmarshal(changeLog, &existing.ChangeLog)
	json.Unmarshal(documents, &existing.Documents)

	// 合并更新
	if updates.Name != "" {
		existing.Name = updates.Name
	}
	if updates.System != nil {
		existing.System = updates.System
	}
	if updates.Priority != "" {
		existing.Priority = updates.Priority
	}
	if updates.Status != "" {
		existing.Status = updates.Status
	}
	if updates.BusinessProblem != nil {
		existing.BusinessProblem = updates.BusinessProblem
	}
	if updates.WeeklyUpdate != nil {
		existing.WeeklyUpdate = updates.WeeklyUpdate
	}
	if updates.LastWeekUpdate != nil {
		existing.LastWeekUpdate = updates.LastWeekUpdate
	}
	if updates.ProposalDate != nil {
		existing.ProposalDate = updates.ProposalDate
	}
	if updates.LaunchDate != nil {
		existing.LaunchDate = updates.LaunchDate
	}
	if updates.KeyResultIds != nil {
		existing.KeyResultIds = updates.KeyResultIds
	}
	if updates.Followers != nil {
		existing.Followers = updates.Followers
	}
	if updates.ProductManagers != nil {
		existing.ProductManagers = updates.ProductManagers
	}
	if updates.BackendDevelopers != nil {
		existing.BackendDevelopers = updates.BackendDevelopers
	}
	if updates.FrontendDevelopers != nil {
		existing.FrontendDevelopers = updates.FrontendDevelopers
	}
	if updates.QaTesters != nil {
		existing.QaTesters = updates.QaTesters
	}
	if updates.Comments != nil {
		existing.Comments = updates.Comments
	}
	if updates.ChangeLog != nil {
		existing.ChangeLog = updates.ChangeLog
	}
	if updates.Documents != nil {
		existing.Documents = updates.Documents
	}
	if updates.CreatedAt != "" {
		existing.CreatedAt = updates.CreatedAt
	}

	// 开始事务
	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
		return
	}
	defer tx.Rollback()

	// 序列化JSONB字段
	productManagersJSON, _ := json.Marshal(existing.ProductManagers)
	backendDevelopersJSON, _ := json.Marshal(existing.BackendDevelopers)
	frontendDevelopersJSON, _ := json.Marshal(existing.FrontendDevelopers)
	qaTestersJSON, _ := json.Marshal(existing.QaTesters)
	commentsJSON, _ := json.Marshal(existing.Comments)
	changeLogJSON, _ := json.Marshal(existing.ChangeLog)
	documentsJSON, _ := json.Marshal(existing.Documents)

	// 更新项目基本信息
	updateQuery := `
		UPDATE projects SET 
			name = $2, system = $3, priority = $4, business_problem = $5, key_result_ids = $6, 
			weekly_update = $7, last_week_update = $8, status = $9, 
			product_managers = $10, backend_developers = $11, 
			frontend_developers = $12, qa_testers = $13, 
			proposal_date = $14, launch_date = $15, followers = $16, 
			comments = $17, change_log = $18, created_at = $19, documents = $20
		WHERE id = $1
	`

	_, err = tx.Exec(updateQuery,
		projectID, existing.Name, existing.System, existing.Priority, existing.BusinessProblem,
		pq.Array(existing.KeyResultIds), existing.WeeklyUpdate, existing.LastWeekUpdate,
		existing.Status, productManagersJSON, backendDevelopersJSON,
		frontendDevelopersJSON, qaTestersJSON, existing.ProposalDate, existing.LaunchDate,
		pq.Array(existing.Followers), commentsJSON, changeLogJSON, existing.CreatedAt, documentsJSON)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 检查是否有团队成员更新，如果有则更新时段数据
	hasTeamUpdates := updates.ProductManagers != nil || updates.BackendDevelopers != nil ||
		updates.FrontendDevelopers != nil || updates.QaTesters != nil

	if hasTeamUpdates {
		// 删除现有的时段数据
		_, err = tx.Exec("DELETE FROM time_slots WHERE project_id = $1", projectID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete existing time slots: " + err.Error()})
			return
		}

		// 插入新的时段数据
		timeSlotQuery := `
			INSERT INTO time_slots (id, project_id, user_id, role_key, start_date, end_date, description)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`

		roleMap := map[string][]models.TeamMember{
			"productManagers":    existing.ProductManagers,
			"backendDevelopers":  existing.BackendDevelopers,
			"frontendDevelopers": existing.FrontendDevelopers,
			"qaTesters":          existing.QaTesters,
		}

		for roleKey, members := range roleMap {
			for _, member := range members {
				for _, timeSlot := range member.TimeSlots {
					slotID := "slot_" + strconv.FormatInt(time.Now().UnixNano(), 10)

					var startDate, endDate interface{}
					if timeSlot.StartDate != "" {
						startDate = timeSlot.StartDate
					}
					if timeSlot.EndDate != "" {
						endDate = timeSlot.EndDate
					}

					_, err = tx.Exec(timeSlotQuery,
						slotID, projectID, member.UserID, roleKey,
						startDate, endDate, timeSlot.Description)

					if err != nil {
						c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save time slots: " + err.Error()})
						return
					}
				}
			}
		}
	}

	// 提交事务
	if err = tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transaction"})
		return
	}

	c.JSON(http.StatusOK, existing)
}

// DeleteProject 删除项目
func (h *Handler) DeleteProject(c *gin.Context) {
	projectID := c.Param("projectId")

	result, err := h.db.Exec("DELETE FROM projects WHERE id = $1", projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Project not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GetUsers 获取所有用户
// userIDMapping 将数据库用户ID映射到项目成员使用的ID
// 这是为了兼容历史数据，不修改数据库的情况下解决ID不匹配问题
var userIDMapping = map[string]string{
	"10001": "22231", // 陈楠: 数据库ID -> 项目成员ID
}

func (h *Handler) GetUsers(c *gin.Context) {
	rows, err := h.db.Query("SELECT id, name, email, avatar_url, dept_id, dept_name FROM users ORDER BY dept_name, name")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var user models.User
		err := rows.Scan(&user.ID, &user.Name, &user.Email, &user.AvatarURL, &user.DeptID, &user.DeptName)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		// 应用ID映射，兼容历史数据
		if mappedID, exists := userIDMapping[user.ID]; exists {
			user.ID = mappedID
		}
		users = append(users, user)
	}

	c.JSON(http.StatusOK, users)
}

// GetOkrSets 获取所有OKR集合
func (h *Handler) GetOkrSets(c *gin.Context) {
	rows, err := h.db.Query("SELECT period_id, period_name, okrs FROM okr_sets ORDER BY period_id")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var okrSets []models.OkrSet
	for rows.Next() {
		var okrSet models.OkrSet
		var okrsJSON []byte
		err := rows.Scan(&okrSet.PeriodID, &okrSet.PeriodName, &okrsJSON)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		json.Unmarshal(okrsJSON, &okrSet.Okrs)
		okrSets = append(okrSets, okrSet)
	}

	c.JSON(http.StatusOK, okrSets)
}

// CreateOkrSet 创建新的OKR集合
func (h *Handler) CreateOkrSet(c *gin.Context) {
	var req struct {
		PeriodID   string `json:"periodId"`
		PeriodName string `json:"periodName"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	okrSet := models.OkrSet{
		PeriodID:   req.PeriodID,
		PeriodName: req.PeriodName,
		Okrs:       []models.OKR{},
	}

	okrsJSON, _ := json.Marshal(okrSet.Okrs)

	_, err := h.db.Exec(
		"INSERT INTO okr_sets (period_id, period_name, okrs) VALUES ($1, $2, $3)",
		okrSet.PeriodID, okrSet.PeriodName, okrsJSON)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, okrSet)
}

// UpdateOkrSet 更新OKR集合
func (h *Handler) UpdateOkrSet(c *gin.Context) {
	periodID := c.Param("periodId")

	var okrSet models.OkrSet
	if err := c.ShouldBindJSON(&okrSet); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	okrsJSON, _ := json.Marshal(okrSet.Okrs)

	result, err := h.db.Exec(
		"UPDATE okr_sets SET period_name = $2, okrs = $3 WHERE period_id = $1",
		periodID, okrSet.PeriodName, okrsJSON)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "OKR set not found"})
		return
	}

	c.JSON(http.StatusOK, okrSet)
}

// PerformWeeklyRollover 执行周会数据滚动
func (h *Handler) PerformWeeklyRollover(c *gin.Context) {
	query := `
		UPDATE projects 
		SET last_week_update = weekly_update,
		    weekly_update = ''
		WHERE weekly_update IS NOT NULL AND weekly_update != ''
		RETURNING id
	`

	rows, err := h.db.Query(query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var updatedProjectIds []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		updatedProjectIds = append(updatedProjectIds, id)
	}

	fmt.Printf("Weekly rollover completed - Updated %d projects, cleared weekly_update\n", len(updatedProjectIds))

	c.JSON(http.StatusOK, gin.H{
		"updatedProjectIds": updatedProjectIds,
		"message":           fmt.Sprintf("Successfully rolled over %d projects and cleared weekly updates", len(updatedProjectIds)),
	})
}

// RefreshUsers 清空用户数据并重新从接口同步
func (h *Handler) RefreshUsers(c *gin.Context) {
	// 1. 清空现有用户数据
	_, err := h.db.Exec("DELETE FROM users")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear users: " + err.Error()})
		return
	}

	// 2. 从接口获取员工数据
	employeeResp, err := h.fetchEmployeeData()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch employee data: " + err.Error()})
		return
	}

	// 3. 处理员工数据
	employees, exists := employeeResp.EmployeeList["28508728"]
	if !exists {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Department 28508728 not found in response"})
		return
	}

	// 4. 插入新的员工数据
	var insertedCount int
	for _, employee := range employees {
		if err := h.insertEmployee(employee); err != nil {
			continue // 跳过失败的记录，继续处理其他记录
		}
		insertedCount++
	}

	c.JSON(http.StatusOK, gin.H{
		"message":        "Users refreshed successfully",
		"totalEmployees": len(employees),
		"insertedCount":  insertedCount,
	})
}

func (h *Handler) fetchEmployeeData() (models.EmployeeResponse, error) {
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	req, err := http.NewRequest("GET", "http://10.69.67.224/dept/employee/list?dept_ids=28508728", nil)
	if err != nil {
		return models.EmployeeResponse{}, fmt.Errorf("failed to create request: %w", err)
	}

	// 设置请求头
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Basic QUs1YWRkZDVkMjJiNThiOlNLNWFkZGQ1ZDIyYjVjYg==")
	req.Header.Set("Host", "contact.inner.sdns.ksyun.com")

	resp, err := client.Do(req)
	if err != nil {
		return models.EmployeeResponse{}, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return models.EmployeeResponse{}, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return models.EmployeeResponse{}, fmt.Errorf("failed to read response body: %w", err)
	}

	var employeeResp models.EmployeeResponse
	if err := json.Unmarshal(body, &employeeResp); err != nil {
		return models.EmployeeResponse{}, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return employeeResp, nil
}

func (h *Handler) insertEmployee(employee models.Employee) error {
	userID := strconv.Itoa(employee.EmployeeID)
	avatarURL := fmt.Sprintf("https://picsum.photos/seed/%d/40/40", employee.EmployeeID)

	// 根据部门ID获取部门名称
	deptName := h.getDepartmentName(employee.DeptID)

	// 使用 UPSERT 语法 (INSERT ... ON CONFLICT ... DO UPDATE)
	upsertQuery := `
		INSERT INTO users (id, name, email, avatar_url, dept_id, dept_name) 
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (id) 
		DO UPDATE SET 
			name = EXCLUDED.name,
			email = EXCLUDED.email,
			avatar_url = EXCLUDED.avatar_url,
			dept_id = EXCLUDED.dept_id,
			dept_name = EXCLUDED.dept_name
	`
	_, err := h.db.Exec(upsertQuery, userID, employee.RealName, employee.Email, avatarURL, employee.DeptID, deptName)
	if err != nil {
		return fmt.Errorf("failed to upsert user: %w", err)
	}

	return nil
}

// getDepartmentName 根据部门ID获取部门名称
func (h *Handler) getDepartmentName(deptID int) string {
	// 根据实际的部门ID映射部门名称
	switch deptID {
	case 28508728:
		return "技术部"
	case 28508729:
		return "产品管理部"
	case 28508731:
		return "业务平台研发部"
	case 28508815:
		return "基础平台研发部"
	case 28508730:
		return "前端技术部"
	case 28507849:
		return "测试部"
	case 28508521:
		return "SRE平台组"
	default:
		return fmt.Sprintf("部门%d", deptID)
	}
}

// CheckAuth 检查用户认证状态
func (h *Handler) CheckAuth(c *gin.Context) {
	// 获取所有cookie，转发给金山云API
	cookies := c.Request.Header.Get("Cookie")

	if cookies == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "No cookies found"})
		return
	}

	// 调用金山云认证API
	req, err := http.NewRequest("GET", "https://uss.ksyun.com/m/uss/api/v2/checklogin", nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cookie", cookies)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check auth"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read response"})
		return
	}

	// 解析用户信息
	var userData map[string]interface{}
	if err := json.Unmarshal(body, &userData); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse user data"})
		return
	}

	// 返回用户信息
	c.JSON(http.StatusOK, userData)
}

// OIDCTokenExchange 处理OIDC token交换
func (h *Handler) OIDCTokenExchange(c *gin.Context) {
	var req struct {
		Code        string `json:"code" binding:"required"`
		RedirectURI string `json:"redirect_uri" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		fmt.Printf("OIDC Token Exchange - Invalid request: %v\n", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// OIDC配置
	clientID := "codebuddy"
	clientSecret := "e11cda4fdd2f6d24cce9b97feeadd4b4"
	tokenEndpoint := "https://oidc-public.ksyun.com:443/token"

	// 准备token交换请求
	formData := fmt.Sprintf("grant_type=authorization_code&code=%s&redirect_uri=%s&client_id=%s&client_secret=%s",
		req.Code, req.RedirectURI, clientID, clientSecret)

	fmt.Printf("OIDC Token Exchange - Starting...\n")
	fmt.Printf("  URL: %s\n", tokenEndpoint)
	fmt.Printf("  Code: %s (length: %d)\n", req.Code, len(req.Code))
	fmt.Printf("  RedirectURI: %s\n", req.RedirectURI)
	fmt.Printf("  ClientID: %s\n", clientID)
	fmt.Printf("  Timestamp: %s\n", time.Now().Format(time.RFC3339))

	tokenReq, err := http.NewRequest("POST", tokenEndpoint, bytes.NewBufferString(formData))
	if err != nil {
		fmt.Printf("OIDC Token Exchange - Failed to create request: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create token request"})
		return
	}

	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenReq.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}

	fmt.Printf("OIDC Token Exchange - Sending request to %s\n", tokenEndpoint)
	resp, err := client.Do(tokenReq)
	if err != nil {
		fmt.Printf("OIDC Token Exchange - Network error: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to exchange token",
			"details": err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("OIDC Token Exchange - Failed to read response: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read token response"})
		return
	}

	fmt.Printf("OIDC Token Exchange - Response received:\n")
	fmt.Printf("  Status: %d\n", resp.StatusCode)
	fmt.Printf("  Headers: %v\n", resp.Header)
	fmt.Printf("  Body: %s\n", string(body))

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("OIDC Token Exchange - Failed with status %d\n", resp.StatusCode)

		// 尝试解析错误响应
		var errorResp map[string]interface{}
		if err := json.Unmarshal(body, &errorResp); err == nil {
			fmt.Printf("OIDC Token Exchange - Parsed error: %v\n", errorResp)
		}

		// 特殊处理授权码重复使用的情况
		var errorMessage string
		if resp.StatusCode == 400 {
			if errorResp != nil {
				if errorType, ok := errorResp["error"].(string); ok {
					if errorType == "invalid_grant" {
						errorMessage = "授权码已过期或已被使用，请重新登录"
					} else {
						errorMessage = fmt.Sprintf("OIDC错误: %s", errorType)
					}
				} else {
					errorMessage = "授权验证失败，请重新登录"
				}
			} else {
				errorMessage = "授权验证失败，请重新登录"
			}
		} else {
			errorMessage = fmt.Sprintf("OIDC服务错误 (%d)，请稍后重试", resp.StatusCode)
		}

		c.JSON(http.StatusBadRequest, gin.H{
			"error":       errorMessage,
			"details":     string(body),
			"status_code": resp.StatusCode,
		})
		return
	}

	fmt.Printf("OIDC Token Exchange - Success!\n")

	// 解析token响应
	var tokenResponse map[string]interface{}
	if err := json.Unmarshal(body, &tokenResponse); err != nil {
		fmt.Printf("OIDC Token Exchange - Failed to parse response: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse token response"})
		return
	}

	fmt.Printf("OIDC Token Exchange - Parsed response: %v\n", tokenResponse)
	c.JSON(http.StatusOK, tokenResponse)
}

// SyncEmployeeData 手动触发员工数据同步
func (h *Handler) SyncEmployeeData(c *gin.Context) {
	fmt.Println("Starting employee data sync...")

	// 调用员工数据同步函数
	if err := h.syncEmployeeData(); err != nil {
		fmt.Printf("Employee sync failed: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to sync employee data",
			"details": err.Error(),
		})
		return
	}

	// 获取同步后的用户总数
	var totalUsers int
	err := h.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&totalUsers)
	if err != nil {
		totalUsers = 0
	}

	fmt.Println("Employee data sync completed successfully")
	c.JSON(http.StatusOK, gin.H{
		"message":    "Employee data sync completed successfully",
		"totalUsers": totalUsers,
		"timestamp":  time.Now().Format(time.RFC3339),
	})
}

// syncEmployeeData 员工数据同步逻辑，包含删除离职员工
func (h *Handler) syncEmployeeData() error {
	const maxRetries = 3
	const retryDelay = time.Minute

	var employeeResp models.EmployeeResponse
	var err error

	// 重试机制
	for attempt := 1; attempt <= maxRetries; attempt++ {
		fmt.Printf("Attempting to fetch employee data (attempt %d/%d)\n", attempt, maxRetries)

		employeeResp, err = h.fetchEmployeeData()
		if err == nil {
			break
		}

		fmt.Printf("Attempt %d failed: %v\n", attempt, err)
		if attempt < maxRetries {
			fmt.Printf("Retrying in %v...\n", retryDelay)
			time.Sleep(retryDelay)
		}
	}

	if err != nil {
		return fmt.Errorf("failed to fetch employee data after %d attempts: %w", maxRetries, err)
	}

	// 处理员工数据
	employees, exists := employeeResp.EmployeeList["28508728"]
	if !exists {
		return fmt.Errorf("department 28508728 not found in response")
	}

	fmt.Printf("Processing %d employees from API\n", len(employees))

	// 1. 获取当前数据库中的所有用户ID
	rows, err := h.db.Query("SELECT id FROM users")
	if err != nil {
		return fmt.Errorf("failed to query existing users: %w", err)
	}
	defer rows.Close()

	existingUserIDs := make(map[string]bool)
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			continue
		}
		existingUserIDs[userID] = true
	}

	// 2. 创建API返回的员工ID集合
	apiEmployeeIDs := make(map[string]bool)
	for _, employee := range employees {
		userID := strconv.Itoa(employee.EmployeeID)
		apiEmployeeIDs[userID] = true
	}

	// 3. 更新或插入员工数据
	var updatedCount, insertedCount int
	for _, employee := range employees {
		if err := h.insertEmployee(employee); err != nil {
			fmt.Printf("Failed to upsert employee %d: %v\n", employee.EmployeeID, err)
			continue
		}
		userID := strconv.Itoa(employee.EmployeeID)
		if existingUserIDs[userID] {
			updatedCount++
		} else {
			insertedCount++
		}
	}

	// 4. 删除已离职的员工（在数据库中但不在API返回中）
	var deletedCount int
	for userID := range existingUserIDs {
		if !apiEmployeeIDs[userID] {
			_, err := h.db.Exec("DELETE FROM users WHERE id = $1", userID)
			if err != nil {
				fmt.Printf("Failed to delete user %s: %v\n", userID, err)
				continue
			}
			fmt.Printf("Deleted resigned employee: %s\n", userID)
			deletedCount++
		}
	}

	fmt.Printf("Sync completed - Inserted: %d, Updated: %d, Deleted: %d, Total: %d\n",
		insertedCount, updatedCount, deletedCount, len(employees))
	return nil
}

// JWTLogin JWT登录端点，集成OIDC验证并生成JWT token
func (h *Handler) JWTLogin(c *gin.Context) {
	var req struct {
		AccessToken string `json:"access_token" binding:"required"`
		UserInfo    struct {
			ID    string `json:"id"`
			Email string `json:"email"`
			Name  string `json:"name"`
		} `json:"user_info"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid_request",
			"message": "请提供有效的访问令牌和用户信息",
			"details": err.Error(),
		})
		return
	}

	// 这里可以添加对OIDC access token的验证逻辑
	// 目前暂时信任前端传来的用户信息
	if req.UserInfo.ID == "" || req.UserInfo.Email == "" || req.UserInfo.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid_user_info",
			"message": "用户信息不完整，请重新登录",
		})
		return
	}

	// 生成JWT token
	token, err := middleware.GenerateToken(req.UserInfo.ID, req.UserInfo.Email, req.UserInfo.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "token_generation_failed",
			"message": "生成访问令牌失败，请稍后重试",
			"details": err.Error(),
		})
		return
	}

	// 返回JWT token
	c.JSON(http.StatusOK, gin.H{
		"access_token": token,
		"token_type":   "Bearer",
		"expires_in":   86400, // 24小时
		"user_info": gin.H{
			"id":    req.UserInfo.ID,
			"email": req.UserInfo.Email,
			"name":  req.UserInfo.Name,
		},
		"message": "登录成功",
	})
}

// GetMockUser 开发模式专用：获取模拟用户（仅用于本地开发）
func (h *Handler) GetMockUser(c *gin.Context) {
	// 模拟用户陈楠的信息
	mockUser := map[string]interface{}{
		"id":        "22231",
		"name":      "陈楠",
		"email":     "chennan1@kingsoft.com",
		"avatarUrl": "https://picsum.photos/seed/22231/40/40",
		"deptId":    28508729,
		"deptName":  "前端开发部",
	}

	c.JSON(http.StatusOK, mockUser)
}

// GetDevProjects 开发模式专用：获取项目数据（不需要认证）
func (h *Handler) GetDevProjects(c *gin.Context) {
	// 复用现有的获取项目逻辑
	h.GetProjects(c)
}

// GetDevUsers 开发模式专用：获取用户数据（不需要认证）
func (h *Handler) GetDevUsers(c *gin.Context) {
	// 复用现有的获取用户逻辑
	h.GetUsers(c)
}

// GetDevOkrSets 开发模式专用：获取OKR数据（不需要认证）
func (h *Handler) GetDevOkrSets(c *gin.Context) {
	// 复用现有的获取OKR逻辑
	h.GetOkrSets(c)
}

// CreateDevProject 开发模式专用：创建项目（不需要认证）
func (h *Handler) CreateDevProject(c *gin.Context) {
	// 复用现有的创建项目逻辑
	h.CreateProject(c)
}

// UpdateDevProject 开发模式专用：更新项目（不需要认证）
func (h *Handler) UpdateDevProject(c *gin.Context) {
	// 复用现有的更新项目逻辑
	h.UpdateProject(c)
}

// DeleteDevProject 开发模式专用：删除项目（不需要认证）
func (h *Handler) DeleteDevProject(c *gin.Context) {
	// 复用现有的删除项目逻辑
	h.DeleteProject(c)
}

// CreateDevOkrSet 开发模式专用：创建OKR集合（不需要认证）
func (h *Handler) CreateDevOkrSet(c *gin.Context) {
	// 复用现有的创建OKR逻辑
	h.CreateOkrSet(c)
}

// UpdateDevOkrSet 开发模式专用：更新OKR集合（不需要认证）
func (h *Handler) UpdateDevOkrSet(c *gin.Context) {
	// 复用现有的更新OKR逻辑
	h.UpdateOkrSet(c)
}

// PerformDevWeeklyRollover 开发模式专用：执行周度滚动（不需要认证）
func (h *Handler) PerformDevWeeklyRollover(c *gin.Context) {
	// 复用现有的周度滚动逻辑
	h.PerformWeeklyRollover(c)
}
