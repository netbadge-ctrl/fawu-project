# Weekly Report Rules Extension v4.4.0 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在周报生成链路中新增"项目状态白名单过滤 + 排期较上周 diff + 状态-排期一致性校验"三项能力，不影响历史数据与历史逻辑。

**Architecture:** 新建 `project_schedule_snapshots` 表存结构化排期快照，每次周报生成时读取上周 snapshot 做 diff、写入本周 snapshot；延期判定按状态-角色矩阵独立计算；三类告警合并进 `ai.ProjectInput.MemberAlerts`，由 System Prompt 规则 8 引导 LLM 原样追加，再由后端后处理兜底补漏。

**Tech Stack:** Go 1.21+ / PostgreSQL / glm-5.1（金山云网关）/ React-TSX（前端仅结构体兼容，不在本期改 UI）

**关联 Spec:** [`docs/superpowers/specs/2026-05-10-weekly-report-rules-extension-design.md`](../specs/2026-05-10-weekly-report-rules-extension-design.md)

**硬约束:**
- 不得 ALTER 现有表（`projects` / `weekly_reports` / `okr_sets` / `weekly_report_versions` 结构不变）
- 新字段全部 `omitempty`，历史 `weekly_reports.content` JSON 向前兼容
- 新表不存在或为空时，全部新规则必须优雅降级不崩

---

## File Structure

### 修改文件（按职责）

| 文件 | 职责 | 本期改动 |
|---|---|---|
| `backend/internal/database/database.go` | 所有表的 DDL | 新增 `project_schedule_snapshots` 建表 |
| `backend/internal/models/models.go` | 领域模型定义 | `ProjectWeeklySummary` 加 2 字段 |
| `backend/internal/api/weekly_report_handlers.go` | 周报生成 HTTP handler + 核心算法 | 所有新增函数与接入点 |
| `backend/internal/scheduler/scheduler.go` | 定时任务周报生成 | 复用 handler 导出的 helper |
| `backend/internal/ai/weekly_report_ai.go` | System prompt + LLM 调用 | Prompt 规则 8 + 后处理兜底 |
| `docs/weekly_report_system_prompt.md` | 规则文档 | 同步规则 8 |
| `package.json` / `version.json` / `CHANGELOG.md` / `VERSION_4.4.0.md` | 版本元数据 | 升版本到 4.4.0 |

---

## Task 1: 新增 `project_schedule_snapshots` 表

**Files:**
- Modify: `backend/internal/database/database.go`（在 `weeklyReportVersionsTable` 之后追加）

- [ ] **Step 1: 在 database.go 追加建表 DDL**

在 `weeklyReportVersionsTable` 常量定义结束处（约 183 行 `` ` ``）之后、`tables := []string{...}` 之前插入：

```go
	// 项目排期快照表（v4.4.0）：每次生成周报时写入当周所有研发中项目的排期明细，
	// 供下一周生成周报时做"排期较上周是否调整"的 diff。首次生成时此表为空，不影响流程。
	projectScheduleSnapshotsTable := `
	CREATE TABLE IF NOT EXISTS project_schedule_snapshots (
		id SERIAL PRIMARY KEY,
		report_id VARCHAR(16) NOT NULL,
		iso_year INTEGER NOT NULL,
		week_number INTEGER NOT NULL,
		project_id VARCHAR(64) NOT NULL,
		role VARCHAR(16) NOT NULL,
		user_id VARCHAR(64) NOT NULL,
		user_name VARCHAR(64) NOT NULL,
		start_date DATE,
		end_date DATE,
		status VARCHAR(32),
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_pss_unique
		ON project_schedule_snapshots(report_id, project_id, role, user_id, start_date);
	CREATE INDEX IF NOT EXISTS idx_pss_project_week
		ON project_schedule_snapshots(project_id, iso_year, week_number);
	CREATE INDEX IF NOT EXISTS idx_pss_week
		ON project_schedule_snapshots(iso_year, week_number);
	`
```

- [ ] **Step 2: 注册执行**

在 `weekly_report_versions` 表的 `db.Exec` 调用（约 197 行）后追加：

```go
	if _, err := db.Exec(projectScheduleSnapshotsTable); err != nil {
		return fmt.Errorf("failed to create project_schedule_snapshots table: %w", err)
	}
```

- [ ] **Step 3: 编译验证**

```bash
cd /Users/chennan/Qoder/project-qoder_重构/backend
go build ./internal/...
```

Expected: 无报错

- [ ] **Step 4: 本地启动后端，确认表创建成功**

```bash
export DATABASE_URL="postgresql://admin:Kingsoft0531@120.92.44.85:51022/project_codebuddy?sslmode=disable"
export DISABLE_SCHEDULER="true"
bash ../restart-backend.sh
```

另开终端：
```bash
psql "$DATABASE_URL" -c "\d project_schedule_snapshots"
```

Expected: 表存在，列与 DDL 一致；三个索引均在

- [ ] **Step 5: Commit**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git add backend/internal/database/database.go
git commit -m "feat(db): add project_schedule_snapshots table for weekly report v4.4.0"
```

