# Version 4.1.0

## 发布日期
2026-03-20

## 更新内容

### 功能优化
- **周会视图本周进展展示优化**:
  - 将展示高度从 5 行调整为 6 行，显示更多内容
  - 优化行间距，从 `margin-bottom: 0.5rem` 调整为 `0.25rem`，减少空间浪费
  - 调整 `line-height` 为 1.4，使内容更紧凑

### Bug 修复
- **修复富文本编辑器标题重复问题**: 
  - 移除了自动恢复受保护标题的逻辑
  - 只在初始化时添加默认标题模板，之后不再自动恢复
  - 用户可以自由编辑和删除标题，不会再出现重复标题

- **修复项目创建后列表不刷新问题**:
  - 创建项目后清除项目缓存 `apiCache.delete('projects')`
  - 删除项目后也清除缓存

- **修复变更记录不显示问题**:
  - 后端添加 `GET /projects/:projectId` 路由获取项目详情
  - 前端添加 `getProjectDetail` API 方法
  - 打开变更记录弹窗时获取完整项目数据（包含变更记录）

- **修复项目删除 404 错误**:
  - 修复 `api.ts` 中 JWT token 传递逻辑，确保所有请求都携带认证头

- **优化首页加载速度**:
  - 后端 `GetProjects` 移除不必要的 `comments` 和 `change_log` 字段查询
  - 查询时间从 3-4 秒降低到 300-500 毫秒

### 开发环境配置
- **创建 `.env.development` 文件**: 专门用于开发环境配置
- **修复 `.env.local` 配置**: 恢复为开发环境配置，禁用 OIDC
- **创建数据库 DDL 文件**: `database/schema.sql` 包含完整的 PostgreSQL 表结构

## 技术变更
- `RichTextInput.tsx` - 移除自动恢复标题逻辑
- `WeeklyMeetingProjectCard.tsx` - 优化展示高度和行间距
- `App.tsx` - 添加项目详情获取逻辑，修复缓存问题
- `api.ts` - 修复 JWT 认证，添加 `getProjectDetail` 方法
- `backend/internal/api/handlers.go` - 优化查询性能
- `backend/internal/api/routes.go` - 添加项目详情路由

## 文件变更
- `package.json` - 更新版本号到 4.1.0
- `components/RichTextInput.tsx` - 修复标题重复问题
- `components/WeeklyMeetingProjectCard.tsx` - 优化展示样式
- `components/ProjectDetailModal.tsx` - 统一文档展示
- `components/DocumentModal.tsx` - 优化文档展示
- `App.tsx` - 修复缓存和变更记录问题
- `api.ts` - 修复 JWT 认证
- `backend/internal/api/handlers.go` - 优化查询
- `backend/internal/api/routes.go` - 添加路由
- `.env.development` - 新增开发环境配置
- `.env.local` - 恢复开发配置
- `database/schema.sql` - 新增数据库 DDL
