# 版本 4.1.3 更新说明

## 修复内容

### 1. 筛选条件"全部选择"漏掉空值问题
- **问题**：筛选器点击"全部选择"时只选择了有值的选项，漏掉了空值（未设置）的项目
- **修复**：在以下组件的筛选选项中添加 `{ value: '', label: '未设置' }` 选项
  - `types.ts`：添加 `Priority.Routine = '日常需求'` 枚举值
  - `ProjectOverview.tsx`：statusOptions、priorityOptions、systemOptions
  - `KanbanFilterBar.tsx`：statusOptions、priorityOptions
  - `WeeklyMeetingFilterBar.tsx`：statusOptions、priorityOptions、systemOptions
  - `FilterBar.tsx`：statusOptions、priorityOptions、systemOptions

### 2. API 返回 null 导致的崩溃问题
- **问题**：后端空数据时返回 null，前端调用 `.length` 导致崩溃
- **修复**：
  - `api.ts`：`fetchProjects`、`fetchUsers`、`fetchOkrSets` 添加防御性处理，确保始终返回数组
  - `App.tsx`：setProjects、setOkrSets、setAllUsers 时添加空值检查

### 3. 本地开发环境配置问题
- **问题**：`.env.local` 文件编码损坏导致环境变量失效
- **修复**：重写 `.env.local` 文件，并在 `config/env.ts` 和 `api.ts` 中硬编码线上 API 地址

## 技术改进
- 增强前端对后端异常数据的容错能力
- 统一筛选组件的空值处理逻辑

## 版本信息
- 版本号：4.1.3
- 发布日期：2026-04-15