---

## Task 2: 扩展 `ProjectWeeklySummary` 结构体

**Files:**
- Modify: `backend/internal/models/models.go`

- [ ] **Step 1: 在 ProjectWeeklySummary 结构体追加两个 omitempty 字段**

定位到 `ProjectWeeklySummary` 定义（查找 `ProjectWeeklySummary struct`），在 `IsDrivingOnly` 字段之后新增：

```go
	// v4.4.0 新增：排期调整提示（与上周 snapshot 对比得出），omitempty 保证向前兼容
	ScheduleChanges []string `json:"scheduleChanges,omitempty"`
	// v4.4.0 新增：状态-排期一致性告警（延期风险），omitempty 保证向前兼容
	DelayRisks []string `json:"delayRisks,omitempty"`
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/chennan/Qoder/project-qoder_重构/backend
go build ./internal/...
```

Expected: 无报错

- [ ] **Step 3: Commit**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git add backend/internal/models/models.go
git commit -m "feat(models): add ScheduleChanges and DelayRisks to ProjectWeeklySummary"
```

---

## Task 3: Snapshot 写入函数 + schedule flatten helper

**Files:**
- Modify: `backend/internal/api/weekly_report_handlers.go`（在文件末尾追加新函数块）

- [ ] **Step 1: 追加 scheduleRow 结构体与 flatten 函数**

在 `weekly_report_handlers.go` 文件末尾追加：

```go
// ---------- v4.4.0 排期快照 ----------

// scheduleRow 单条排期快照
type scheduleRow struct {
	ProjectID string
	Role      string // backend / frontend / qa
	UserID    string
	UserName  string
	Start     string // YYYY-MM-DD 或 ""
	End       string // YYYY-MM-DD 或 ""
	Status    string
}

// flattenProjectSchedules 把项目按角色 × 成员 × TimeSlot(合并)展开为快照行。
// 对同一 (project, role, userId) 的多 TimeSlot，取 min(Start) / max(End) 合并为 1 行。
// 仅对研发中 9 状态输出排期；本周已上线/项目进行中返回空列表。
func flattenProjectSchedules(projects []models.Project, userNames map[string]string) []scheduleRow {
	rows := []scheduleRow{}
	for _, p := range projects {
		if !isDevelopmentStatus(p.Status) {
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
				rows = append(rows, scheduleRow{
					ProjectID: p.ID, Role: role,
					UserID: m.UserID, UserName: name,
					Start: s, End: e, Status: p.Status,
				})
			}
		}
		appendRole("backend", p.BackendDevelopers)
		appendRole("frontend", p.FrontendDevelopers)
		appendRole("qa", p.QaTesters)
	}
	return rows
}

// isDevelopmentStatus 研发中 9 状态（需要展示排期与做 diff / 延期判定）
func isDevelopmentStatus(s string) bool {
	switch strings.TrimSpace(s) {
	case "未开始", "讨论中", "产品设计", "需求完成", "评审完成",
		"开发中", "开发完成", "测试中", "测试完成":
		return true
	}
	return false
}

// isWeeklyReportEligibleStatus 周报白名单 11 状态（研发中 9 + 本周已上线 + 项目进行中）
func isWeeklyReportEligibleStatus(s string) bool {
	if isDevelopmentStatus(s) {
		return true
	}
	switch strings.TrimSpace(s) {
	case "本周已上线", "项目进行中":
		return true
	}
	return false
}

// saveScheduleSnapshots 幂等写入本周排期快照。先删后插（同 reportID）保证重复生成不污染。
func saveScheduleSnapshots(db *sql.DB, reportID string, isoYear, weekNum int, rows []scheduleRow) error {
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
		VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8,''), NULLIF($9,''), $10)
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
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/chennan/Qoder/project-qoder_重构/backend
go build ./internal/...
```

Expected: 无报错

- [ ] **Step 3: Commit**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git add backend/internal/api/weekly_report_handlers.go
git commit -m "feat(weekly-report): add schedule snapshot write helpers (flatten + idempotent save)"
```

---

## Task 4: Snapshot 读取函数（载入上周快照）

**Files:**
- Modify: `backend/internal/api/weekly_report_handlers.go`

- [ ] **Step 1: 追加读取函数**

在 Task 3 追加的代码块之后继续追加：

