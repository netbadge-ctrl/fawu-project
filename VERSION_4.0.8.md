# Version 4.0.8

## 发布日期
2026-02-27

## 更新内容

### 功能优化
- **项目总览交互统一化**: 将新建项目和编辑项目的交互从行内编辑改为弹窗模式，与个人视图保持一致
  - 新增项目时打开弹窗编辑
  - 编辑现有项目时打开弹窗而不是行内编辑
  - 统一使用 `ProjectDetailModal` 组件

### Bug 修复
- **修复本地预览 OIDC 循环刷新问题**: 优化开发模式判断逻辑，确保本地预览时正确禁用 OIDC 认证
  - 修复 `index.tsx` 中的环境变量判断
  - 修复 `api.ts` 中的 JWT 认证刷新逻辑
  - 修复 `config/env.ts` 中的布尔值解析

- **修复日期显示格式问题**: 项目总览中的"提出时间"和"上线时间"现在正确显示为 `YYYY-MM-DD` 格式，不再显示 ISO 8601 格式的 `T` 和 `Z`

## 技术变更
- 新增 `newProjectDraft` 状态管理新建项目草稿
- 扩展 `ModalType` 类型添加 `'edit'` 类型
- 移除 `ProjectOverview` 和 `ProjectTable` 中的行内编辑逻辑

## 文件变更
- `App.tsx` - 添加弹窗状态管理和渲染逻辑
- `components/ProjectOverview.tsx` - 移除行内编辑相关代码
- `components/ProjectTable.tsx` - 简化行组件，修复日期显示
- `components/MainContent.tsx` - 同步更新 props
- `index.tsx` - 修复开发模式判断
- `api.ts` - 修复开发模式判断和 JWT 刷新逻辑
- `config/env.ts` - 修复布尔值环境变量解析
