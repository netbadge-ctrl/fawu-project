# v4.3.2 — 周报生成链路修复：ISO年边界 + OkrID语义 + 推进型告警降噪 + 前端HTML兜底

> 发布日期：2026-05-10

## 背景

v4.3.1 发布后对周报全链路做了一次代码 review，发现 4 处可被确认的 Bug / 代码缺陷。本版本集中修复。

## 修复

### 1. 跨年边界的 ISO 年错乱（高优）
- **根因**：`handler.GenerateWeeklyReport` 与 `scheduler.generateWeeklyReport` 都使用了日历年（`now.Year()` / `now.Date()`），但周号走的是 `now.ISOWeek()`。在年末/年初跨年边界，ISO 年与日历年会偏差 1 年。
  - 示例：2025-12-31（周三）→ `ISOWeek()` 返回 `(2026, 1)`，`now.Year()` 返回 `2025`。
  - 影响：
    - `reportID = fmt.Sprintf("wr%d%02d", year, weekNum)` 生成 `wr202501`（应为 `wr202601`）
    - `WHERE week_year=$1 AND week_number=$2` 查询用 `2025, 1`（应为 `2026, 1`），可能查不到已存在的周报，导致重复插入
- **修复**：统一改用 `isoYear, weekNum := now.ISOWeek()` 的第一个返回值作为年份。
- 涉及文件：
  - `backend/internal/api/weekly_report_handlers.go`
  - `backend/internal/scheduler/scheduler.go`

### 2. Scheduler `buildReportContent` OkrID 错误
- **根因**：scheduler 构建 `OkrWeeklySummary` 时，`OkrID: krId` 错误地用 KR 的 ID 作为 OKR 的 ID；dedup key 仅用 `objective` 文本匹配，语义不稳固。
- **修复**：
  - 新增 `krToOkrID` 映射（KR ID → 真实 Objective ID），与 handler 层对齐。
  - `OkrID` 改为真实 Objective ID；`okrKey` 改为 `okrId + "|" + objective`，同一 O 下多个 KR 正确归集。
- 涉及文件：`backend/internal/scheduler/scheduler.go`

### 3. 推进型项目的成员排期告警噪音
- **根因**：推进型项目（`is_driving_only=true`，状态为『项目进行中』）不涉及开发排期，`ScheduleText` 已置空；但 `buildProjectMemberAlerts` 仍会针对 BackendDevelopers / FrontendDevelopers / QaTesters 生成 `⚠️ xxx 排期缺失` 告警，进入 AI prompt 后产生不合理提示。
- **修复**：`isDriving=true` 时同步跳过告警生成。
- 涉及文件：
  - `backend/internal/api/weekly_report_handlers.go#buildProjectSummaries`
  - `backend/internal/scheduler/scheduler.go#buildProjSummaries`

### 4. 前端 `stripHtml` 未与后端对齐
- **根因**：后端 v4.3.1 已加入正则 `<[^>]+>` 兜底剥除 `<ul>/<li>/<h3>/<span>` 等标签，前端 `components/WeeklyReport.tsx#stripHtml` 未同步。
- **修复**：
  - 增加 `/<[^>]+>/g` 兜底
  - `<br>/<br\/>` 两条合并为大小写不敏感的 `/<br\s*\/?>/gi`
- 涉及文件：`components/WeeklyReport.tsx`

## 清理

### 移除死代码 `CallProjectShortSummary`
- v4.3.0 的 changelog 已声明移除"单项目 80 字短总结"，但函数仍保留在 `weekly_report_ai.go`。本版本彻底删除。

## 兼容性

- 向后兼容 v4.3.1
- 无数据库迁移
- 无前端 API 破坏性变更
- 周报主表数据无需回溯（历史周报 ID 已生成，不受影响）

## 验证

- `go build ./internal/...` 编译通过
- `tsc --noEmit` 针对 `WeeklyReport.tsx` 无新增错误

## 影响示例

| 场景 | v4.3.1 行为 | v4.3.2 行为 |
|---|---|---|
| 2025-12-31 周三触发周报 | 写入 `week_year=2025, week_number=1`（错） | 写入 `week_year=2026, week_number=1`（正确）|
| 同一 O 下 2 个 KR（scheduler） | dedup 按 objective 文本匹配 | dedup 按真实 OKR ID + objective |
| 推进型项目有历史研发成员 | AI prompt 含 `⚠️ xxx 排期缺失` | 不生成该告警，AI 只看本周推进 |
| 前端展示含 `<ul><li>...` 内容 | 裸标签显示 | 标签剥除后纯文本展示 |
