package scheduler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
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

	// 设置请求头（Basic Auth 允许 EMPLOYEE_API_AUTH_HEADER 覆盖，默认保留原值以兼容线上配置）
	authHeader := os.Getenv("EMPLOYEE_API_AUTH_HEADER")
	if authHeader == "" {
		authHeader = "Basic QUs1YWRkZDVkMjJiNThiOlNLNWFkZGQ1ZDIyYjVjYg=="
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", authHeader)
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
	// ISO 年与 ISO 周号：年末/年初跨年的 ISO 年与日历年可能不同，必须用 ISOWeek 返回的年份。
	isoYear, weekNum := now.ISOWeek()

	// 计算本周的起止日期
	startOfWeek := now.AddDate(0, 0, -int(now.Weekday())+1)
	if now.Weekday() == 0 {
		startOfWeek = now.AddDate(0, 0, -6)
	}
	endOfWeek := startOfWeek.AddDate(0, 0, 6)

	// 查询本周有进展的项目
	// v4.4.1：仅纳入白名单 11 个状态（排除 "已完成"/"暂停"）
	projectQuery := `
		SELECT id, name, business_direction, priority, business_background, key_result_ids, weekly_update,
		       last_week_update, status, proposal_date, completion_date, created_at, followers,
		       owner
		FROM projects
		WHERE weekly_update IS NOT NULL AND weekly_update != ''
		  AND status IN (
		      '未开始','讨论中','产品设计','需求完成','评审完成',
		      '开发中','开发完成','测试中','测试完成',
		      '本周已上线','项目进行中'
		  )
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
		var owner []byte

		err := rows.Scan(
			&p.ID, &p.Name, &p.BusinessDirection, &p.Priority, &p.BusinessBackground, &keyResultIdsStr,
			&p.WeeklyUpdate, &p.LastWeekUpdate, &p.Status,
			&p.ProposalDate, &p.CompletionDate, &p.CreatedAt, &followersStr,
			&owner,
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

		json.Unmarshal(owner, &p.Owner)
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

	// v4.4.1: 读取上周排期快照（表不存在或无数据时返回空 map）
	lastWeek := schedLoadLastWeekSnapshots(db, isoYear, weekNum)

	// 构建周报内容
	content := buildReportContent(db, projects, okrSets, startOfWeek, endOfWeek, lastWeek)
	contentJSON, _ := json.Marshal(content)

	// v4.4.1: 写入本周排期快照（失败不影响流程）
	reportIDForSnapshot := fmt.Sprintf("wr%d%02d", isoYear, weekNum)
	snapshotRows := schedFlattenProjectSchedules(projects, schedLoadUserNames(db))
	if serr := schedSaveScheduleSnapshots(db, reportIDForSnapshot, isoYear, weekNum, snapshotRows); serr != nil {
		log.Printf("[Scheduler] save snapshots failed (non-fatal): %v", serr)
	}

	// 调用AI生成总结
	summary, err := generateAIReportSummary(content, isoYear, weekNum, startOfWeek, endOfWeek)
	if err != nil {
		log.Printf("AI summary generation failed: %v", err)
		summary = "AI总结生成失败，请手动编辑补充。"
	}

	// 保存到数据库
	reportID := fmt.Sprintf("wr%d%02d", isoYear, weekNum)

	var existingID string
	checkQuery := `SELECT id FROM weekly_reports WHERE week_year = $1 AND week_number = $2`
	err = db.QueryRow(checkQuery, isoYear, weekNum).Scan(&existingID)

	if err != nil {
		// 插入新周报
		insertQuery := `
			INSERT INTO weekly_reports (id, week_year, week_number, start_date, end_date, status, content, summary, generated_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		`
		_, err = db.Exec(insertQuery, reportID, isoYear, weekNum,
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

	log.Printf("Weekly report generated for week %d-%d with %d projects", isoYear, weekNum, len(projects))
	return nil
}

// buildReportContent 构建周报内容
// v4.4.1：新增 lastWeek 参数用于排期 diff。
func buildReportContent(db *sql.DB, projects []models.Project, okrSets []models.OkrSet, weekStart, weekEnd time.Time, lastWeek schedLastWeekScheduleMap) models.WeeklyReportContent {
	// 预加载用户姓名映射
	userNames := schedLoadUserNames(db)

	// 构建KR映射
	krToOkrID := make(map[string]string)
	krToObjective := make(map[string]string)
	krToDesc := make(map[string]string)
	for i := range okrSets {
		for j := range okrSets[i].Okrs {
			for k := range okrSets[i].Okrs[j].KeyResults {
				kr := okrSets[i].Okrs[j].KeyResults[k]
				krToOkrID[kr.ID] = okrSets[i].Okrs[j].ID
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

		// 使用真实的 OKR ID（而非 krId），保证同一 O 下多个 KR 正确归集
		okrId := krToOkrID[krId]
		if okrId == "" {
			okrId = "unknown"
		}

		okrKey := okrId + "|" + objective
		if processedOkr[okrKey] {
			for i := range okrSummaries {
				if okrSummaries[i].OkrID == okrId {
					okrSummaries[i].KrSummaries = append(okrSummaries[i].KrSummaries, models.KrWeeklySummary{
						KrID:             krId,
						KrDesc:           krToDesc[krId],
						ProjectSummaries: buildProjSummaries(projs, userNames, weekStart, weekEnd, lastWeek),
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
						KrDesc:           krToDesc[krId],
						ProjectSummaries: buildProjSummaries(projs, userNames, weekStart, weekEnd, lastWeek),
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
					ProjectSummaries: buildProjSummaries(urgentProjects, userNames, weekStart, weekEnd, lastWeek),
				},
			},
		})
	}

	return models.WeeklyReportContent{OkrSummaries: okrSummaries}
}

// buildProjSummaries v4.3：填充完整字段（含推进型判定、排期摘要、排期缺失提示），不再单项目调 LLM
// v4.4.1：新增 ScheduleChanges（排期较上周 diff）+ DelayRisks（状态-排期不符告警）
func buildProjSummaries(projects []models.Project, userNames map[string]string, weekStart, weekEnd time.Time, lastWeek schedLastWeekScheduleMap) []models.ProjectWeeklySummary {
	summaries := make([]models.ProjectWeeklySummary, 0, len(projects))
	deref := func(s *string) string {
		if s == nil {
			return ""
		}
		return *s
	}
	for _, p := range projects {
		ownerNames := []string{}
		for _, o := range p.Owner {
			if o.UserID == "" {
				continue
			}
			if name, ok := userNames[o.UserID]; ok && name != "" {
				ownerNames = append(ownerNames, name)
			} else {
				ownerNames = append(ownerNames, o.UserID)
			}
		}
		isDriving := schedIsDrivingOnly(p.Status)
		isLaunched := strings.TrimSpace(p.Status) == "本周已上线"
		scheduleText := ""
		alerts := []string{}
		changes := []string{}
		risks := []string{}
		if !isDriving && !isLaunched {
			scheduleText = schedBuildProjectScheduleText(p, userNames)
			alerts = schedBuildProjectMemberAlerts(p, weekEnd, userNames)
			changes = schedComputeScheduleChanges(p, userNames, lastWeek)
			risks = schedComputeDelayRisks(p, weekEnd, userNames)
		}

		summaries = append(summaries, models.ProjectWeeklySummary{
			ProjectID:         p.ID,
			ProjectName:       p.Name,
			WeeklyUpdate:      stripHtmlTags(deref(p.WeeklyUpdate)),
			Status:            p.Status,
			Priority:          p.Priority,
			Owners:            ownerNames,
			BusinessDirection: deref(p.BusinessDirection),
			BusinessBackground: stripHtmlTags(deref(p.BusinessBackground)),
			LastWeekUpdate:    stripHtmlTags(deref(p.LastWeekUpdate)),
			CompletionDate:    deref(p.CompletionDate),
			ScheduleText:      scheduleText,
			MemberAlerts:      alerts,
			IsDrivingOnly:     isDriving,
			ScheduleChanges:   changes,
			DelayRisks:        risks,
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
	appendRole("负责人", p.Owner)
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
	out = append(out, chk("负责人", p.Owner)...)
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
	// v4.4.1：合并三类告警
	merged := make([]string, 0, len(p.MemberAlerts)+len(p.ScheduleChanges)+len(p.DelayRisks))
	merged = append(merged, p.MemberAlerts...)
	merged = append(merged, p.ScheduleChanges...)
	merged = append(merged, p.DelayRisks...)
	return ai.ProjectInput{
		ID:              p.ProjectID,
		Name:              p.ProjectName,
		BusinessDirection: p.BusinessDirection,
		Status:            p.Status,
		Priority:          p.Priority,
		BusinessBackground: p.BusinessBackground,
		WeeklyUpdate:      p.WeeklyUpdate,
		LastWeekUpdate:    p.LastWeekUpdate,
		CompletionDate:    p.CompletionDate,
		ScheduleText:      p.ScheduleText,
		MemberAlerts:      merged,
		IsDrivingOnly:     p.IsDrivingOnly,
	}
}

// schedHtmlTagRegex 兜底剥除 stripHtmlTags 未枚举到的残留标签（<ul>、<li>、<h3>、<span> 等）。
var schedHtmlTagRegex = regexp.MustCompile(`<[^>]+>`)

func stripHtmlTags(html string) string {
	result := strings.ReplaceAll(html, "<p>", "")
	result = strings.ReplaceAll(result, "</p>", "\n")
	result = strings.ReplaceAll(result, "<strong>", "")
	result = strings.ReplaceAll(result, "</strong>", "")
	result = strings.ReplaceAll(result, "<br>", "\n")
	result = strings.ReplaceAll(result, "<br/>", "\n")
	result = strings.ReplaceAll(result, "<br />", "\n")
	result = strings.ReplaceAll(result, "&nbsp;", " ")
	// 兜底：清除富文本编辑器产生的其它标签
	result = schedHtmlTagRegex.ReplaceAllString(result, "")
	return strings.TrimSpace(result)
}

// ================= v4.4.1 scheduler 版 helper（与 api 包内逻辑等价，名字加 sched 前缀避免包内冲突） =================

// v4.4.1 规则总开关：设置 WEEKLY_REPORT_RULES_V441=off 可关闭 diff/延期判定（snapshot 仍写入）
var schedWeeklyRulesV441Enabled = func() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("WEEKLY_REPORT_RULES_V441")))
	return v != "off" && v != "false" && v != "0"
}()

// schedIsDevelopmentStatus 研发中 9 状态
func schedIsDevelopmentStatus(s string) bool {
	switch strings.TrimSpace(s) {
	case "未开始", "讨论中", "产品设计", "需求完成", "评审完成",
		"开发中", "开发完成", "测试中", "测试完成":
		return true
	}
	return false
}

type schedScheduleRow struct {
	ProjectID, Role, UserID, UserName, Start, End, Status string
}

type schedLastWeekScheduleMap map[string]map[string]map[string]schedScheduleRow

// schedFlattenProjectSchedules 把项目按角色 × 成员 × TimeSlot(合并)展开为快照行。
func schedFlattenProjectSchedules(projects []models.Project, userNames map[string]string) []schedScheduleRow {
	rows := []schedScheduleRow{}
	for _, p := range projects {
		if !schedIsDevelopmentStatus(p.Status) {
			continue
		}
		appendRole := func(role string, members models.Role) {
			for _, m := range members {
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
						if ts.StartDate != "" && (s == "" || ts.StartDate < s) {
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
				rows = append(rows, schedScheduleRow{
					ProjectID: p.ID, Role: role,
					UserID: m.UserID, UserName: name,
					Start: s, End: e, Status: p.Status,
				})
			}
		}
		appendRole("owner", p.Owner)
	}
	return rows
}

// schedSaveScheduleSnapshots 幂等写入本周排期快照
func schedSaveScheduleSnapshots(db *sql.DB, reportID string, isoYear, weekNum int, rows []schedScheduleRow) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM project_schedule_snapshots WHERE report_id = $1", reportID); err != nil {
		tx.Rollback()
		return err
	}
	stmt, err := tx.Prepare(`
		INSERT INTO project_schedule_snapshots
			(report_id, iso_year, week_number, project_id, role, user_id, user_name, start_date, end_date, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8,'')::date, NULLIF($9,'')::date, $10)
		ON CONFLICT (report_id, project_id, role, user_id, start_date) DO NOTHING
	`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, r := range rows {
		if _, err := stmt.Exec(reportID, isoYear, weekNum, r.ProjectID, r.Role, r.UserID, r.UserName, r.Start, r.End, r.Status); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func schedPrevISOWeek(isoYear, weekNum int) (int, int) {
	jan4 := time.Date(isoYear, 1, 4, 0, 0, 0, 0, time.UTC)
	weekday := int(jan4.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	week1Mon := jan4.AddDate(0, 0, 1-weekday)
	target := week1Mon.AddDate(0, 0, (weekNum-1)*7)
	prev := target.AddDate(0, 0, -7)
	y, w := prev.ISOWeek()
	return y, w
}

func schedLoadLastWeekSnapshots(db *sql.DB, isoYear, weekNum int) schedLastWeekScheduleMap {
	result := schedLastWeekScheduleMap{}
	lastIsoYear, lastWeekNum := schedPrevISOWeek(isoYear, weekNum)
	rows, err := db.Query(`
		SELECT project_id, role, user_id, user_name,
		       COALESCE(to_char(start_date,'YYYY-MM-DD'), ''),
		       COALESCE(to_char(end_date,'YYYY-MM-DD'), ''),
		       COALESCE(status,'')
		FROM project_schedule_snapshots
		WHERE iso_year = $1 AND week_number = $2
	`, lastIsoYear, lastWeekNum)
	if err != nil {
		return result
	}
	defer rows.Close()
	for rows.Next() {
		var r schedScheduleRow
		if err := rows.Scan(&r.ProjectID, &r.Role, &r.UserID, &r.UserName, &r.Start, &r.End, &r.Status); err != nil {
			continue
		}
		if _, ok := result[r.ProjectID]; !ok {
			result[r.ProjectID] = map[string]map[string]schedScheduleRow{}
		}
		if _, ok := result[r.ProjectID][r.Role]; !ok {
			result[r.ProjectID][r.Role] = map[string]schedScheduleRow{}
		}
		result[r.ProjectID][r.Role][r.UserID] = r
	}
	return result
}

func schedComputeScheduleChanges(p models.Project, userNames map[string]string, lastWeek schedLastWeekScheduleMap) []string {
	if !schedWeeklyRulesV441Enabled {
		return nil
	}
	if len(lastWeek) == 0 {
		return nil
	}
	if !schedIsDevelopmentStatus(p.Status) {
		return nil
	}
	thisWeekRows := schedFlattenProjectSchedules([]models.Project{p}, userNames)
	thisIndex := map[string]schedScheduleRow{}
	for _, r := range thisWeekRows {
		thisIndex[r.Role+"|"+r.UserID] = r
	}
	lastByRole := lastWeek[p.ID]
	lastIndex := map[string]schedScheduleRow{}
	for role, us := range lastByRole {
		for uid, r := range us {
			lastIndex[role+"|"+uid] = r
		}
	}
	out := []string{}
	roleLabel := map[string]string{"backend": "后端", "frontend": "前端", "qa": "测试"}
	for key, cur := range thisIndex {
		prev, existed := lastIndex[key]
		if !existed {
			if cur.Start != "" && cur.End != "" {
				out = append(out, fmt.Sprintf("⚠️ 本周%s新增 %s 排期 %s~%s",
					roleLabel[cur.Role], cur.UserName, schedShortMD(cur.Start), schedShortMD(cur.End)))
			}
			continue
		}
		if cur.Start != prev.Start || cur.End != prev.End {
			delta := schedEndDateDelta(prev.End, cur.End)
			suffix := ""
			switch {
			case delta > 0:
				suffix = fmt.Sprintf("（延后 %d 天）", delta)
			case delta < 0:
				suffix = fmt.Sprintf("（提前 %d 天）", -delta)
			}
			out = append(out, fmt.Sprintf("⚠️ 本周%s %s 原 %s~%s 调整为 %s~%s%s",
				roleLabel[cur.Role], cur.UserName,
				schedShortMD(prev.Start), schedShortMD(prev.End),
				schedShortMD(cur.Start), schedShortMD(cur.End), suffix))
		}
	}
	for key, prev := range lastIndex {
		if _, existed := thisIndex[key]; !existed {
			out = append(out, fmt.Sprintf("⚠️ 本周%s %s 取消排期（上周 %s~%s）",
				roleLabel[prev.Role], prev.UserName, schedShortMD(prev.Start), schedShortMD(prev.End)))
		}
	}
	return out
}

func schedEndDateDelta(prev, cur string) int {
	p, err1 := time.Parse("2006-01-02", prev)
	c, err2 := time.Parse("2006-01-02", cur)
	if err1 != nil || err2 != nil {
		return 0
	}
	return int(c.Sub(p).Hours() / 24)
}

func schedComputeDelayRisks(p models.Project, weekEnd time.Time, userNames map[string]string) []string {
	if !schedWeeklyRulesV441Enabled {
		return nil
	}
	status := strings.TrimSpace(p.Status)
	devCheck := false
	qaCheck := false
	preCheck := false
	switch status {
	case "需求完成", "评审完成":
		preCheck = true
	case "开发中", "开发完成":
		devCheck = true
	case "测试中", "测试完成":
		qaCheck = true
	default:
		return nil
	}
	out := []string{}
	roleLabel := map[string]string{"backend": "后端", "frontend": "前端", "qa": "测试"}
	chkRole := func(role string, members models.Role) []string {
		als := []string{}
		for _, m := range members {
			if m.UserID == "" {
				continue
			}
			name := userNames[m.UserID]
			if name == "" {
				name = m.UserID
			}
			latest := schedLatestMemberEnd(m)
			if latest == "" {
				continue
			}
			le, err := time.Parse("2006-01-02", latest)
			if err != nil {
				continue
			}
			if le.Before(weekEnd) {
				als = append(als, fmt.Sprintf("⚠️ %s %s 排期截至 %s，当前状态\"%s\"，存在延期风险（请确认续排或调整状态）",
					roleLabel[role], name, latest, status))
			}
		}
		return als
	}
	if preCheck || devCheck || qaCheck {
		out = append(out, chkRole("owner", p.Owner)...)
	}
	return out
}

func schedLatestMemberEnd(m models.TeamMember) string {
	latest := ""
	for _, ts := range m.TimeSlots {
		if ts.EndDate > latest {
			latest = ts.EndDate
		}
	}
	if latest == "" && m.EndDate != nil {
		latest = *m.EndDate
	}
	return latest
}