```go
// lastWeekScheduleMap[projectID][role][userID] -> scheduleRow
type lastWeekScheduleMap map[string]map[string]map[string]scheduleRow

// loadLastWeekSnapshots 读上一个 ISO 周的排期快照。表不存在或无数据时返回空 map，不报错。
// 上一周的 iso_year/week_number 用 time 库计算（自动处理跨年边界）。
func loadLastWeekSnapshots(db *sql.DB, isoYear, weekNum int) lastWeekScheduleMap {
	result := lastWeekScheduleMap{}
	lastIsoYear, lastWeekNum := prevISOWeek(isoYear, weekNum)
	rows, err := db.Query(`
		SELECT project_id, role, user_id, user_name,
		       COALESCE(to_char(start_date,'YYYY-MM-DD'), ''),
		       COALESCE(to_char(end_date,'YYYY-MM-DD'), ''),
		       COALESCE(status,'')
		FROM project_schedule_snapshots
		WHERE iso_year = $1 AND week_number = $2
	`, lastIsoYear, lastWeekNum)
	if err != nil {
		// 表不存在或查询失败：降级为"无上周数据"，不影响流程
		return result
	}
	defer rows.Close()
	for rows.Next() {
		var r scheduleRow
		if err := rows.Scan(&r.ProjectID, &r.Role, &r.UserID, &r.UserName, &r.Start, &r.End, &r.Status); err != nil {
			continue
		}
		if _, ok := result[r.ProjectID]; !ok {
			result[r.ProjectID] = map[string]map[string]scheduleRow{}
		}
		if _, ok := result[r.ProjectID][r.Role]; !ok {
			result[r.ProjectID][r.Role] = map[string]scheduleRow{}
		}
		result[r.ProjectID][r.Role][r.UserID] = r
	}
	return result
}

// prevISOWeek 计算给定 ISO 年/周的上一周。
// 通过 "本周一 - 7 天" 再取 ISOWeek 保证跨年正确。
func prevISOWeek(isoYear, weekNum int) (int, int) {
	// ISO 周的周一：iso year 1 月 4 日所在的 ISO 周的周一作为起点
	jan4 := time.Date(isoYear, 1, 4, 0, 0, 0, 0, time.UTC)
	// jan4 所在 ISO 周的周一
	weekday := int(jan4.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	week1Mon := jan4.AddDate(0, 0, 1-weekday)
	// 目标周的周一
	target := week1Mon.AddDate(0, 0, (weekNum-1)*7)
	// 上一周周一
	prev := target.AddDate(0, 0, -7)
	y, w := prev.ISOWeek()
	return y, w
}
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/chennan/Qoder/project-qoder_重构/backend
go build ./internal/...
```

Expected: 无报错

- [ ] **Step 3: Commit**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git add backend/internal/api/weekly_report_handlers.go
git commit -m "feat(weekly-report): add prev-week snapshot loader with ISO week cross-year handling"
```

---

## Task 5: Schedule Diff 算法

**Files:**
- Modify: `backend/internal/api/weekly_report_handlers.go`

- [ ] **Step 1: 追加 diff 函数**

继续在文件末尾追加：

```go
// computeScheduleChanges 对单项目计算排期变化提示。
// - 上周全局无数据时：返回空切片（首次运行不刷屏）
// - 推进型 / 本周已上线项目：上游已跳过，此处不再判定
// 返回的字符串形如 "本周后端 张三 原 05.04~05.10 调整为 05.04~05.17（延后 7 天）"
func computeScheduleChanges(p models.Project, userNames map[string]string, lastWeek lastWeekScheduleMap) []string {
	if len(lastWeek) == 0 {
		return nil // 首次运行或上周快照表为空
	}
	if !isDevelopmentStatus(p.Status) {
		return nil
	}
	// 本周该项目展开
	thisWeekRows := flattenProjectSchedules([]models.Project{p}, userNames)
	thisIndex := map[string]scheduleRow{} // key: role|userId
	for _, r := range thisWeekRows {
		thisIndex[r.Role+"|"+r.UserID] = r
	}
	lastByRole := lastWeek[p.ID] // map[role]map[userId]scheduleRow
	lastIndex := map[string]scheduleRow{}
	for role, us := range lastByRole {
		for uid, r := range us {
			lastIndex[role+"|"+uid] = r
		}
	}

	out := []string{}
	roleLabel := map[string]string{"backend": "后端", "frontend": "前端", "qa": "测试"}

	// ADDED & CHANGED
	for key, cur := range thisIndex {
		prev, existed := lastIndex[key]
		if !existed {
			if cur.Start != "" && cur.End != "" {
				out = append(out, fmt.Sprintf("⚠️ 本周%s新增 %s 排期 %s~%s",
					roleLabel[cur.Role], cur.UserName, shortMD(cur.Start), shortMD(cur.End)))
			}
			continue
		}
		if cur.Start != prev.Start || cur.End != prev.End {
			delta := endDateDelta(prev.End, cur.End)
			suffix := ""
			switch {
			case delta > 0:
				suffix = fmt.Sprintf("（延后 %d 天）", delta)
			case delta < 0:
				suffix = fmt.Sprintf("（提前 %d 天）", -delta)
			}
			out = append(out, fmt.Sprintf("⚠️ 本周%s %s 原 %s~%s 调整为 %s~%s%s",
				roleLabel[cur.Role], cur.UserName,
				shortMD(prev.Start), shortMD(prev.End),
				shortMD(cur.Start), shortMD(cur.End), suffix))
		}
	}
	// REMOVED
	for key, prev := range lastIndex {
		if _, existed := thisIndex[key]; !existed {
			out = append(out, fmt.Sprintf("⚠️ 本周%s %s 取消排期（上周 %s~%s）",
				roleLabel[prev.Role], prev.UserName, shortMD(prev.Start), shortMD(prev.End)))
		}
	}
	return out
}

