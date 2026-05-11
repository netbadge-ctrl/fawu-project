# 周报规则扩展 · 设计方案（v4.4.1）

- **日期**：2026-05-10
- **作者**：Qoder Agent
- **关联版本**：v4.3.2 → v4.4.1
- **状态**：待实施（spec 已 approve，等待 spec review 后进入 writing-plans）

---

## 0. 硬约束

> **数据库变更不得影响历史逻辑与历史数据。**

具体含义：
1. **不允许 ALTER 现有表**（`projects` / `weekly_reports` / `okr_sets` 等结构保持不变）。
2. 所有新数据结构必须落在**新表**，由 `database.go` 的 `CREATE TABLE IF NOT EXISTS` 动态建表（与 `weekly_report_versions` 同模式）。
3. **新表不存在或为空时，所有新规则必须能优雅降级**：
   - 没有上周 snapshot → schedule diff 列表为空，不影响生成
   - 延期判定仍独立工作（只依赖项目当前状态 + 当前排期）
4. `ProjectWeeklySummary` / `ProjectInput` 结构体新增字段统一加 `omitempty`，保证旧版本 JSON 向前兼容。
5. 历史 `weekly_reports.content` JSON 的结构在读出时按 `omitempty` 解析，不会因字段缺失报错。

---

## 1. 业务背景

v4.3.2 周报已完成 "按 OKR 分批 + 推进型项目 + 停滞检测" 等核心功能，但仍存在三个业务缺口：

| # | 缺口 | 影响 |
|---|---|---|
| 1 | 无状态白名单，`已完成`/`暂停` 项目也会出现 | 信息噪声 |
| 2 | 无排期历史对比，看不出"本周排期较上周有没有调整" | 周报难以反映风险演化 |
| 3 | 无状态↔排期一致性校验，项目"开发中"但排期已过也不会提示 | 容易掩盖延期 |

本设计解决这三个缺口。

---

## 2. 状态分类体系

项目状态枚举共 13 种（`types.ts#ProjectStatus`），按本设计分四类：

| 分类 | 状态集合 | 数据管道动作 |
|---|---|---|
| **研发中**（9 种） | 未开始、讨论中、产品设计、需求完成、评审完成、开发中、开发完成、测试中、测试完成 | 展示排期 + 排期 diff + 延期判定 |
| **已上线**（1 种） | 本周已上线 | 进入周报；**不**展示排期、**不**做 diff、**不**做延期判定 |
| **推进型**（1 种） | 项目进行中 | 保留 v4.3.2 的 `IsDrivingOnly=true` 推进型逻辑，不看排期 |
| **过滤掉**（2 种） | 已完成、暂停 | SQL 直接排除，不进入周报 |

状态过滤落点：`fetchWeeklyReportData` 的 SQL `WHERE` 子句增加 `AND status IN (...)`（研发中 + 本周已上线 + 项目进行中 = 11 种）。

---

## 3. 数据层设计

### 3.1 新表：`project_schedule_snapshots`

```sql
CREATE TABLE IF NOT EXISTS project_schedule_snapshots (
    id           SERIAL PRIMARY KEY,
    report_id    VARCHAR(16) NOT NULL,   -- 关联 weekly_reports.report_id，如 wr202619
    iso_year     INT NOT NULL,
    week_number  INT NOT NULL,
    project_id   VARCHAR(64) NOT NULL,
    role         VARCHAR(16) NOT NULL,   -- 'backend' | 'frontend' | 'qa'
    user_id      VARCHAR(64) NOT NULL,
    user_name    VARCHAR(64) NOT NULL,
    start_date   DATE,
    end_date     DATE,
    status       VARCHAR(32),            -- 快照时的项目状态，用于审计回溯
    created_at   TIMESTAMP DEFAULT NOW(),
    UNIQUE(report_id, project_id, role, user_id, start_date)
);
CREATE INDEX IF NOT EXISTS idx_pss_project_week
    ON project_schedule_snapshots(project_id, iso_year, week_number);
CREATE INDEX IF NOT EXISTS idx_pss_week
    ON project_schedule_snapshots(iso_year, week_number);
```

**字段释义**：
- `UNIQUE(report_id, project_id, role, user_id, start_date)`：保证同一周、同一项目、同一角色、同一人的同一 TimeSlot 不重复写入（重复生成时幂等）
- `start_date` / `end_date` 允许 NULL，兼容"有成员但未填排期"的历史数据
- `status` 记录快照时间点的项目状态，方便后续回溯分析"为什么这一周把延期风险判为 X"

**建表位置**：`backend/internal/database/database.go` 内 `init()` 或 `InitDatabase()` 附近，跟 `weekly_report_versions` 等建表语句相邻。

### 3.2 写入时机

`buildWeeklyReportContent` 内、生成 `ProjectWeeklySummary` **之后**、返回 `WeeklyReportContent` **之前**：

```go
// 伪码
snapshotRows := flattenSchedules(projects, iso_year, week_number, report_id)
tx, _ := db.Begin()
// 幂等：同 report_id 先删后插，避免重复生成污染
tx.Exec("DELETE FROM project_schedule_snapshots WHERE report_id = $1", report_id)
for _, row := range snapshotRows {
    tx.Exec("INSERT INTO ... ON CONFLICT DO NOTHING", ...)
}
tx.Commit()
```

