# v4.4.1 — 周报规则扩展

**发布日期**：2026-05-10
**主题**：状态白名单过滤 + 排期较上周 diff + 状态-排期不符延期告警
**基线**：v4.3.2

---

## 一、本期解决的业务问题

> 原规则：周报把所有有 `weekly_update` 的项目都拉进来，不看状态；对排期是否"较上周发生调整""状态与排期是否一致"完全没有感知。

本期围绕"**项目状态-排期一致性**"做 4 条硬规则：

1. **白名单过滤**：仅纳入 11 个有效状态的项目（`未开始`/`讨论中`/`产品设计`/`需求完成`/`评审完成`/`开发中`/`开发完成`/`测试中`/`测试完成`/`本周已上线`/`项目进行中`），**排除 `已完成`/`暂停`**。
2. **未上线项目展示排期**：`本周已上线` / `项目进行中` 不展示排期；其余 9 种研发中状态全部展示。
3. **排期较上周调整必须告知**：后端按周存结构化快照，本周生成时与上周 diff，`ADDED` / `CHANGED` / `REMOVED` 三类变化以 ⚠️ 行追加到项目段末。
4. **状态-排期不符告警**：例如"状态=开发中，前端/后端排期已过本周末"→ 提示延期风险，按状态-角色矩阵判定。

---

## 二、硬约束（用户原话：不得影响历史逻辑与历史数据）

| 维度 | 约束 | 落地方式 |
|---|---|---|
| 现有表结构 | 不 ALTER | 仅 `CREATE TABLE IF NOT EXISTS project_schedule_snapshots` |
| 现有 JSON | 向前兼容 | `ScheduleChanges` / `DelayRisks` 均带 `omitempty`，旧 content 反序列化无影响 |
| 历史周报 | 零影响 | 只改本次生成链路；历史 `weekly_reports` 记录不读不写新字段 |
| 首次运行 | 不刷屏 | `lastWeek` 为空时 `computeScheduleChanges` 返回 `nil`（不是所有人都显示"新增排期"） |
| 回滚 | 一个环境变量 | `WEEKLY_REPORT_RULES_V441=off` 关闭 diff/延期（snapshot 继续写） |

---

## 三、状态分类体系

```
全部 13 状态
├─ 研发中 9  {未开始, 讨论中, 产品设计, 需求完成, 评审完成, 开发中, 开发完成, 测试中, 测试完成}
│   → 展示排期 + diff + 延期判定
├─ 不展示排期 2  {本周已上线, 项目进行中}
│   → 纳入周报，但不走排期/diff/延期逻辑
└─ 排除 2  {已完成, 暂停}
    → SQL 层直接过滤
```

辅助函数：
- `isDevelopmentStatus(s)` → 研发中 9 状态
- `isWeeklyReportEligibleStatus(s)` → 白名单 11 状态
- `schedIsDevelopmentStatus` / scheduler 版同名

---

## 四、新增数据表：`project_schedule_snapshots`

```sql
CREATE TABLE IF NOT EXISTS project_schedule_snapshots (
    id           BIGSERIAL PRIMARY KEY,
    report_id    VARCHAR(32)  NOT NULL,
    iso_year     INT          NOT NULL,
    week_number  INT          NOT NULL,
    project_id   VARCHAR(64)  NOT NULL,
    role         VARCHAR(16)  NOT NULL,  -- backend / frontend / qa
    user_id      VARCHAR(64)  NOT NULL,
    user_name    VARCHAR(128) NOT NULL,
    start_date   DATE,
    end_date     DATE,
    status       VARCHAR(32),
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pss_unique ON project_schedule_snapshots
    (report_id, project_id, role, user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_pss_project_week ON project_schedule_snapshots
    (project_id, iso_year, week_number);
CREATE INDEX IF NOT EXISTS idx_pss_week ON project_schedule_snapshots
    (iso_year, week_number);
```

写入时机：每次生成/重新生成周报时**先删后插**同 `report_id` 的所有行，幂等。

---

## 五、告警合并与原样透传

三路告警在后端合并进 `ai.ProjectInput.MemberAlerts`：

```
MemberAlerts[]                  ← v4.3 已有：排期缺失 > 14 天
ScheduleChanges[]  (v4.4.1 新)  ← 排期较上周 diff
DelayRisks[]       (v4.4.1 新)  ← 状态-排期不符
       ↓  合并
ai.ProjectInput.MemberAlerts    ← 三类混在一起喂给 LLM
```

**System Prompt 规则 8**（精简）：
> member_alerts 可能包含三类 ⚠️ 提示，必须全部在项目末尾原样追加，禁止合并、改写、省略或翻译；保持与输入完全一致的文案、标点与 emoji。告警行不计入主叙述 2-4 句限制。

**后处理兜底 `ensureAlertsAppended`**：
- LLM 生成完整篇 markdown 后，后端扫描每个项目段落（以 name 起到空行止）
- 检查每条 alert 是否 `strings.Contains` 出现；缺失者在段末 `\n + alert` 硬追加

即使 LLM 完全无视规则 8，告警也 100% 到达用户。

---

## 六、回滚方案

紧急场景：如新规则在线上产生误报或引起主观吐槽，可在 5 秒内关闭：

```bash
export WEEKLY_REPORT_RULES_V441=off
bash restart-backend.sh
```

- **效果**：`computeScheduleChanges` / `computeDelayRisks`（及 sched 版）立即返回 `nil`，后续周报不再包含新增两类告警
- **不关闭**：SQL 状态白名单（硬业务规则）、snapshot 写入（保证 flag 关闭期间仍在积累上周数据，flag 打开后立即恢复 diff）

完全恢复：

```bash
unset WEEKLY_REPORT_RULES_V441
bash restart-backend.sh
```

数据库层不需要任何回滚动作——新表为加法，旧逻辑不读写它。

---

## 七、文件清单（本期）

**后端 Go**：
- `backend/internal/database/database.go`（+新表 DDL）
- `backend/internal/models/models.go`（+2 字段）
- `backend/internal/api/weekly_report_handlers.go`（+~250 行）
- `backend/internal/scheduler/scheduler.go`（+~290 行，sched* 版本）
- `backend/internal/ai/weekly_report_ai.go`（+规则 8 + ensureAlertsAppended + findNextParaBreak）

**文档**：
- `docs/weekly_report_system_prompt.md`（+规则 5' + 规则 8）
- `docs/superpowers/specs/2026-05-10-weekly-report-rules-extension-design.md`（设计文档）
- `docs/superpowers/plans/2026-05-10-weekly-report-rules-extension-v440.md`（实施计划，历史路径保留）

**版本**：
- `package.json` / `version.json` / `CHANGELOG.md`（本次新增条目） / `VERSION_4.4.1.md`（本文件）

---

## 八、编译 & 验证

```bash
cd backend && go build ./internal/...    # ✅ 通过
```

本地端到端验证（user 手动按 plan Task 13 执行）：
1. 启 local backend 连线上 PG
2. `curl -X POST /api/weekly-reports/generate` 生成
3. `psql` 查 `project_schedule_snapshots` 有行
4. 查 `weekly_reports.content` 无"已完成"/"暂停"项目泄漏
5. 第二次生成前手动调整某项目排期，第三次生成应看到 `⚠️ ... 原 A~B 调整为 A~C（延后 N 天）`
6. `export WEEKLY_REPORT_RULES_V441=off` 再跑一次，确认无新增告警

---

**回滚命令速查**：`export WEEKLY_REPORT_RULES_V441=off && bash restart-backend.sh`