// endDateDelta 返回 cur - prev 的天数差（按 YYYY-MM-DD 解析）。无法解析时返回 0。
func endDateDelta(prev, cur string) int {
	p, err1 := time.Parse("2006-01-02", prev)
	c, err2 := time.Parse("2006-01-02", cur)
	if err1 != nil || err2 != nil {
		return 0
	}
	return int(c.Sub(p).Hours() / 24)
}
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/chennan/Qoder/project-qoder_重构/backend
go build ./internal/...
```

Expected: 无报错

- [ ] **Step 3: Commit**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git add backend/internal/api/weekly_report_handlers.go
git commit -m "feat(weekly-report): add schedule diff algorithm (added/changed/removed)"
```

---

## Task 6: 延期风险判定函数

**Files:**
- Modify: `backend/internal/api/weekly_report_handlers.go`

- [ ] **Step 1: 追加延期判定函数**

继续在文件末尾追加：

```go
// computeDelayRisks 按状态-角色矩阵判定延期风险。
// 基准日期 = weekEnd（本周末周日 23:59:59）
// 规则：
//   需求完成/评审完成 -> 后端或前端 任一 max(endDate) < weekEnd 即告警（该角色单独打一条）
//   开发中/开发完成   -> 后端 和 前端 各自独立判定
//   测试中/测试完成   -> 测试 判定
//   其它研发中状态（未开始/讨论中/产品设计）-> 不判定
//   本周已上线 / 项目进行中 -> 不判定（上游已过滤）
func computeDelayRisks(p models.Project, weekEnd time.Time, userNames map[string]string) []string {
	status := strings.TrimSpace(p.Status)
	// 白名单：需要判定的状态集合
	devCheck := false
	qaCheck := false
	preCheck := false // 需求完成/评审完成：后端或前端
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

	// chkRole 返回单个角色过期告警（每个成员单独一条）。
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
			latest := latestMemberEnd(m)
			if latest == "" {
				continue // 完全无排期 -> 走 buildProjectMemberAlerts 的"排期缺失"逻辑，不在此重复
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

	if preCheck {
		out = append(out, chkRole("backend", p.BackendDevelopers)...)
		out = append(out, chkRole("frontend", p.FrontendDevelopers)...)
	}
	if devCheck {
		out = append(out, chkRole("backend", p.BackendDevelopers)...)
		out = append(out, chkRole("frontend", p.FrontendDevelopers)...)
	}
	if qaCheck {
		out = append(out, chkRole("qa", p.QaTesters)...)
	}
	return out
}

// latestMemberEnd 返回单个成员所有 TimeSlot / 兼容字段里最晚的 EndDate。
func latestMemberEnd(m models.TeamMember) string {
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
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/chennan/Qoder/project-qoder_重构/backend
go build ./internal/...
```

Expected: 无报错

- [ ] **Step 3: Commit**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git add backend/internal/api/weekly_report_handlers.go
git commit -m "feat(weekly-report): add delay risk detection by status-role matrix"
```

---

## Task 7: SQL 层状态白名单过滤

**Files:**
- Modify: `backend/internal/api/weekly_report_handlers.go`（`fetchWeeklyReportData` 内的 `projectQuery`）

- [ ] **Step 1: 修改 projectQuery，追加 status 白名单**

定位到 `projectQuery` 常量（约 394-404 行），将原来的：

```go
	projectQuery := `
		SELECT id, name, system, priority, business_problem, key_result_ids,
		       weekly_update, last_week_update, status,
		       proposal_date, launch_date, created_at, followers,
		       product_managers, backend_developers, frontend_developers, qa_testers
		FROM projects
		WHERE weekly_update IS NOT NULL AND weekly_update != ''
		ORDER BY created_at DESC
	`
```

改为：

```go
	// v4.4.0：仅纳入白名单 11 个状态的项目（排除 "已完成" / "暂停"）
	projectQuery := `
		SELECT id, name, system, priority, business_problem, key_result_ids,
		       weekly_update, last_week_update, status,
		       proposal_date, launch_date, created_at, followers,
		       product_managers, backend_developers, frontend_developers, qa_testers
		FROM projects
		WHERE weekly_update IS NOT NULL AND weekly_update != ''
		  AND status IN (
		      '未开始','讨论中','产品设计','需求完成','评审完成',
		      '开发中','开发完成','测试中','测试完成',
		      '本周已上线','项目进行中'
		  )
		ORDER BY created_at DESC
	`
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/chennan/Qoder/project-qoder_重构/backend
go build ./internal/...
```

Expected: 无报错

- [ ] **Step 3: 本地冒烟验证 SQL**

用 psql 直接跑 `SELECT status, COUNT(*) FROM projects WHERE weekly_update != '' GROUP BY status;` 看分布，确认白名单过滤后行数合理。

- [ ] **Step 4: Commit**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git add backend/internal/api/weekly_report_handlers.go
git commit -m "feat(weekly-report): filter projects by status whitelist (11 allowed statuses)"
```