### 3.3 读取时机

`buildProjectSummaries` 执行前：

```go
lastWeekMap := loadLastWeekSnapshots(db, iso_year, week_number)
// map[projectId]map[role]map[userId]ScheduleSnapshot
```

计算"上周周号"需处理跨年：用 Go `time` 计算 `now.AddDate(0,0,-7).ISOWeek()`。

---

## 4. Schedule Diff 算法

对每个"研发中"状态的项目：

```
本周排期集 = 展开 project.TimeSlots 后的 {role, userId, min(start), max(end)}
上周排期集 = lastWeekMap[project.id]

三类 diff：
- ADDED   : (role, userId) ∈ 本周 ∧ ∉ 上周     → "本周{role}新增 {name} {MM.DD}~{MM.DD}"
- REMOVED : (role, userId) ∈ 上周 ∧ ∉ 本周     → "本周{role} {name} 取消排期（上周 {MM.DD}~{MM.DD}）"
- CHANGED : 两周都有，start/end 不全相等        → "本周{role} {name} 原 {MM.DD}~{MM.DD} 调整为 {MM.DD}~{MM.DD}"
            + 若 end 延后 > 0 天，加"（延后 N 天）"
            + 若 end 提前 > 0 天，加"（提前 N 天）"
```

**边界条件**：
- 上周无任何记录（首次运行 / 上周报告未生成）→ 全部 `ADDED`，但**不输出 diff 文案**（避免首周海量无意义提示），由 `len(lastWeekMap) == 0` 判空跳过
- 上周有该项目但无该 (role, userId)，本周有 → 才算真正的 `ADDED`

---

## 5. 延期风险判定

**基准日期**：`weekEnd` = 本周末周日 23:59:59（已在 handler 里计算好）

**判定规则表**：

| 状态 | 需要检查的角色 | 触发条件 |
|---|---|---|
| 未开始 / 讨论中 / 产品设计 | — | 不判定 |
| 需求完成 / 评审完成 | 后端 OR 前端 | 任一研发角色的 `max(endDate)` < `weekEnd` 即告警 |
| 开发中 / 开发完成 | 后端 AND 前端（逐个角色判） | 每个角色独立告警 |
| 测试中 / 测试完成 | 测试 | 测试角色 `max(endDate)` < `weekEnd` 告警 |
| 本周已上线 / 项目进行中 | — | 不判定 |

**角色无排期**的处理：
- 研发中状态但某角色**完全没排期** → 复用现有 `buildProjectMemberAlerts` 的"排期缺失"告警（14 天外），**不**作为延期风险重复告警
- 研发中状态但某角色**排期已过** → 本次新增的延期风险告警

**文案规范（按角色粒度，含明确主语）**：

```
⚠️ 后端 张三 排期截至 05-03，当前状态"开发中"，存在延期风险（请确认续排或调整状态）
⚠️ 测试 李四 排期截至 05-07，当前状态"测试中"，存在延期风险（请确认续排或调整状态）
```

---

## 6. 数据流（端到端）

```
┌─────────────────────────────────────────────────────────────┐
│ handlers.GenerateWeeklyReport / scheduler.generateWeeklyReport │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ fetchWeeklyReportData                                         │
│  SQL: WHERE weekly_update 非空 AND status IN (11种白名单)     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ loadLastWeekSnapshots(iso_year-1w, week_num-1w)              │
│  → lastWeekMap[projectId][role][userId] = (start, end)       │
│  首次运行时返回空 map（不影响后续）                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ buildProjectSummaries (enhanced)                              │
│  对每个项目：                                                  │
│   ① 计算 ScheduleText（仅研发中 9 状态）                        │
│   ② 计算 MemberAlerts（排期缺失，沿用）                         │
│   ③ 计算 ScheduleChanges（新增：diff）                         │
│   ④ 计算 DelayRisks（新增：状态-排期一致性）                     │
│   ⑤ 已上线/推进型：③④ 置空                                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ saveCurrentWeekSnapshots(report_id, iso_year, week_num)      │
│  幂等写入 project_schedule_snapshots                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ convertContentToAIInput                                        │
│  合并 MemberAlerts = 排期缺失 + ScheduleChanges + DelayRisks  │
│  (仍复用 ai.ProjectInput.MemberAlerts 字段，保持兼容)          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ ai.GenerateWeeklySummary (glm-5.1, 按 OKR 分批)                │
│  System Prompt 规则 8：三类 ⚠️ 告警必须原样追加在项目段末        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 后处理兜底：扫描每个项目段落，检查告警关键字是否在生成文本里     │
│  缺失 → 在该项目段末硬追加 ⚠️ 行                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
               final markdown → weekly_reports.content
```

---

## 7. System Prompt 增补规则

