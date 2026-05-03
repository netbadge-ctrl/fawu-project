# v4.2.0 — 周报OKR周期修正 + 项目编辑体验优化

> 发布日期：2026-02-27

## 修复

### 1. 周报OKR内容与实际2026H1对不上（核心 Bug）
- **根因**：两套 OKR（2026-H1 / 2025-H2）使用了相同的 KR ID（`o1::kr1` … `o5::kr3`），但 objective/desc 内容不同。原代码 `SELECT … FROM okr_sets ORDER BY period_id DESC` 把所有周期 OKR 全量加载并依次写入 `krToObjective` map，**后遍历的 2025-H2 覆盖了 2026-H1**。
- **修复**：周报构建链路（生成 + 重新生成 + scheduler 定时任务）只查询当前周期（按北京时区，1–6 月→`H1`，7–12 月→`H2`），找不到再回退到最新周期。
- 涉及文件：
  - `backend/internal/api/weekly_report_handlers.go`
  - `backend/internal/scheduler/scheduler.go`

### 2. 项目文档链接保存错
- **根因**：粘贴"中文标题 + URL"混合文本时，整段被作为 `url` 字段保存；浏览器对非 http(s) 开头的 `<a href>` 按相对路径处理，拼上 `window.location.origin`。
- **修复**：新增 `utils.ts#extractUrl()` 提取首个 http(s) URL，新增 `safeHref()` 兜底已入库的脏数据。`ProjectDetailModal` / `DocumentModal` 接入。

### 3. 本地联调连线上 PostgreSQL 建表失败
- **根因**：`weekly_reports` / `weekly_report_versions` 建表 SQL 使用了 SQLite 的 `DATETIME` 类型，PG 不识别。
- **修复**：统一改为 `TIMESTAMP`，兼容两种数据库。

## 新功能

### 项目编辑：部门OKR 强制关联校验
- 优先级切换为"部门OKR"时，自动弹出 KR 选择框；若用户关闭弹窗仍未选 KR，弹 alert 提示并**自动还原优先级到切换前的值**。
- 同时在"关联的 OKR"区域常驻红色提示 `⚠ 部门OKR 必须关联一个 KR`。

### 项目编辑：布局优化
- 优先级 ＋ 关联OKR 同一行；状态 ＋ 上线时间 同一行。
- 两行均使用 `grid-cols-[120px_1fr]`：左列固定 120px，右列吃完剩余宽度，让"关联OKR"和"上线时间"往左挪并获得更大可视空间。
- "修改关联 / 选择关联"按钮上移到"关联的 OKR"字段标题行右侧，按钮尺寸缩小（`px-1.5 py-0.5 text-[11px]`），不再独占一行。

### KR 选择弹窗瘦身
| 区域 | 原 | 现 |
|---|---|---|
| 头部内边距 | `p-6` | `px-5 py-3` |
| 标题字号 | `text-xl` | `text-base` |
| 内容滚动高度 | `max-h-96`(384px) | `max-h-[480px]` |
| 底部按钮 | `px-6 py-3 text-base` | `px-4 py-1.5 text-sm` |

### 后端可调试性
- `backend/main.go` 新增 `DISABLE_SCHEDULER=true` 环境变量开关，本地联调连线上 PG 时设此开关，避免和线上正式 backend 重复触发 cron。

## 兼容性
- 向后兼容 v4.1.3
- 数据库：自动建立 `weekly_reports` / `weekly_report_versions` 两张新表（已存在则跳过）
- 现有项目数据无需迁移
