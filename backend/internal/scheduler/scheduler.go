package scheduler

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

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
	content := buildReportContent(db, projects, okrSets)
	contentJSON, _ := json.Marshal(content)

	// 调用AI生成总结
	summary, err := generateAIReportSummary(content)
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
func buildReportContent(db *sql.DB, projects []models.Project, okrSets []models.OkrSet) models.WeeklyReportContent {
	// 预加载用户姓名映射 + 并发调用 AI 生成项目级总结
	userNames := schedLoadUserNames(db)
	aiSummaries := schedGenerateProjectAISummaries(projects)

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
						ProjectSummaries: buildProjSummaries(projs, userNames, aiSummaries),
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
						ProjectSummaries: buildProjSummaries(projs, userNames, aiSummaries),
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
					ProjectSummaries: buildProjSummaries(urgentProjects, userNames, aiSummaries),
				},
			},
		})
	}

	return models.WeeklyReportContent{OkrSummaries: okrSummaries}
}

func buildProjSummaries(projects []models.Project, userNames, aiSummaries map[string]string) []models.ProjectWeeklySummary {
	summaries := make([]models.ProjectWeeklySummary, 0, len(projects))
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
		update := ""
		if s, ok := aiSummaries[p.ID]; ok && s != "" {
			update = s
		} else if p.WeeklyUpdate != nil {
			update = stripHtmlTags(*p.WeeklyUpdate)
		}
		summaries = append(summaries, models.ProjectWeeklySummary{
			ProjectID:       p.ID,
			ProjectName:     p.Name,
			WeeklyUpdate:    update,
			Status:          p.Status,
			Priority:        p.Priority,
			ProductManagers: pmNames,
		})
	}
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

// schedGenerateProjectAISummaries 并发调用 GLM-5 为每个项目生成短总结
func schedGenerateProjectAISummaries(projects []models.Project) map[string]string {
	result := make(map[string]string)
	if len(projects) == 0 {
		return result
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	sem := make(chan struct{}, 3)
	for _, p := range projects {
		wg.Add(1)
		sem <- struct{}{}
		go func(proj models.Project) {
			defer wg.Done()
			defer func() { <-sem }()
			var summary string
			var err error
			for attempt := 1; attempt <= 2; attempt++ {
				summary, err = schedCallProjectAISummary(proj)
				if err == nil && summary != "" {
					break
				}
				if attempt < 2 {
					time.Sleep(time.Duration(attempt) * time.Second)
				}
			}
			if err != nil {
				log.Printf("[Scheduler] project %s AI failed: %v", proj.ID, err)
				return
			}
			mu.Lock()
			result[proj.ID] = summary
			mu.Unlock()
		}(p)
	}
	wg.Wait()
	log.Printf("[Scheduler] project AI summaries: %d/%d", len(result), len(projects))
	return result
}

// schedCallProjectAISummary 调用 GLM-5 为单个项目生成短总结
func schedCallProjectAISummary(p models.Project) (string, error) {
	deref := func(s *string) string {
		if s == nil {
			return ""
		}
		return *s
	}
	weeklyUpdate := stripHtmlTags(deref(p.WeeklyUpdate))
	lastWeek := stripHtmlTags(deref(p.LastWeekUpdate))

	prompt := fmt.Sprintf(`请基于以下项目原始数据，用 2-3 句话精炼总结本周进展与风险。只输出总结正文，不要标题、寒暄、Markdown 格式符号。

项目名称：%s
所属系统：%s
状态：%s
优先级：%s
业务问题：%s
本周进展：%s
上周进展：%s
预期上线：%s`,
		p.Name, deref(p.System), p.Status, p.Priority, deref(p.BusinessProblem),
		weeklyUpdate, lastWeek, deref(p.LaunchDate),
	)

	reqBody := map[string]interface{}{
		"model": "glm-5",
		"messages": []map[string]string{
			{"role": "system", "content": "你是资深项目经理。产出要精炼、中立、信息量高，总字数控制在 80 字以内，使用与原文一致的语言，不要输出 Markdown 标记。"},
			{"role": "user", "content": prompt},
		},
	}
	body, _ := json.Marshal(reqBody)

	client := &http.Client{Timeout: 90 * time.Second}
	req, err := http.NewRequest("POST", "https://kspmas.ksyun.com/v1/chat/completions", bytes.NewBuffer(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer a56ce535-a362-4215-9143-4d80987875ba")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("status=%d body=%s", resp.StatusCode, string(b))
	}
	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no choices")
	}
	return strings.TrimSpace(result.Choices[0].Message.Content), nil
}

// generateAIReportSummary 调用GLM-5模型生成周报总结
func generateAIReportSummary(content models.WeeklyReportContent) (string, error) {
	prompt := buildReportPrompt(content)

	reqBody := map[string]interface{}{
		"model": "glm-5",
		"messages": []map[string]string{
			{"role": "system", "content": "你是一位资深项目管理专家，擅长总结项目进展。请根据提供的项目数据，按OKR维度生成简洁、专业的周报总结。每个O和KR下的项目进展要条理清晰，突出重点。"},
			{"role": "user", "content": prompt},
		},
	}

	jsonBody, _ := json.Marshal(reqBody)

	req, err := http.NewRequest("POST", "https://kspmas.ksyun.com/v1/chat/completions", bytes.NewBuffer(jsonBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer a56ce535-a362-4215-9143-4d80987875ba")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("AI API error: %d, %s", resp.StatusCode, string(body))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Choices) > 0 {
		return result.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("no response from AI")
}

func buildReportPrompt(content models.WeeklyReportContent) string {
	var sb strings.Builder
	sb.WriteString("请根据以下项目数据生成周报总结：\n\n")

	for _, okrSummary := range content.OkrSummaries {
		sb.WriteString(fmt.Sprintf("【目标：%s】\n", okrSummary.Objective))
		for _, krSummary := range okrSummary.KrSummaries {
			sb.WriteString(fmt.Sprintf("  关键结果：%s\n", krSummary.KrDesc))
			for _, proj := range krSummary.ProjectSummaries {
				sb.WriteString(fmt.Sprintf("    - %s（%s）：%s\n", proj.ProjectName, proj.Status, stripHtmlTags(proj.WeeklyUpdate)))
			}
		}
		sb.WriteString("\n")
	}

	sb.WriteString("\n请生成一份专业的周报总结，要求：\n")
	sb.WriteString("1. 按目标和关键结果维度组织\n")
	sb.WriteString("2. 突出本周主要进展和风险\n")
	sb.WriteString("3. 语言简洁专业\n")
	sb.WriteString("4. 总字数控制在500字以内\n")

	return sb.String()
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
