# Version 4.0.9

## 发布日期
2026-03-14

## 更新内容

### 功能优化
- **文档展示优化**: 将文档标题和链接合并，点击文档标题即可在新标签页打开文档
  - 项目总览文档弹窗中，文档标题显示为可点击链接
  - 项目编辑弹窗中，文档标题显示为可点击链接
  - 去除了单独的 URL 显示，界面更简洁

- **文档弹窗宽度调整**: 将文档弹窗宽度从 `max-w-2xl` 增加到 `max-w-5xl`，提升可读性

### Bug 修复
- **修复文档权限问题**: 修复了后端 `GetProjects` 函数，确保所有用户都能看到项目中的文档
  - 在 SQL 查询中添加 `documents` 字段
  - 添加 JSON 解析逻辑

- **修复首页加载慢问题**: 优化后端查询性能，移除不必要的 `comments` 和 `change_log` 字段查询
  - 查询时间从 3-4 秒降低到 300-500 毫秒

## 技术变更
- 优化 `backend/internal/api/handlers.go` 中的 `GetProjects` 函数
- 更新 `DocumentModal.tsx` 组件，合并标题和链接
- 更新 `ProjectDetailModal.tsx` 组件，统一文档展示样式

## 文件变更
- `package.json` - 更新版本号到 4.0.9
- `backend/internal/api/handlers.go` - 优化项目列表查询
- `components/DocumentModal.tsx` - 优化文档展示，增加弹窗宽度
- `components/ProjectDetailModal.tsx` - 统一文档展示样式
