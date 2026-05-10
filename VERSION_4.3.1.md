# v4.3.1 — 周报周号时区修正 + 2026调休补班日 + 凭证环境变量化 + HTML 剥离兜底

> 发布日期：2026-05-10

## 修复

### 1. 周报前端 ISO 周号与后端不一致
- **根因**：`WeeklyReport.tsx#getWeekNumber` 走 `Date.UTC` 计算 ISO 周号，北京时区周一凌晨 00:00~08:00 段 UTC 仍属上周日，与后端 Go `ISOWeek()`（按服务器本地时区）偏差 1 周，出现「已生成本周周报但页面仍展示上一周」的边缘误判。
- **修复**：`getWeekNumber` 改用本地时间构造 `Date`，与后端 `ISOWeek` 对齐。
- 涉及文件：`components/WeeklyReport.tsx`

### 2. 2026 年调休补班日被误判为非工作日
- **根因**：`utils/holidays.ts#isWorkingDay` 只检查「周末 + 法定节假日」，未处理国务院明确要求的「周末补班日」，排期天数统计会把这些补班日剔除，导致统计值偏小。
- **修复**：
  - 新增 `MAKEUP_WORK_DATES`（2026 年：2/14、2/28、4/26、5/9、9/19、10/10）。
  - `isWorkingDay` 优先级调整：命中补班日 → 工作日；否则按「周末 → 非工作日 → 法定节假日 → 非工作日」流程判定。
- 涉及文件：`utils/holidays.ts`

### 3. AI 周报 prompt 出现裸 HTML 标签
- **根因**：`stripHTML` / `stripHtmlTags` 采用枚举式 `ReplaceAll`，只覆盖 `<p>`、`<strong>`、`<br>`、`&nbsp;`，富文本编辑器的 `<ul>/<li>/<h3>/<span style>` 等标签会残留进入 LLM 上下文。
- **修复**：两处函数新增正则兜底 `<[^>]+>` 清除残留标签；`</p>` 统一转换为换行，保留段落语义。
- 涉及文件：
  - `backend/internal/api/weekly_report_handlers.go`
  - `backend/internal/scheduler/scheduler.go`

## 安全 / 配置化

### GLM 鉴权头支持环境变量
- `backend/internal/ai/weekly_report_ai.go` 的 `glmAuthHdr` 改为初始化函数，优先读取 `GLM_AUTH_HEADER`；未设置时回退到内置默认值，保证线上配置向后兼容。
- 便于秘钥轮换：线上只需注入 env 即可切换，不用改代码。

### 员工接口 Basic Auth 支持环境变量
- `backend/internal/api/handlers.go#fetchEmployeeData` 与 `backend/internal/scheduler/scheduler.go#fetchEmployeeData` 的 `Authorization` 头改为优先读取 `EMPLOYEE_API_AUTH_HEADER`，默认值保持原线上配置。

## 兼容性

- 向后兼容 v4.3.0
- 无数据库迁移
- 无前端 API 破坏性变更
- 环境变量（`GLM_AUTH_HEADER` / `EMPLOYEE_API_AUTH_HEADER`）均提供默认值，未设置不影响现有线上部署

## 验证

- `go build ./...` 编译通过
- `npm run build` 前端构建通过
- 2026 年调休补班日样本校验（2026-02-14 周六 → 工作日；2026-02-15 周日 → 非工作日；2026-02-17 春节 → 非工作日）
