package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"project-management-backend/internal/ai"
	"project-management-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
)

// GetWeeklyReports 获取周报列表
func (h *Handler) GetWeeklyReports(c *gin.Context) {
	query := `
		SELECT id, week_year, week_number, start_date, end_date, 
		       status, content, summary, created_at, updated_at, generated_by
		FROM weekly_reports
		ORDER BY week_year DESC, week_number DESC
	`

	rows, err := h.db.Query(query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var reports []models.WeeklyReport = make([]models.WeeklyReport, 0)
	for rows.Next() {
		var r models.WeeklyReport
		var contentJSON []byte
		err := rows.Scan(
			&r.ID, &r.WeekYear, &r.WeekNumber, &r.StartDate, &r.EndDate,
			&r.Status, &contentJSON, &r.Summary, &r.CreatedAt, &r.UpdatedAt, &r.GeneratedBy,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if len(contentJSON) > 0 {
			json.Unmarshal(contentJSON, &r.Content)
		}
		reports = append(reports, r)
	}

	c.JSON(http.StatusOK, reports)
}

// GetWeeklyReportByWeek 获取指定周的周报
func (h *Handler) GetWeeklyReportByWeek(c *gin.Context) {
	year, _ := strconv.Atoi(c.Param("year"))
	week, _ := strconv.Atoi(c.Param("week"))

	var r models.WeeklyReport
	var contentJSON []byte

	query := `
		SELECT id, week_year, week_number, start_date, end_date,
		       status, content, summary, created_at, updated_at, generated_by
		FROM weekly_reports WHERE week_year = $1 AND week_number = $2
	`
	err := h.db.QueryRow(query, year, week).Scan(
		&r.ID, &r.WeekYear, &r.WeekNumber, &r.StartDate, &r.EndDate,
		&r.Status, &contentJSON, &r.Summary, &r.CreatedAt, &r.UpdatedAt, &r.GeneratedBy,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "周报不存在"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(contentJSON) > 0 {
		json.Unmarshal(contentJSON, &r.Content)
	}

	c.JSON(http.StatusOK, r)
}

// GenerateWeeklyReport 生成周报
func (h *Handler) GenerateWeeklyReport(c *gin.Context) {
	// 获取当前周信息（ISO 年 / ISO 周号：跨年边界的日历年可能与 ISO 年不同）
	now := time.Now()
	isoYear, weekNum := now.ISOWeek()

	// 计算本周的起止日期
	startOfWeek := now.AddDate(0, 0, -int(now.Weekday())+1) // 周一
	if now.Weekday() == 0 {
		startOfWeek = now.AddDate(0, 0, -6) // 周日则回退到上周一
	}
	endOfWeek := startOfWeek.AddDate(0, 0, 6)

	// 查询本周的所有项目数据
	projects, okrs, err := h.fetchProjectsAndOkrsForWeek(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 构建周报内容
	content := h.buildWeeklyReportContent(projects, okrs, startOfWeek, endOfWeek)

	// 调用AI模型生成总结
	summary, err := h.generateAISummary(content, isoYear, weekNum, startOfWeek, endOfWeek)
	if err != nil {
		// AI调用失败时仍然保存结构数据
		summary = "AI总结生成失败，请手动编辑补充。"
	}

	// 检查是否已存在本周周报
	var existingID string
	checkQuery := `SELECT id FROM weekly_reports WHERE week_year = $1 AND week_number = $2`
	err = h.db.QueryRow(checkQuery, isoYear, weekNum).Scan(&existingID)

	reportID := fmt.Sprintf("wr%d%02d", isoYear, weekNum)
	contentJSON, _ := json.Marshal(content)

	if err == sql.ErrNoRows {
		// 创建新周报
		insertQuery := `
			INSERT INTO weekly_reports (id, week_year, week_number, start_date, end_date, status, content, summary, generated_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		`
		_, err = h.db.Exec(insertQuery, reportID, isoYear, weekNum,
			startOfWeek.Format("2006-01-02"), endOfWeek.Format("2006-01-02"),
			"generated", contentJSON, summary, "system")
	} else {
		// 更新现有周报
		updateQuery := `
			UPDATE weekly_reports SET content = $1, summary = $2, status = $3, updated_at = $4, generated_by = $5
			WHERE id = $6
		`
		_, err = h.db.Exec(updateQuery, contentJSON, summary, "generated", time.Now().Format(time.RFC3339), "system", existingID)
		reportID = existingID
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 返回生成的周报
	c.JSON(http.StatusOK, models.WeeklyReport{
		ID:          reportID,
		WeekYear:    isoYear,
		WeekNumber:  weekNum,
		StartDate:   startOfWeek.Format("2006-01-02"),
		EndDate:     endOfWeek.Format("2006-01-02"),
		Status:      "generated",
		Content:     content,
		Summary:     summary,
		GeneratedBy: "system",
	})
}

// UpdateWeeklyReport 更新周报
func (h *Handler) UpdateWeeklyReport(c *gin.Context) {
	reportID := c.Param("reportId")

	var req struct {
		Content *models.WeeklyReportContent `json:"content,omitempty"`
		Summary *string                     `json:"summary,omitempty"`
		Status  *string                     `json:"status,omitempty"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 先查询现有数据
	var existing models.WeeklyReport
	var contentJSON []byte
	query := `SELECT id, content, summary, status FROM weekly_reports WHERE id = $1`
	err := h.db.QueryRow(query, reportID).Scan(&existing.ID, &contentJSON, &existing.Summary, &existing.Status)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "周报不存在"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 更新字段
	if req.Content != nil {
		contentJSON, _ = json.Marshal(req.Content)
		existing.Content = *req.Content
	} else if len(contentJSON) > 0 {
		json.Unmarshal(contentJSON, &existing.Content)
	}

	if req.Summary != nil {
		existing.Summary = *req.Summary
	}
	if req.Status != nil {
		existing.Status = *req.Status
	}

	updateQuery := `
		UPDATE weekly_reports SET content = $1, summary = $2, status = $3, updated_at = $4
		WHERE id = $5
	`
	_, err = h.db.Exec(updateQuery, contentJSON, existing.Summary, existing.Status, time.Now().Format(time.RFC3339), reportID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, existing)
}

// GetDevWeeklyReports 开发模式专用
func (h *Handler) GetDevWeeklyReports(c *gin.Context) {
	h.GetWeeklyReports(c)
}

// GetDevWeeklyReportByWeek 开发模式专用
func (h *Handler) GetDevWeeklyReportByWeek(c *gin.Context) {
	h.GetWeeklyReportByWeek(c)
}

// GenerateDevWeeklyReport 开发模式专用
func (h *Handler) GenerateDevWeeklyReport(c *gin.Context) {
	h.GenerateWeeklyReport(c)
}

// UpdateDevWeeklyReport 开发模式专用
func (h *Handler) UpdateDevWeeklyReport(c *gin.Context) {
	h.UpdateWeeklyReport(c)
}

// RegenerateWeeklyReport 重新生成周报：先将当前内容归档为历史版本，再覆盖写入最新结果
func (h *Handler) RegenerateWeeklyReport(c *gin.Context) {
	reportID := c.Param("reportId")

	// 1. 查询当前周报
	var existing models.WeeklyReport
	var existingContent []byte
	selectQuery := `
		SELECT id, week_year, week_number, start_date, end_date, status, content, summary, generated_by
		FROM weekly_reports WHERE id = $1
	`
	err := h.db.QueryRow(selectQuery, reportID).Scan(
		&existing.ID, &existing.WeekYear, &existing.WeekNumber, &existing.StartDate, &existing.EndDate,
		&existing.Status, &existingContent, &existing.Summary, &existing.GeneratedBy,
	)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "周报不存在"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 2. 计算下一个版本号（当前归档数量 + 1）
	var versionCount int
	if err := h.db.QueryRow(`SELECT COUNT(*) FROM weekly_report_versions WHERE report_id = $1`, reportID).Scan(&versionCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	nextVersionNo := versionCount + 1

	// 3. 归档当前内容为历史版本
	versionID := fmt.Sprintf("%s-v%d-%d", reportID, nextVersionNo, time.Now().Unix())
	insertVer := `
		INSERT INTO weekly_report_versions (id, report_id, week_year, week_number, version_no, content, summary, generated_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	if _, err := h.db.Exec(insertVer, versionID, reportID, existing.WeekYear, existing.WeekNumber,
		nextVersionNo, existingContent, existing.Summary, existing.GeneratedBy); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "归档历史版本失败: " + err.Error()})
		return
	}

	// 4. 重新抓取最新项目/OKR，并构建新内容
	projects, okrs, err := h.fetchProjectsAndOkrsForWeek(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	content := h.buildWeeklyReportContent(projects, okrs, parseDateOrToday(existing.StartDate), parseDateOrToday(existing.EndDate))
	summary, aerr := h.generateAISummary(content, existing.WeekYear, existing.WeekNumber,
		parseDateOrToday(existing.StartDate), parseDateOrToday(existing.EndDate))
	if aerr != nil {
		summary = "AI总结生成失败，请手动编辑补充。"
	}

	// 5. 覆盖更新主表（重置状态为 generated）
	newContentJSON, _ := json.Marshal(content)
	updateQuery := `
		UPDATE weekly_reports SET content = $1, summary = $2, status = $3, updated_at = $4, generated_by = $5
		WHERE id = $6
	`
	if _, err := h.db.Exec(updateQuery, newContentJSON, summary, "generated", time.Now().Format(time.RFC3339), "system", reportID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":             reportID,
		"weekYear":       existing.WeekYear,
		"weekNumber":     existing.WeekNumber,
		"startDate":      existing.StartDate,
		"endDate":        existing.EndDate,
		"status":         "generated",
		"content":        content,
		"summary":        summary,
		"generatedBy":    "system",
		"archivedVersion": gin.H{
			"id":        versionID,
			"versionNo": nextVersionNo,
		},
	})
}

// GetWeeklyReportVersions 按 reportId 列出所有历史版本（不含完整 content，避免 payload 过大）
func (h *Handler) GetWeeklyReportVersions(c *gin.Context) {
	reportID := c.Param("reportId")
	rows, err := h.db.Query(`
		SELECT id, report_id, week_year, week_number, version_no, summary, generated_by, archived_at
		FROM weekly_report_versions
		WHERE report_id = $1
		ORDER BY version_no DESC
	`, reportID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	list := make([]models.WeeklyReportVersion, 0)
	for rows.Next() {
		var v models.WeeklyReportVersion
		if err := rows.Scan(&v.ID, &v.ReportID, &v.WeekYear, &v.WeekNumber, &v.VersionNo, &v.Summary, &v.GeneratedBy, &v.ArchivedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		list = append(list, v)
	}
	c.JSON(http.StatusOK, list)
}

// GetWeeklyReportVersionByID 返回某个历史版本的完整内容
func (h *Handler) GetWeeklyReportVersionByID(c *gin.Context) {
	versionID := c.Param("versionId")
	var v models.WeeklyReportVersion
	var contentJSON []byte
	err := h.db.QueryRow(`
		SELECT id, report_id, week_year, week_number, version_no, content, summary, generated_by, archived_at
		FROM weekly_report_versions WHERE id = $1
	`, versionID).Scan(&v.ID, &v.ReportID, &v.WeekYear, &v.WeekNumber, &v.VersionNo, &contentJSON, &v.Summary, &v.GeneratedBy, &v.ArchivedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "历史版本不存在"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(contentJSON) > 0 {
		json.Unmarshal(contentJSON, &v.Content)
	}
	c.JSON(http.StatusOK, v)
}

// RegenerateDevWeeklyReport 开发模式重新生成
func (h *Handler) RegenerateDevWeeklyReport(c *gin.Context) {
	h.RegenerateWeeklyReport(c)
}

// GetDevWeeklyReportVersions 开发模式版本列表
func (h *Handler) GetDevWeeklyReportVersions(c *gin.Context) {
	h.GetWeeklyReportVersions(c)
}

// GetDevWeeklyReportVersionByID 开发模式版本详情
func (h *Handler) GetDevWeeklyReportVersionByID(c *gin.Context) {
	h.GetWeeklyReportVersionByID(c)
}

// fetchProjectsAndOkrsForWeek 查询本周的所有项目和OKR数据
func (h *Handler) fetchProjectsAndOkrsForWeek(c *gin.Context) ([]models.Project, []models.OkrSet, error) {
	// 查询所有项目（带本周进展）
	projectQuery := `
		SELECT id, name, system, priority, business_problem, key_result_ids, weekly_update,
		       last_week_update, status, proposal_date, launch_date, created_at, followers,
		       product_managers, backend_developers, frontend_developers, qa_testers
		FROM projects
		WHERE weekly_update IS NOT NULL AND weekly_update != ''
		ORDER BY created_at DESC
	`
	rows, err := h.db.Query(projectQuery)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var projects []models.Project
	for rows.Next() {
		var p models.Project
		var keyResultIdsStr, followersStr sql.NullString
		var productManagers, backendDevelopers, frontendDevelopers, qaTesters []byte

		err := rows.Scan(
			&p.ID, &p.Name, &p.System, &p.Priority, &p.BusinessProblem, &keyResultIdsStr,
			&p.WeeklyUpdate, &p.LastWeekUpdate, &p.Status,
			&p.ProposalDate, &p.LaunchDate, &p.CreatedAt, &followersStr,
			&productManagers, &backendDevelopers, &frontendDevelopers, &qaTesters,
		)
		if err != nil {
			return nil, nil, err
		}

		// 兼容SQLite和PostgreSQL格式
		if keyResultIdsStr.Valid && keyResultIdsStr.String != "" {
			if strings.HasPrefix(keyResultIdsStr.String, "[") {
				json.Unmarshal([]byte(keyResultIdsStr.String), &p.KeyResultIds)
			} else {
				var arr pq.StringArray
				arr.Scan(keyResultIdsStr.String)
				p.KeyResultIds = []string(arr)
			}
		}
		if followersStr.Valid && followersStr.String != "" {
			if strings.HasPrefix(followersStr.String, "[") {
				json.Unmarshal([]byte(followersStr.String), &p.Followers)
			} else {
				var arr pq.StringArray
				arr.Scan(followersStr.String)
				p.Followers = []string(arr)
			}
		}

		json.Unmarshal(productManagers, &p.ProductManagers)
		json.Unmarshal(backendDevelopers, &p.BackendDevelopers)
		json.Unmarshal(frontendDevelopers, &p.FrontendDevelopers)
		json.Unmarshal(qaTesters, &p.QaTesters)

		if p.ProductManagers == nil { p.ProductManagers = []models.TeamMember{} }
		if p.BackendDevelopers == nil { p.BackendDevelopers = []models.TeamMember{} }
		if p.FrontendDevelopers == nil { p.FrontendDevelopers = []models.TeamMember{} }
		if p.QaTesters == nil { p.QaTesters = []models.TeamMember{} }

		projects = append(projects, p)
	}

	// 查询OKR数据：仅使用当前周期（避免不同周期的 KR ID 重复相互覆盖）
	// 当前周期 = {当前年份}-H1（1-6 月） / H2（7-12 月）
	bj, _ := time.LoadLocation("Asia/Shanghai")
	now := time.Now().In(bj)
	half := "H1"
	if int(now.Month()) >= 7 {
		half = "H2"
	}
	currentPeriodID := fmt.Sprintf("%d-%s", now.Year(), half)

	var okrSets []models.OkrSet
	okrRows, err := h.db.Query(`SELECT period_id, period_name, okrs FROM okr_sets WHERE period_id = $1`, currentPeriodID)
	if err != nil {
		return projects, nil, err
	}
	for okrRows.Next() {
		var o models.OkrSet
		var okrsJSON []byte
		if err := okrRows.Scan(&o.PeriodID, &o.PeriodName, &okrsJSON); err != nil {
			okrRows.Close()
			return projects, nil, err
		}
		if len(okrsJSON) > 0 {
			json.Unmarshal(okrsJSON, &o.Okrs)
		}
		okrSets = append(okrSets, o)
	}
	okrRows.Close()

	// 当前周期没有 OKR 配置时，回退到最新一个周期，避免周报完全空
	if len(okrSets) == 0 {
		fallback, ferr := h.db.Query(`SELECT period_id, period_name, okrs FROM okr_sets ORDER BY period_id DESC LIMIT 1`)
		if ferr == nil {
			for fallback.Next() {
				var o models.OkrSet
				var okrsJSON []byte
				if err := fallback.Scan(&o.PeriodID, &o.PeriodName, &okrsJSON); err == nil {
					if len(okrsJSON) > 0 {
						json.Unmarshal(okrsJSON, &o.Okrs)
					}
					okrSets = append(okrSets, o)
				}
			}
			fallback.Close()
		}
	}

	return projects, okrSets, nil
}

// buildWeeklyReportContent 按OKR维度构建周报内容
func (h *Handler) buildWeeklyReportContent(projects []models.Project, okrSets []models.OkrSet, weekStart, weekEnd time.Time) models.WeeklyReportContent {
	// 预加载用户姓名映射
	userNames := loadUserNames(h.db)

	// 构建KR ID到OKR信息的映射
	krToOkr := make(map[string]*models.OkrSet)
	krToKrDesc := make(map[string]string)
	krToObjective := make(map[string]string)

	for i := range okrSets {
		for j := range okrSets[i].Okrs {
			okr := &okrSets[i].Okrs[j]
			for k := range okr.KeyResults {
				kr := okr.KeyResults[k]
				krToOkr[kr.ID] = &okrSets[i]
				krToKrDesc[kr.ID] = kr.Description
				krToObjective[kr.ID] = okr.Objective
			}
		}
	}

	// 按KR ID归集项目
	krProjects := make(map[string][]models.Project)
	noKrProjects := []models.Project{}

	for _, p := range projects {
		hasKr := false
		for _, krId := range p.KeyResultIds {
			if krId != "" {
				krProjects[krId] = append(krProjects[krId], p)
				hasKr = true
			}
		}
		if !hasKr {
			noKrProjects = append(noKrProjects, p)
		}
	}

	// 构建周报内容
	okrSummaries := make([]models.OkrWeeklySummary, 0)
	processedOkr := make(map[string]bool)

	// 先处理有KR关联的项目
	for krId, projs := range krProjects {
		objective := krToObjective[krId]
		if objective == "" {
			objective = "未关联目标"
		}

		okrId := ""
		if okrSet := krToOkr[krId]; okrSet != nil {
			for _, okr := range okrSet.Okrs {
				for _, kr := range okr.KeyResults {
					if kr.ID == krId {
						okrId = okr.ID
						break
					}
				}
			}
		}
		if okrId == "" {
			okrId = "unknown"
		}

		okrKey := okrId + "|" + objective
		if processedOkr[okrKey] {
			// 已存在该OKR，追加KR
			for i := range okrSummaries {
				if okrSummaries[i].OkrID == okrId {
					okrSummaries[i].KrSummaries = append(okrSummaries[i].KrSummaries, models.KrWeeklySummary{
						KrID:             krId,
						KrDesc:           krToKrDesc[krId],
						ProjectSummaries: buildProjectSummaries(projs, userNames, weekStart, weekEnd),
					})
					break
				}
			}
		} else {
			processedOkr[okrKey] = true
			okrSummaries = append(okrSummaries, models.OkrWeeklySummary{
				OkrID:     okrId,
				Objective: objective,
				KrSummaries: []models.KrWeeklySummary{
					{
						KrID:             krId,
						KrDesc:           krToKrDesc[krId],
						ProjectSummaries: buildProjectSummaries(projs, userNames, weekStart, weekEnd),
					},
				},
			})
		}
	}

	// 处理未关联 KR 的项目：只保留优先级为“临时重要需求”的项目
	urgentProjects := []models.Project{}
	for _, p := range noKrProjects {
		if p.Priority == "临时重要需求" {
			urgentProjects = append(urgentProjects, p)
		}
	}

	if len(urgentProjects) > 0 {
		// 使用 "zz-" 前缀确保该分组排序在所有 OKR 之后
		okrSummaries = append(okrSummaries, models.OkrWeeklySummary{
			OkrID:     "zz-urgent",
			Objective: "临时重要需求",
			KrSummaries: []models.KrWeeklySummary{
				{
					KrID:             "zz-urgent-kr",
					KrDesc:           "本周推进事项",
					ProjectSummaries: buildProjectSummaries(urgentProjects, userNames, weekStart, weekEnd),
				},
			},
		})
	}

	return models.WeeklyReportContent{OkrSummaries: okrSummaries}
}

// buildProjectSummaries 把项目转换为周报条目：
// - ProductManagers 字段由 user id 解析为真实姓名
// - v4.3：增加原始数据字段（System/BusinessProblem/LastWeekUpdate/LaunchDate/ScheduleText/MemberAlerts/IsDrivingOnly），供后续 AI 入参使用
// - 不再单项目调 LLM；WeeklyUpdate 直接取项目原文纯文本，由整体 AI 负责文本生成
func buildProjectSummaries(projects []models.Project, userNames map[string]string, weekStart, weekEnd time.Time) []models.ProjectWeeklySummary {
	summaries := make([]models.ProjectWeeklySummary, 0, len(projects))
	deref := func(s *string) string {
		if s == nil {
			return ""
		}
		return *s
	}
	for _, p := range projects {
		pmNames := []string{}
		for _, pm := range p.ProductManagers {
			if pm.UserID == "" {
				continue
			}
			if name, ok := userNames[pm.UserID]; ok && name != "" {
				pmNames = append(pmNames, name)
			} else {
				pmNames = append(pmNames, pm.UserID)
			}
		}
		isDriving := isDrivingOnlyStatus(p.Status)
		scheduleText := ""
		alerts := []string{}
		if !isDriving {
			scheduleText = buildProjectScheduleText(p, userNames)
			alerts = buildProjectMemberAlerts(p, weekEnd, userNames)
		}

		summaries = append(summaries, models.ProjectWeeklySummary{
			ProjectID:       p.ID,
			ProjectName:     p.Name,
			WeeklyUpdate:    stripHTML(deref(p.WeeklyUpdate)),
			Status:          p.Status,
			Priority:        p.Priority,
			ProductManagers: pmNames,
			System:          deref(p.System),
			BusinessProblem: stripHTML(deref(p.BusinessProblem)),
			LastWeekUpdate:  stripHTML(deref(p.LastWeekUpdate)),
			LaunchDate:      deref(p.LaunchDate),
			ScheduleText:    scheduleText,
			MemberAlerts:    alerts,
			IsDrivingOnly:   isDriving,
		})
	}
	_ = weekStart // 预留：后续可用于过滤仅本周有排期的项目
	return summaries
}

// loadUserNames 从 users 表加载 id -> name 映射
func loadUserNames(db *sql.DB) map[string]string {
	names := make(map[string]string)
	rows, err := db.Query("SELECT id, name FROM users")
	if err != nil {
		fmt.Printf("[WeeklyReport] loadUserNames failed: %v\n", err)
		return names
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err == nil {
			names[id] = name
		}
	}
	return names
}

// generateAISummary 基于完整周报内容调用 ai.GenerateWeeklySummary（glm-5.1，按 OKR 分批）
func (h *Handler) generateAISummary(content models.WeeklyReportContent, year, weekNum int, startOfWeek, endOfWeek time.Time) (string, error) {
	input := convertContentToAIInput(content, ai.WeekRange{
		Year:       year,
		WeekNumber: weekNum,
		Start:      startOfWeek.Format("2006-01-02"),
		End:        endOfWeek.Format("2006-01-02"),
	})
	return ai.GenerateWeeklySummary(input)
}

// ---------- v4.3 新增 helpers ----------

func isDrivingOnlyStatus(s string) bool {
	return strings.TrimSpace(s) == "项目进行中"
}

func parseDateOrToday(s string) time.Time {
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t
	}
	return time.Now()
}

// buildProjectScheduleText 按角色拼展排期摘要：“后端: 张三 04.01~04.07; 前端: 李四 04.01~04.07”
func buildProjectScheduleText(p models.Project, userNames map[string]string) string {
	parts := []string{}
	appendRole := func(label string, role models.Role) {
		segs := []string{}
		for _, m := range role {
			if m.UserID == "" {
				continue
			}
			name := userNames[m.UserID]
			if name == "" {
				name = m.UserID
			}
			var s, e string
			if len(m.TimeSlots) > 0 {
				// 取最早 Start / 最晚 End
				s = m.TimeSlots[0].StartDate
				e = m.TimeSlots[0].EndDate
				for _, ts := range m.TimeSlots[1:] {
					if ts.StartDate != "" && ts.StartDate < s {
						s = ts.StartDate
					}
					if ts.EndDate != "" && ts.EndDate > e {
						e = ts.EndDate
					}
				}
			} else if m.StartDate != nil && m.EndDate != nil {
				s = *m.StartDate
				e = *m.EndDate
			}
			if s != "" && e != "" {
				segs = append(segs, fmt.Sprintf("%s %s~%s", name, shortMD(s), shortMD(e)))
			} else {
				segs = append(segs, name)
			}
		}
		if len(segs) > 0 {
			parts = append(parts, label+": "+strings.Join(segs, ", "))
		}
	}
	appendRole("后端", p.BackendDevelopers)
	appendRole("前端", p.FrontendDevelopers)
	appendRole("测试", p.QaTesters)
	return strings.Join(parts, "; ")
}

// shortMD 把 YYYY-MM-DD 缩成 MM.DD，失败时原样返回
func shortMD(ymd string) string {
	if len(ymd) == 10 && ymd[4] == '-' && ymd[7] == '-' {
		return ymd[5:7] + "." + ymd[8:10]
	}
	return ymd
}

// buildProjectMemberAlerts 项目级排期缺失提示：本周结束后14天仍无排期的成员
func buildProjectMemberAlerts(p models.Project, weekEnd time.Time, userNames map[string]string) []string {
	threshold := weekEnd.AddDate(0, 0, -14)
	chk := func(label string, role models.Role) []string {
		alerts := []string{}
		for _, m := range role {
			if m.UserID == "" {
				continue
			}
			name := userNames[m.UserID]
			if name == "" {
				name = m.UserID
			}
			// 找最晚的 EndDate
			latest := ""
			for _, ts := range m.TimeSlots {
				if ts.EndDate > latest {
					latest = ts.EndDate
				}
			}
			if latest == "" && m.EndDate != nil {
				latest = *m.EndDate
			}
			if latest == "" {
				alerts = append(alerts, fmt.Sprintf("⚠️ %s(%s) 排期缺失，请确认推进计划", name, label))
				continue
			}
			if le, err := time.Parse("2006-01-02", latest); err == nil {
				if le.Before(threshold) {
					alerts = append(alerts, fmt.Sprintf("⚠️ %s(%s) 排期截至 %s 后无新排，请确认后续计划", name, label, latest))
				}
			}
		}
		return alerts
	}
	out := []string{}
	out = append(out, chk("后端", p.BackendDevelopers)...)
	out = append(out, chk("前端", p.FrontendDevelopers)...)
	out = append(out, chk("测试", p.QaTesters)...)
	return out
}

// convertContentToAIInput 把 WeeklyReportContent 转换为 ai.WeeklyReportInput。
// 推进型项目（is_driving_only=true）的 ScheduleText 已在 buildProjectSummaries 阶段置空。
func convertContentToAIInput(content models.WeeklyReportContent, wr ai.WeekRange) ai.WeeklyReportInput {
	in := ai.WeeklyReportInput{
		WeekRange:   wr,
		Okrs:        make([]ai.OkrInput, 0, len(content.OkrSummaries)),
		IdleMembers: []ai.IdleMember{}, // v4.3.0 暂不交付全局空闲人员，保留接口
	}
	order := 1
	for _, okr := range content.OkrSummaries {
		if okr.OkrID == "zz-urgent" {
			// 临时重要需求 → urgent_projects。取其唯一 KR 下的项目
			for _, kr := range okr.KrSummaries {
				for _, p := range kr.ProjectSummaries {
					in.UrgentProjects = append(in.UrgentProjects, summaryToAIProject(p))
				}
			}
			continue
		}
		oi := ai.OkrInput{OkrID: okr.OkrID, Objective: okr.Objective, Order: order}
		order++
		krOrder := 1
		for _, kr := range okr.KrSummaries {
			ki := ai.KrInput{KrID: kr.KrID, KrDesc: kr.KrDesc, Order: krOrder}
			krOrder++
			for _, p := range kr.ProjectSummaries {
				ki.Projects = append(ki.Projects, summaryToAIProject(p))
			}
			oi.KrItems = append(oi.KrItems, ki)
		}
		in.Okrs = append(in.Okrs, oi)
	}
	return in
}

func summaryToAIProject(p models.ProjectWeeklySummary) ai.ProjectInput {
	return ai.ProjectInput{
		ID:              p.ProjectID,
		Name:            p.ProjectName,
		System:          p.System,
		Status:          p.Status,
		Priority:        p.Priority,
		BusinessProblem: p.BusinessProblem,
		WeeklyUpdate:    p.WeeklyUpdate,
		LastWeekUpdate:  p.LastWeekUpdate,
		LaunchDate:      p.LaunchDate,
		ScheduleText:    p.ScheduleText,
		MemberAlerts:    p.MemberAlerts,
		IsDrivingOnly:   p.IsDrivingOnly,
	}
}

// htmlTagRegex 兜底剥除 stripHTML 未枚举到的残留标签（<ul>、<li>、<h3>、<span> 等）。
var htmlTagRegex = regexp.MustCompile(`<[^>]+>`)

func stripHTML(html string) string {
	// 简单去除HTML标签
	result := strings.ReplaceAll(html, "<p>", "")
	result = strings.ReplaceAll(result, "</p>", "\n")
	result = strings.ReplaceAll(result, "<strong>", "")
	result = strings.ReplaceAll(result, "</strong>", "")
	result = strings.ReplaceAll(result, "<br>", "\n")
	result = strings.ReplaceAll(result, "<br/>", "\n")
	result = strings.ReplaceAll(result, "<br />", "\n")
	result = strings.ReplaceAll(result, "&nbsp;", " ")
	// 兜底：清除富文本编辑器产生的其它标签
	result = htmlTagRegex.ReplaceAllString(result, "")
	return strings.TrimSpace(result)
}