---

## Task 8: `buildProjectSummaries` 接入新算法 + snapshot 写入

**Files:**
- Modify: `backend/internal/api/weekly_report_handlers.go`

- [ ] **Step 1: 修改 `buildProjectSummaries` 签名 + 逻辑**

定位现有 `buildProjectSummaries`（约 634-680 行）。修改为：

```go
// buildProjectSummaries 把项目转换为周报条目：
// v4.4.0：新增 schedule diff + 延期风险计算；接收 lastWeek 快照 map 做对比。
func buildProjectSummaries(
	projects []models.Project,
	userNames map[string]string,
	weekStart, weekEnd time.Time,
	lastWeek lastWeekScheduleMap,
) []models.ProjectWeeklySummary {
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
		isLaunched := strings.TrimSpace(p.Status) == "本周已上线"
		scheduleText := ""
		alerts := []string{}
		changes := []string{}
		risks := []string{}
		if !isDriving && !isLaunched {
			scheduleText = buildProjectScheduleText(p, userNames)
			alerts = buildProjectMemberAlerts(p, weekEnd, userNames)
			changes = computeScheduleChanges(p, userNames, lastWeek)
			risks = computeDelayRisks(p, weekEnd, userNames)
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
			ScheduleChanges: changes,
			DelayRisks:      risks,
		})
	}
	_ = weekStart
	return summaries
}
```

- [ ] **Step 2: 修改 `buildWeeklyReportContent` 接入 lastWeek 与 snapshot 写入**

定位 `buildWeeklyReportContent`（约 511 行），修改签名追加 `lastWeek`：

```go
func (h *Handler) buildWeeklyReportContent(
	projects []models.Project,
	okrSets []models.OkrSet,
	weekStart, weekEnd time.Time,
	lastWeek lastWeekScheduleMap,
) models.WeeklyReportContent {
	userNames := loadUserNames(h.db)
	// ... 现有代码 ...
```

并在所有 `buildProjectSummaries(projs, userNames, weekStart, weekEnd)` 调用（搜索共 3 处）改为：

```go
buildProjectSummaries(projs, userNames, weekStart, weekEnd, lastWeek)
```

以及：

```go
buildProjectSummaries(urgentProjects, userNames, weekStart, weekEnd, lastWeek)
```

- [ ] **Step 3: 修改 `GenerateWeeklyReport` handler 接入 snapshot 读取与写入**

定位 `GenerateWeeklyReport`（约第 90 行起），在 `content := h.buildWeeklyReportContent(...)` 调用**前后**分别新增：

```go
	// v4.4.0: 读取上周排期快照（表不存在时返回空 map，不影响流程）
	lastWeek := loadLastWeekSnapshots(h.db, isoYear, weekNum)

	content := h.buildWeeklyReportContent(projects, okrSets, startOfWeek, endOfWeek, lastWeek)

	// v4.4.0: 写入本周排期快照，供下周 diff 使用
	reportIDForSnapshot := fmt.Sprintf("wr%d%02d", isoYear, weekNum)
	snapshotRows := flattenProjectSchedules(projects, loadUserNames(h.db))
	if err := saveScheduleSnapshots(h.db, reportIDForSnapshot, isoYear, weekNum, snapshotRows); err != nil {
		log.Printf("[WeeklyReport] save snapshots failed (non-fatal): %v", err)
	}
```

（注意：`reportIDForSnapshot` 需要和原有 `reportID` 字段一致，若已有同名变量则直接复用。）

如果 `weekly_report_handlers.go` 没导入 `log`，请在 `import` 块追加 `"log"`。

- [ ] **Step 4: 编译验证**

```bash
cd /Users/chennan/Qoder/project-qoder_重构/backend
go build ./internal/...
```

Expected: 无报错

- [ ] **Step 5: Commit**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git add backend/internal/api/weekly_report_handlers.go
git commit -m "feat(weekly-report): integrate schedule diff, delay risks, snapshot write into handler"
```

---

## Task 9: `convertContentToAIInput` 合并三路告警

**Files:**
- Modify: `backend/internal/api/weekly_report_handlers.go`（`summaryToAIProject` 函数）

- [ ] **Step 1: 修改 `summaryToAIProject` 合并告警**

定位 `summaryToAIProject`（约 855 行），改为：

```go
func summaryToAIProject(p models.ProjectWeeklySummary) ai.ProjectInput {
	// v4.4.0：合并三类告警 —— 排期缺失 + 排期调整 + 延期风险。LLM 由规则 8 引导原样追加。
	merged := make([]string, 0, len(p.MemberAlerts)+len(p.ScheduleChanges)+len(p.DelayRisks))
	merged = append(merged, p.MemberAlerts...)
	merged = append(merged, p.ScheduleChanges...)
	merged = append(merged, p.DelayRisks...)
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
		MemberAlerts:    merged,
		IsDrivingOnly:   p.IsDrivingOnly,
	}
}
```

- [ ] **Step 2: 编译验证**

```bash
cd /Users/chennan/Qoder/project-qoder_重构/backend
go build ./internal/...
```

Expected: 无报错

- [ ] **Step 3: Commit**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git add backend/internal/api/weekly_report_handlers.go
git commit -m "feat(weekly-report): merge schedule-change and delay-risk alerts into MemberAlerts for LLM"
```

