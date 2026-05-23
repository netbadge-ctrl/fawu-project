# v4.4.2 周报系统增强

## 发布日期
2026-05-23

## 更新内容

### 1. 周报 HTML 样式清洗增强
- 重写后端 `stripHTML` 函数，7步清洗流程（实体解码 → style块移除 → 语义标签替换 → 正则兜底 → CSS变量清除 → 二次实体解码 → 空白清理）
- 前端 `RichTextInput` 组件新增 `handlePaste` 事件处理器，粘贴时自动去除所有格式仅保留纯文本
- 彻底解决从外部复制粘贴内容时带入 Tailwind CSS 变量和 HTML 标签的问题

### 2. OKR 排序修复
- 修复 `buildWeeklyReportContent` 函数中遍历 `krProjects` map 导致的 OKR 顺序随机问题
- 改为按 `okrSets` 原始数组顺序构建 `okrSummaries`，确保 O1/O2/O3... 与数据库一致
- 解决 Summary 中 O1 显示为"提升资产管理平台能力"而非"KSCC产品化，为外部企业赋能"的问题

### 3. Summary 输出格式优化
- 移除所有 Markdown 标记（`##` `###` `**`），改为纯文本格式
- Objective 标题使用 `1. xxx` 格式，KR 使用 `1.1 xxx` 格式
- 前端 Summary 渲染支持标题行加粗（Objective bold / KR semibold），提升可读性
- 项目名使用【】包裹，不使用代码块、引用块

### 4. 排期告警从 Summary 移至 Breakdown
- `summaryToAIProject` 不再向 AI 传递 `MemberAlerts`、`ScheduleChanges`、`DelayRisks`
- 移除 `ensureAlertsAppended` 后处理调用
- 所有告警信息仅在 Breakdown 项目卡片中展示

### 5. Breakdown 告警前端渲染
- 更新 `ProjectWeeklySummary` TypeScript 接口，添加 `memberAlerts`、`scheduleChanges`、`delayRisks` 字段
- Breakdown 项目卡片新增黄色高亮告警卡片渲染，包含四类预警：
  - 排期缺失（成员排期截至后14天无新排）
  - 排期延后（结束日期往后推迟）
  - 延期风险（状态与排期不符）
  - 无进展（本周与上周进展实质相同）

### 6. 基于进展文字的风险检测
- 新增 `detectTextBasedRisks` 函数，扫描本周进展描述中的风险关键词
- 5类风险检测：
  - 阻塞/卡点（阻塞、卡住、无法推进、停滞）
  - 延期/推迟（延期、延后、推迟、来不及）
  - 依赖等待（等待、依赖、待确认、待定）
  - 资源不足（人手不足、人力不足）
  - 需求变更（需求变更、方案调整、返工、重做）
- 不单纯依赖项目状态和排期，从实际进展文字中提取风险信号

### 7. AI 调用重试机制
- 重构 `callGLM` 为带重试机制的版本（原函数重命名为 `callGLMOnce`）
- 最多重试 2 次，渐增 temperature（每次 +0.1），间隔 2 秒
- 解决 GLM 返回空内容导致 Summary 为空的问题

### 8. 排期告警精简
- `computeScheduleChanges` 只报"延后"一种情况
- 从没排期到有排期、排期提前、排期取消都不再生成告警

### 9. 时间显示修复
- `formatDateTime` 和 `timeAgo` 函数强制转换为北京时间（UTC+8）
- 解决非东八区用户看到的生成时间不正确的问题

### 10. 无进展检测
- 新增 `computeNoProgressAlert` 函数，基于 LCS 算法计算文本相似度
- 本周与上周进展实质相同（相似度 ≥85%）时生成"无进展"告警

## 技术变更

### 后端
- `backend/internal/api/weekly_report_handlers.go`
  - `stripHTML` 函数重写
  - `buildWeeklyReportContent` OKR 排序逻辑重构
  - `summaryToAIProject` 移除告警传递
  - `computeScheduleChanges` 精简为只报延后
  - 新增 `computeNoProgressAlert`、`normalizeForComparison`、`textSimilarity` 函数
  - 新增 `detectTextBasedRisks` 函数
  - 新增 `decodeHTMLEntity` 辅助函数

- `backend/internal/ai/weekly_report_ai.go`
  - `callGLM` 增加重试机制
  - `weeklySystemPrompt` 更新为纯文本格式要求
  - `GenerateWeeklySummary` 移除 Markdown 标记
  - 移除 `ensureAlertsAppended` 调用

### 前端
- `components/WeeklyReport.tsx`
  - `ProjectWeeklySummary` 接口扩展
  - Summary 渲染改为按行解析，支持标题加粗
  - Breakdown 告警卡片渲染
  - `formatDateTime` 和 `timeAgo` 北京时间转换

- `components/RichTextInput.tsx`
  - 新增 `handlePaste` 事件处理器

## 验证清单
- [x] 后端编译通过
- [x] 前端 TypeScript 检查通过
- [x] 本地服务启动正常
- [x] HTML 样式不再出现在周报中
- [x] OKR 顺序与数据库一致
- [x] Summary 为纯文本格式
- [x] Breakdown 告警正确展示
- [x] 时间显示为北京时间

## 部署说明
1. 提交代码到 GitHub main 分支
2. 登录线上服务器 120.92.36.175
3. 拉取最新代码并构建
4. 重启后端服务
5. 验证前端正常访问
