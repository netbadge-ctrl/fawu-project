package scheduler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"project-management-backend/internal/ai"
	"project-management-backend/internal/models"

	"github.com/lib/pq"
	"github.com/robfig/cron/v3"
)

func Start(db *sql.DB) {
	// 使用北京时区
	beijing, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		log.Printf("Failed to load Beijing timezone, using UTC: %v", err)
		beijing = time.UTC
	}

	c := cron.New(cron.WithLocation(beijing))

	// 每天上午11:00执行员工数据同步
	c.AddFunc("0 11 * * *", func() {
		log.Println("Starting employee data sync...")
		if err := syncEmployeeData(db); err != nil {
			log.Printf("Employee sync failed: %v", err)
		} else {
			log.Println("Employee data sync completed successfully")
		}
	})

	// 每周一凌晨2点执行周度滚动（北京时间）
	c.AddFunc("0 2 * * 1", func() {
		log.Println("Starting weekly rollover...")
		if err := performWeeklyRollover(db); err != nil {
			log.Printf("Weekly rollover failed: %v", err)
		} else {
			log.Println("Weekly rollover completed successfully")
		}
	})

	// 每周四晚上8点自动生成周报（北京时间）
	c.AddFunc("0 20 * * 4", func() {
		log.Println("Starting weekly report generation...")
		if err := generateWeeklyReport(db); err != nil {
			log.Printf("Weekly report generation failed: %v", err)
		} else {
			log.Println("Weekly report generation completed successfully")
		}
	})

	c.Start()
	log.Println("Scheduler started:")
	log.Println("  - Employee sync: 11:00 AM daily (Beijing time)")
	log.Println("  - Weekly rollover: 02:00 AM every Monday (Beijing time)")
	log.Println("  - Weekly report generation: 08:00 PM every Thursday (Beijing time)")
}