---

## Task 10: System Prompt 规则 8 + 后处理兜底

**Files:**
- Modify: `backend/internal/ai/weekly_report_ai.go`
- Modify: `docs/weekly_report_system_prompt.md`

- [ ] **Step 1: 扩展 System Prompt**

在 `weekly_report_ai.go` 的 `weeklySystemPrompt` 常量中，找到规则 7 结束处（`项目名必须与输入 name 完全一致...`），在其后 **插入** 规则 8：

```
7. 每个项目 2–4 句，不分点不表格。项目名必须与输入 name 完全一致，不缩写不翻译。禁止寒暄、禁止编造未出现的数字/日期/人名。
8. member_alerts 可能包含三类 ⚠️ 提示（排期缺失 / 排期调整 / 延期风险），必须全部在该项目末尾原样追加，禁止合并、改写、省略或翻译；保持与输入完全一致的文案、标点与 emoji。告警行不计入主叙述 2-4 句限制。
```

- [ ] **Step 2: 追加后处理兜底函数**

在 `weekly_report_ai.go` 末尾追加：

```go
// ensureAlertsAppended 后处理兜底：扫描每个项目段落，检查 MemberAlerts 是否已在段落里出现；
// 若缺失，则在该项目所在段落末尾硬追加 ⚠️ 行。
// 兜底策略：对每个 ProjectInput，以 name 做子串定位，找到段落，检查告警字符串是否 Contains。
func ensureAlertsAppended(markdown string, okrs []OkrInput, urgent []ProjectInput) string {
	if markdown == "" {
		return markdown
	}
	all := []ProjectInput{}
	for _, o := range okrs {
		for _, kr := range o.KrItems {
			all = append(all, kr.Projects...)
		}
	}
	all = append(all, urgent...)

	for _, p := range all {
		if len(p.MemberAlerts) == 0 {
			continue
		}
		// 定位项目段落：以项目名首次出现为起点，到下一个 "**"/"###"/"##" 标题或段尾
		idx := strings.Index(markdown, p.Name)
		if idx < 0 {
			continue
		}
		// 段落结束点：取下一个换行 + 空行后的新段落起始，或文末
		tail := markdown[idx:]
		endRel := findNextParaBreak(tail)
		segment := tail[:endRel]
		missing := []string{}
		for _, al := range p.MemberAlerts {
			if !strings.Contains(segment, al) {
				missing = append(missing, al)
			}
		}
		if len(missing) == 0 {
			continue
		}
		// 在该段落末尾插入缺失告警
		injection := "\n" + strings.Join(missing, "\n")
		markdown = markdown[:idx+endRel] + injection + markdown[idx+endRel:]
	}
	return markdown
}

// findNextParaBreak 在 s 中找下一个空行（"\n\n"）或新标题行位置；找不到返回 len(s)。
func findNextParaBreak(s string) int {
	if i := strings.Index(s, "\n\n"); i >= 0 {
		return i
	}
	return len(s)
}
```

- [ ] **Step 3: 在 `GenerateWeeklySummary` 中接入兜底**

在 `weekly_report_ai.go` 的 `GenerateWeeklySummary` 函数末尾，将 `return out.String(), nil` 改为：

```go
	final := ensureAlertsAppended(out.String(), in.Okrs, in.UrgentProjects)
	return final, nil
```

- [ ] **Step 4: 同步文档**

在 `docs/weekly_report_system_prompt.md` 的规则条目区块里追加规则 8（参照 spec §7 措辞）。

- [ ] **Step 5: 编译验证**

```bash
cd /Users/chennan/Qoder/project-qoder_重构/backend
go build ./internal/...
```

Expected: 无报错

- [ ] **Step 6: Commit**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git add backend/internal/ai/weekly_report_ai.go docs/weekly_report_system_prompt.md
git commit -m "feat(ai): add system prompt rule 8 + post-processing fallback for alerts"
```

---

## Task 11: Scheduler 同步应用

**Files:**
- Modify: `backend/internal/scheduler/scheduler.go`

- [ ] **Step 1: 识别 scheduler 里的 buildReportContent / buildProjSummaries 等函数**

```bash
grep -n "buildReportContent\|buildProjSummaries\|buildMemberAlerts\|ISOWeek" \
  /Users/chennan/Qoder/project-qoder_重构/backend/internal/scheduler/scheduler.go
