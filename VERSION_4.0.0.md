# 版本 4.0.0

## 重构内容

### 1. 代码清理
- 移除所有 `VERSION_*.md` 历史版本文件（保留 CHANGELOG.md）
- 删除未使用的组件：`FilteredProjectList.tsx`、`EnhancedFilterBar.tsx`
- 删除未使用的 mock 数据文件：`data/mockData.ts`

### 2. 性能优化
- `utils.ts`: 使用 `requestIdleCallback` 优化拼音库预热
- `constants.ts`: 移除 180 行硬编码数据，仅保留 `SYSTEM_OPTIONS`
- 清理 20+ 条生产环境不需要的 `console.log` 调试语句

### 3. 认证逻辑修复
- 修复开发模式 OIDC 认证跳转问题
- `auth-context.tsx`: 添加开发模式环境检查，防止意外跳转到 OIDC 登录
- `index.tsx`: 优化 AppGate 组件认证状态处理

### 4. 类型修复
- `MainContent.tsx`: 修复 `ProjectStatus` 类型定义
- `useDropdownPosition.ts`: 修复 `CSSProperties` 导入

### 5. 性能优化
- **数据分阶段加载**: 先加载项目数据（个人视图/项目总览），再后台加载 OKR 和用户数据
- **前端数据缓存**: API 响应缓存 5 分钟，减少重复请求
- **后端连接池**: 配置数据库连接池（最大 25 连接，10 空闲连接）

## 版本信息
- 前端版本: 4.0.0
- 后端版本: 4.0.0

## 环境配置
开发模式 (`npm run dev`):
- `VITE_APP_ENV=development`
- `VITE_ENABLE_OIDC=false`
- 使用模拟用户认证，无需 OIDC 登录

生产模式 (`npm run build`):
- `VITE_APP_ENV=production`
- `VITE_ENABLE_OIDC=true`
- 使用 OIDC 认证流程