在 [backend/internal/ai/weekly_report_ai.go#L97-L112](../../../backend/internal/ai/weekly_report_ai.go) 现有 7 条规则基础上新增：

> **8. `member_alerts` 可能包含三类 ⚠️ 提示（排期缺失 / 排期调整 / 延期风险），必须全部在该项目末尾原样追加，禁止合并、改写、省略或翻译；保持与输入完全一致的文案、标点与 emoji。**

字数上限（单 O 段 300-800 字）不变；**告警追加文案不计入主叙述的 2-4 句限制**（即：主叙述 2-4 句 + N 条告警行）。

---

## 8. 结构体改动

### 8.1 `models.ProjectWeeklySummary`（后端 + JSON 传输）

```go
type ProjectWeeklySummary struct {
    // ...v4.3.2 已有字段保留...
    ScheduleChanges []string `json:"scheduleChanges,omitempty"`  // 新增
    DelayRisks      []string `json:"delayRisks,omitempty"`       // 新增
}
```

`omitempty` 保证旧数据 JSON 解析兼容，`content` 字段向前兼容。

### 8.2 `ai.ProjectInput`

**不新增字段**。`MemberAlerts` 继续复用，在 `convertContentToAIInput` 里合并三路告警。注释更新即可。

---

## 9. 受影响文件清单

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `backend/internal/database/database.go` | 新增建表 SQL | `CREATE TABLE IF NOT EXISTS project_schedule_snapshots` + 索引 |
| `backend/internal/models/models.go` | 加字段 | `ProjectWeeklySummary` 新增 `ScheduleChanges` / `DelayRisks`（omitempty） |
| `backend/internal/api/weekly_report_handlers.go` | 核心改造 | ① SQL status 白名单；② snapshot 读/写函数；③ diff 函数；④ 延期判定函数；⑤ `buildProjectSummaries` 接入；⑥ `convertContentToAIInput` 合并告警；⑦ 后处理兜底函数 |
| `backend/internal/scheduler/scheduler.go` | 同步改造 | 复用 handler 里导出（大写）的 helper，避免逻辑分叉 |
| `backend/internal/ai/weekly_report_ai.go` | Prompt 增补 | 新增规则 8；`MemberAlerts` 注释更新 |
| `docs/weekly_report_system_prompt.md` | 文档同步 | 同步规则 8 |
| `components/WeeklyReport.tsx` | 可选增强 | 前端读取 `scheduleChanges`/`delayRisks` 单独展示（本期可不做，后续迭代） |

---

## 10. 测试要点

1. **状态过滤**：数据库 seed 各种状态的项目，验证 `已完成`、`暂停` 未进入周报。
2. **snapshot 幂等性**：重复生成同周周报，snapshot 表行数不爆炸（`ON CONFLICT DO NOTHING` 或 `DELETE + INSERT`）。
3. **首次运行**：清空 snapshot 表后生成周报，不应崩溃；`ScheduleChanges` 全部为空；`DelayRisks` 正常工作。
4. **跨年 ISO 周**：在 `2026-12-28`（ISO 2026 W53 or 2027 W1）这种边界上，"上周"查询 `iso_year, week_number` 不错位。
5. **多 TimeSlot 合并**：同一人多段排期，`min(start)/max(end)` 后再 diff，且 diff 文案只输出一条。
6. **延期判定 vs 排期缺失**：某角色完全无排期 → 只触发"排期缺失"不重复触发"延期风险"。
7. **告警兜底**：mock LLM 返回故意省略 ⚠️ 的文本，后处理应补回所有缺失告警。
8. **推进型项目**：`项目进行中` 状态的项目，三类排期告警全部为空。
9. **向前兼容**：从 v4.3.2 升级 → 启动成功（新表自动建）、读取 v4.3.2 生成的历史 `weekly_reports.content` 不报错。

---

## 11. 回滚方案

若上线后发现问题：
- 环境变量 `WEEKLY_REPORT_RULES_V441=off` 可关闭新规则（snapshot 仍写入，但 diff/延期判定跳过）。
- 若 snapshot 表本身有问题，`DROP TABLE project_schedule_snapshots` 后重建即可，不影响其它数据。
- 代码层面：保留 v4.3.2 分支 tag，紧急时可 revert。

---

## 12. 非本期内容（明确 YAGNI）

以下需求本期不做，留到后续迭代：

- 前端页面新增“排期调整”/“延期风险”独立区块展示（v4.4.1 先在 AI 正文里体现，后续再做专门 UI）
- 历史项目排期回溯页面
- 延期风险的邮件/IM 主动推送
- snapshot 表的定期归档/清理策略（量级很小，短期不需要）

---

## 13. 实施顺序（供 writing-plans 参考）

1. 建表 + 模型字段（DB / models.go）
2. snapshot 读/写函数（独立单元可测）
3. diff 算法 + 延期判定算法（独立单元可测）
4. 合并进 `buildProjectSummaries`
5. `convertContentToAIInput` 合并告警
6. Prompt 规则 8 + 后处理兜底
7. scheduler 复用 handler helper
8. 端到端联调（本地 PG）
9. 版本升 v4.4.1，写 VERSION_4.4.1.md + CHANGELOG
10. 推送 GitHub + 线上部署

---