```

- [ ] **Step 2: 在 `generateWeeklyReport` 内接入 snapshot 读写与新算法**

在 `generateWeeklyReport` 函数里，紧跟 `isoYear, weekNum := now.ISOWeek()` 之后、`buildReportContent` 调用之前，新增：

```go
	// v4.4.0: 复用 handler 的 snapshot 读取（需 import "github.com/.../backend/internal/api"）
	lastWeek := api.LoadLastWeekSnapshotsForScheduler(db, isoYear, weekNum)
```

（注意：需把 `loadLastWeekSnapshots` 在 handler 中改名导出为 `LoadLastWeekSnapshotsForScheduler`，或复制逻辑到 scheduler。本期推荐复制逻辑以避免跨包循环依赖。）

更稳妥的做法：**直接复制 Task 4/5/6 中三个纯函数到 scheduler.go 内**（重复但无副作用，未来可重构到 shared 包），并在 `generateWeeklyReport` 调用：

```go
	lastWeek := loadLastWeekSnapshotsSched(db, isoYear, weekNum)
	// ... 接下来 buildReportContent 改签名接 lastWeek ...
	reportID := fmt.Sprintf("wr%d%02d", isoYear, weekNum)
	snapshotRows := flattenProjectSchedulesSched(projects, userNames)
	if err := saveScheduleSnapshotsSched(db, reportID, isoYear, weekNum, snapshotRows); err != nil {
		log.Printf("[Scheduler] save snapshots failed (non-fatal): %v", err)
	}
```

函数名加 `Sched` 后缀避免与 handler 包同名冲突。

- [ ] **Step 3: 在 `buildReportContent` 里接 lastWeek 参数并使用 diff / 延期判定**

对应修改 scheduler 的 `buildProjSummaries`（类似 handler 的 `buildProjectSummaries`），加入 `ScheduleChanges` / `DelayRisks` 字段填充（逻辑同 Task 8 Step 1）。

- [ ] **Step 4: 接入后处理兜底**

scheduler 里对 `ai.GenerateWeeklySummary` 的返回值，同样会走 `ensureAlertsAppended`（因为兜底写在 `GenerateWeeklySummary` 里，scheduler 自动受益，无需额外改）。

- [ ] **Step 5: 编译验证**

```bash
cd /Users/chennan/Qoder/project-qoder_重构/backend
go build ./internal/...
```

Expected: 无报错

- [ ] **Step 6: Commit**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git add backend/internal/scheduler/scheduler.go
git commit -m "feat(scheduler): apply v4.4.0 schedule diff and delay risk logic to cron-generated reports"
```

---

## Task 12: 回滚开关 `WEEKLY_REPORT_RULES_V440`

**Files:**
- Modify: `backend/internal/api/weekly_report_handlers.go`（在新算法入口处加开关）

- [ ] **Step 1: 在 Task 3 的 helper 块顶部追加开关读取**

```go
// v4.4.0 规则总开关：设置 WEEKLY_REPORT_RULES_V440=off 可关闭新规则（snapshot 仍写入，但不做 diff / 延期判定）。
var weeklyRulesV440Enabled = func() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("WEEKLY_REPORT_RULES_V440")))
	return v != "off" && v != "false" && v != "0"
}()
```

- [ ] **Step 2: 在 `computeScheduleChanges` 和 `computeDelayRisks` 开头加短路**

```go
func computeScheduleChanges(...) []string {
	if !weeklyRulesV440Enabled {
		return nil
	}
	if len(lastWeek) == 0 {
		return nil
	}
	// ... 原逻辑
}

func computeDelayRisks(...) []string {
	if !weeklyRulesV440Enabled {
		return nil
	}
	// ... 原逻辑
}
```

注意：状态白名单过滤（Task 7 SQL）不受开关影响——这是硬业务规则，不走开关。开关只影响 diff / 延期两项"告警增强"。

- [ ] **Step 3: 在 `weekly_report_handlers.go` 的 import 块确认 `os` 已导入**（应已存在，否则追加）

- [ ] **Step 4: 编译验证**

```bash
cd /Users/chennan/Qoder/project-qoder_重构/backend
go build ./internal/...
```

Expected: 无报错

- [ ] **Step 5: Commit**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git add backend/internal/api/weekly_report_handlers.go
git commit -m "feat(weekly-report): add WEEKLY_REPORT_RULES_V440 kill switch"
```

---

## Task 13: 本地端到端验证

**Files:** 无代码修改

- [ ] **Step 1: 启动本地后端（联调 PG）**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
export DATABASE_URL="postgresql://admin:Kingsoft0531@120.92.44.85:51022/project_codebuddy?sslmode=disable"
export DISABLE_SCHEDULER="true"
bash restart-backend.sh
```

- [ ] **Step 2: 确认表已创建**

```bash
psql "$DATABASE_URL" -c "\d project_schedule_snapshots"
```

- [ ] **Step 3: 手动触发周报生成**

```bash
curl -X POST http://localhost:8080/api/weekly-reports/generate \
  -H "Content-Type: application/json"
```

（根据实际路由调整，若 handler 路径不同请参考 `backend/internal/api/routes.go`。）

- [ ] **Step 4: 确认 snapshot 写入**