func syncEmployeeData(db *sql.DB) error {
	const maxRetries = 3
	const retryDelay = time.Minute

	var employeeResp models.EmployeeResponse
	var err error

	// 重试机制
	for attempt := 1; attempt <= maxRetries; attempt++ {
		log.Printf("Attempting to fetch employee data (attempt %d/%d)", attempt, maxRetries)

		employeeResp, err = fetchEmployeeData()
		if err == nil {
			break
		}

		log.Printf("Attempt %d failed: %v", attempt, err)
		if attempt < maxRetries {
			log.Printf("Retrying in %v...", retryDelay)
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

	log.Printf("Processing %d employees", len(employees))

	for _, employee := range employees {
		if err := upsertEmployee(db, employee); err != nil {
			log.Printf("Failed to upsert employee %d: %v", employee.EmployeeID, err)
			continue
		}
	}

	log.Printf("Successfully processed %d employees", len(employees))
	return nil
}

func fetchEmployeeData() (models.EmployeeResponse, error) {
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

func upsertEmployee(db *sql.DB, employee models.Employee) error {
	userID := strconv.Itoa(employee.EmployeeID)
	avatarURL := fmt.Sprintf("https://picsum.photos/seed/%d/40/40", employee.EmployeeID)

	// 根据部门ID获取部门名称
	deptName := getDepartmentName(employee.DeptID)

	// 检查用户是否存在
	var exists bool
	checkQuery := "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)"
	err := db.QueryRow(checkQuery, userID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to check user existence: %w", err)
	}

	if exists {
		// 更新现有用户
		updateQuery := "UPDATE users SET name = $1, email = $2, dept_id = $3, dept_name = $4 WHERE id = $5"
		_, err = db.Exec(updateQuery, employee.RealName, employee.Email, employee.DeptID, deptName, userID)
		if err != nil {
			return fmt.Errorf("failed to update user: %w", err)
		}
		log.Printf("Updated user: %s (%s)", employee.RealName, userID)
	} else {
		// 插入新用户
		insertQuery := "INSERT INTO users (id, name, email, avatar_url, dept_id, dept_name) VALUES ($1, $2, $3, $4, $5, $6)"
		_, err = db.Exec(insertQuery, userID, employee.RealName, employee.Email, avatarURL, employee.DeptID, deptName)
		if err != nil {
			return fmt.Errorf("failed to insert user: %w", err)
		}
		log.Printf("Inserted new user: %s (%s)", employee.RealName, userID)
	}

	return nil
}

// getDepartmentName 根据部门ID获取部门名称
func getDepartmentName(deptID int) string {
	// 根据实际的部门ID映射部门名称
	switch deptID {
	case 28508728:
		return "技术部"
	case 28508729:
		return "业务平台产品组"
	case 28509115:
		return "基础平台产品组"
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

// performWeeklyRollover 执行周度滚动：将本周进展复制到上周，并清空本周进展
func performWeeklyRollover(db *sql.DB) error {
	query := `
		UPDATE projects 
		SET last_week_update = weekly_update,
		    weekly_update = ''
		WHERE weekly_update IS NOT NULL AND weekly_update != ''
		RETURNING id
	`

	rows, err := db.Query(query)
	if err != nil {
		return fmt.Errorf("failed to execute rollover query: %w", err)
	}
	defer rows.Close()

	var updatedProjectIds []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			log.Printf("Failed to scan project id: %v", err)
			continue
		}
		updatedProjectIds = append(updatedProjectIds, id)
	}

	log.Printf("Weekly rollover completed - Updated %d projects, cleared weekly_update", len(updatedProjectIds))
	return nil
}

// generateWeeklyReport 自动生成周报
func generateWeeklyReport(db *sql.DB) error {
	now := time.Now()
	_, weekNum := now.ISOWeek()
	year := now.Year()

	// 计算本周的起止日期
	startOfWeek := now.AddDate(0, 0, -int(now.Weekday())+1)
	if now.Weekday() == 0 {
		startOfWeek = now.AddDate(0, 0, -6)
	}
	endOfWeek := startOfWeek.AddDate(0, 0, 6)

	// 查询本周有进展的项目
	projectQuery := `
		SELECT id, name, system, priority, business_problem, key_result_ids, weekly_update,
		       last_week_update, status, proposal_date, launch_date, created_at, followers,
		       product_managers, backend_developers, frontend_developers, qa_testers
		FROM projects
		WHERE weekly_update IS NOT NULL AND weekly_update != ''
		ORDER BY created_at DESC
	`
	rows, err := db.Query(projectQuery)
	if err != nil {
		return fmt.Errorf("failed to query projects: %w", err)
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
			return fmt.Errorf("failed to scan project: %w", err)
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
		projects = append(projects, p)
	}

	if len(projects) == 0 {
		log.Println("No projects with weekly updates found, skipping report generation")
		return nil
	}

	// 查询OKR数据：仅使用当前周期（避免不同周期的 KR ID 重复相互覆盖）
	bj, _ := time.LoadLocation("Asia/Shanghai")
	nowForPeriod := time.Now().In(bj)
	half := "H1"
	if int(nowForPeriod.Month()) >= 7 {
		half = "H2"
	}
	currentPeriodID := fmt.Sprintf("%d-%s", nowForPeriod.Year(), half)

	okrRows, err := db.Query(`SELECT period_id, period_name, okrs FROM okr_sets WHERE period_id = $1`, currentPeriodID)
	if err != nil {
		return fmt.Errorf("failed to query okr sets: %w", err)
	}
	defer okrRows.Close()

	var okrSets []models.OkrSet
	for okrRows.Next() {
		var o models.OkrSet
		var okrsJSON []byte
		if err := okrRows.Scan(&o.PeriodID, &o.PeriodName, &okrsJSON); err != nil {
			continue
		}
		if len(okrsJSON) > 0 {
			json.Unmarshal(okrsJSON, &o.Okrs)
		}
		okrSets = append(okrSets, o)
	}

	// 当前周期没有 OKR 配置时，回退到最新一个周期
	if len(okrSets) == 0 {
		fallback, ferr := db.Query(`SELECT period_id, period_name, okrs FROM okr_sets ORDER BY period_id DESC LIMIT 1`)
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

	// 构建周报内容
	content := buildReportContent(db, projects, okrSets, startOfWeek, endOfWeek)
	contentJSON, _ := json.Marshal(content)

	// 调用AI生成总结
	summary, err := generateAIReportSummary(content, year, weekNum, startOfWeek, endOfWeek)
	if err != nil {
		log.Printf("AI summary generation failed: %v", err)
		summary = "AI总结生成失败，请手动编辑补充。"
	}

	// 保存到数据库
	reportID := fmt.Sprintf("wr%d%02d", year, weekNum)

	var existingID string
	checkQuery := `SELECT id FROM weekly_reports WHERE week_year = $1 AND week_number = $2`
	err = db.QueryRow(checkQuery, year, weekNum).Scan(&existingID)

	if err != nil {
		// 插入新周报
		insertQuery := `
			INSERT INTO weekly_reports (id, week_year, week_number, start_date, end_date, status, content, summary, generated_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		`
		_, err = db.Exec(insertQuery, reportID, year, weekNum,
			startOfWeek.Format("2006-01-02"), endOfWeek.Format("2006-01-02"),
			"generated", contentJSON, summary, "system")
	} else {
		// 更新现有周报
		updateQuery := `
			UPDATE weekly_reports SET content = $1, summary = $2, status = $3, updated_at = $4, generated_by = $5
			WHERE id = $6
		`
		_, err = db.Exec(updateQuery, contentJSON, summary, "generated", time.Now().Format(time.RFC3339), "system", existingID)
	}

	if err != nil {
		return fmt.Errorf("failed to save weekly report: %w", err)
	}

	log.Printf("Weekly report generated for week %d-%d with %d projects", year, weekNum, len(projects))
	return nil
}

// buildReportContent 构建周报内容
func buildReportContent(db *sql.DB, projects []models.Project, okrSets []models.OkrSet, weekStart, weekEnd time.Time) models.WeeklyReportContent {
	// 预加载用户姓名映射
	userNames := schedLoadUserNames(db)

	// 构建KR映射
	krToObjective := make(map[string]string)
	krToDesc := make(map[string]string)
	for i := range okrSets {
		for j := range okrSets[i].Okrs {
			for k := range okrSets[i].Okrs[j].KeyResults {
				kr := okrSets[i].Okrs[j].KeyResults[k]
				krToObjective[kr.ID] = okrSets[i].Okrs[j].Objective
				krToDesc[kr.ID] = kr.Description
			}
		}
	}

	// 按KR归集项目
	krProjects := make(map[string][]models.Project)
	var noKrProjects []models.Project
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

	// 构建OkrSummaries
	okrSummaries := make([]models.OkrWeeklySummary, 0)
	processedOkr := make(map[string]bool)

	for krId, projs := range krProjects {
		objective := krToObjective[krId]
		if objective == "" {
			objective = "未关联目标"
		}

		okrKey := objective
		if processedOkr[okrKey] {
			for i := range okrSummaries {
				if okrSummaries[i].Objective == objective {
					okrSummaries[i].KrSummaries = append(okrSummaries[i].KrSummaries, models.KrWeeklySummary{
						KrID:             krId,
						KrDesc:           krToDesc[krId],
						ProjectSummaries: buildProjSummaries(projs, userNames, weekStart, weekEnd),
					})
					break
				}
			}
		} else {
			processedOkr[okrKey] = true
			okrSummaries = append(okrSummaries, models.OkrWeeklySummary{
				OkrID:     krId,
				Objective: objective,
				KrSummaries: []models.KrWeeklySummary{
					{
						KrID:             krId,
						KrDesc:           krToDesc[krId],
						ProjectSummaries: buildProjSummaries(projs, userNames, weekStart, weekEnd),
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
		okrSummaries = append(okrSummaries, models.OkrWeeklySummary{
			OkrID:     "zz-urgent",
			Objective: "临时重要需求",
			KrSummaries: []models.KrWeeklySummary{
				{
					KrID:             "zz-urgent-kr",
					KrDesc:           "本周推进事项",
					ProjectSummaries: buildProjSummaries(urgentProjects, userNames, weekStart, weekEnd),
				},
			},
		})
	}

	return models.WeeklyReportContent{OkrSummaries: okrSummaries}
}

// buildProjSummaries v4.3：填充完整字段（含推进型判定、排期摘要、排期缺失提示），不再单项目调 LLM
func buildProjSummaries(projects []models.Project, userNames map[string]string, weekStart, weekEnd time.Time) []models.ProjectWeeklySummary {
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
		isDriving := schedIsDrivingOnly(p.Status)
		scheduleText := ""
		if !isDriving {
			scheduleText = schedBuildProjectScheduleText(p, userNames)
		}
		alerts := schedBuildProjectMemberAlerts(p, weekEnd, userNames)

		summaries = append(summaries, models.ProjectWeeklySummary{
			ProjectID:       p.ID,
			ProjectName:     p.Name,
			WeeklyUpdate:    stripHtmlTags(deref(p.WeeklyUpdate)),
			Status:          p.Status,
			Priority:        p.Priority,
			ProductManagers: pmNames,
			System:          deref(p.System),
			BusinessProblem: stripHtmlTags(deref(p.BusinessProblem)),
			LastWeekUpdate:  stripHtmlTags(deref(p.LastWeekUpdate)),
			LaunchDate:      deref(p.LaunchDate),
			ScheduleText:    scheduleText,
			MemberAlerts:    alerts,
			IsDrivingOnly:   isDriving,
		})
	}
	_ = weekStart
	return summaries
}

// schedLoadUserNames 从 users 表加载 id -> name 映射
func schedLoadUserNames(db *sql.DB) map[string]string {
	names := make(map[string]string)
	rows, err := db.Query("SELECT id, name FROM users")
	if err != nil {
		log.Printf("[Scheduler] loadUserNames failed: %v", err)
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

// generateAIReportSummary 通过 ai 包（glm-5.1，按 OKR 分批）生成周报总结
func generateAIReportSummary(content models.WeeklyReportContent, year, weekNum int, startOfWeek, endOfWeek time.Time) (string, error) {
	input := schedConvertContentToAIInput(content, ai.WeekRange{
		Year:       year,
		WeekNumber: weekNum,
		Start:      startOfWeek.Format("2006-01-02"),
		End:        endOfWeek.Format("2006-01-02"),
	})
	return ai.GenerateWeeklySummary(input)
}

// ---------- v4.3 scheduler 内部辅助函数（与 api 包内逻辑等价）----------

func schedIsDrivingOnly(s string) bool {
	return strings.TrimSpace(s) == "项目进行中"
}

func schedShortMD(ymd string) string {
	if len(ymd) == 10 && ymd[4] == '-' && ymd[7] == '-' {
		return ymd[5:7] + "." + ymd[8:10]
	}
	return ymd
}

func schedBuildProjectScheduleText(p models.Project, userNames map[string]string) string {
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
				segs = append(segs, fmt.Sprintf("%s %s~%s", name, schedShortMD(s), schedShortMD(e)))
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

func schedBuildProjectMemberAlerts(p models.Project, weekEnd time.Time, userNames map[string]string) []string {
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

func schedConvertContentToAIInput(content models.WeeklyReportContent, wr ai.WeekRange) ai.WeeklyReportInput {
	in := ai.WeeklyReportInput{
		WeekRange:   wr,
		Okrs:        make([]ai.OkrInput, 0, len(content.OkrSummaries)),
		IdleMembers: []ai.IdleMember{},
	}
	order := 1
	for _, okr := range content.OkrSummaries {
		if okr.OkrID == "zz-urgent" {
			for _, kr := range okr.KrSummaries {
				for _, p := range kr.ProjectSummaries {
					in.UrgentProjects = append(in.UrgentProjects, schedSummaryToAIProject(p))
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
				ki.Projects = append(ki.Projects, schedSummaryToAIProject(p))
			}
			oi.KrItems = append(oi.KrItems, ki)
		}
		in.Okrs = append(in.Okrs, oi)
	}
	return in
}

func schedSummaryToAIProject(p models.ProjectWeeklySummary) ai.ProjectInput {
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

func stripHtmlTags(html string) string {
	result := strings.ReplaceAll(html, "<p>", "")
	result = strings.ReplaceAll(result, "</p>", "")
	result = strings.ReplaceAll(result, "<strong>", "")
	result = strings.ReplaceAll(result, "</strong>", "")
	result = strings.ReplaceAll(result, "<br>", "\n")
	result = strings.ReplaceAll(result, "<br/>", "\n")
	result = strings.ReplaceAll(result, "&nbsp;", " ")
	return strings.TrimSpace(result)
}