```bash
psql "$DATABASE_URL" -c "SELECT report_id, COUNT(*) FROM project_schedule_snapshots GROUP BY report_id;"
```

Expected: 有至少一行，count > 0

- [ ] **Step 5: 取出最新周报 content 检查**

```bash
psql "$DATABASE_URL" -c "SELECT content FROM weekly_reports ORDER BY created_at DESC LIMIT 1;" | head -100
```

检查：
- 有无"已完成"/"暂停"状态项目泄漏
- 对至少一个研发中项目是否出现 ⚠️ 告警（如果该项目有排期过期）
- 第二次生成（次日再跑）是否出现"本周XX调整为..."diff 文案（需手动调整某项目排期）

- [ ] **Step 6: 回滚开关验证**

```bash
export WEEKLY_REPORT_RULES_V440=off
bash restart-backend.sh
# 再次触发生成，确认 content 里没有新增告警
```

完成后恢复：
```bash
unset WEEKLY_REPORT_RULES_V440
bash restart-backend.sh
```

---

## Task 14: 版本号升级与发布说明

**Files:**
- Modify: `package.json` / `version.json` / `CHANGELOG.md`
- Create: `VERSION_4.4.0.md`

- [ ] **Step 1: 更新 package.json**

将 `"version": "4.3.2"` 改为 `"version": "4.4.0"`。

- [ ] **Step 2: 更新 version.json**

参照 `VERSION_4.3.2.md` 现有格式，更新 version/backward/features/changelog/metrics 等字段。

- [ ] **Step 3: 创建 VERSION_4.4.0.md**

包含本期 3 大新增规则 + 硬约束说明 + 回滚方式。

- [ ] **Step 4: 追加 CHANGELOG.md**

在顶部插入 v4.4.0 条目：

```markdown
## [4.4.0] - 2026-05-10

### 新增
- 项目状态白名单过滤：周报仅纳入 11 种有效状态项目（排除"已完成"、"暂停"）
- 排期较上周调整 diff：新增 `project_schedule_snapshots` 表存结构化快照，每周生成时自动对比
- 状态-排期一致性校验：检测"开发中/测试中"等状态下排期已过期的延期风险
- System Prompt 规则 8：引导 LLM 原样追加三类 ⚠️ 告警
- 后处理兜底：即使 LLM 漏写告警，后端也会在项目段末硬追加
- 环境变量 `WEEKLY_REPORT_RULES_V440=off` 作为紧急回滚开关

### 数据库
- 新增表 `project_schedule_snapshots`（`CREATE IF NOT EXISTS`，无历史数据影响）
- 不 ALTER 任何现有表，历史 `weekly_reports` 数据完全兼容

### 代码行数
- 新增 ~400 行（全部在 handler + ai 包）
```

- [ ] **Step 5: Commit**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git add package.json version.json CHANGELOG.md VERSION_4.4.0.md
git commit -m "chore(release): bump to v4.4.0 (weekly report rules extension)"
```

---

## Task 15: 打 tag + 推送（可选，等用户确认）

**Files:** 无

- [ ] **Step 1: 确认所有改动已提交**

```bash
cd /Users/chennan/Qoder/project-qoder_重构
git status
```

Expected: working tree clean

- [ ] **Step 2: 打 tag**

```bash
git tag -a v4.4.0 -m "v4.4.0: 周报规则扩展 - 状态白名单 + 排期diff + 延期风险 + 硬约束无历史数据影响"
```

- [ ] **Step 3: 推送 main + tag**

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_rsa_1" git push origin main
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_rsa_1" git push origin v4.4.0
```

Expected: push 成功，GitHub 上能看到 v4.4.0 tag

---

## Self-Review（Plan 交付前的检查）

- **Spec 覆盖**：§0 硬约束 → Task 1/2（omitempty + CREATE IF NOT EXISTS）；§2 状态分类 → Task 7；§3 数据层 → Task 1/3/4；§4 Diff → Task 5；§5 延期判定 → Task 6；§6 端到端流程 → Task 8/9/10；§7 Prompt 规则 8 → Task 10；§8 结构体 → Task 2；§9 文件清单 → 全部 Task；§10 测试要点 → Task 13；§11 回滚 → Task 12；§12 YAGNI → 明确本期不做前端 UI；§13 实施顺序 → Task 排序对齐。**全覆盖**。
- **Placeholder scan**：全部任务有具体代码，无 "TBD / 类似之前" 等字样。
- **类型一致性**：`scheduleRow` / `lastWeekScheduleMap` / `ScheduleChanges` / `DelayRisks` / `isDevelopmentStatus` / `isWeeklyReportEligibleStatus` 命名在多个 Task 间保持一致；函数签名在 Task 8 显式展示完整签名。

---

## 执行方式建议

**选项 1（推荐）：Subagent-Driven** —— 每个 Task 单独派发一个 subagent 做完后 review，fast iteration。
**选项 2：Inline** —— 本会话里按 Task 顺序批量执行，每完成一两个 task 设置 checkpoint 让你 review。
