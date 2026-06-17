# v4.4.5 看板日期切换修复

## 发布日期
2026-06-17

## 更新内容

### 1. 看板日期切换修复
- `KanbanView.tsx` 中 `timeline` useMemo 在计算时间线起始日期时存在 bug
- 月视图：原代码使用 `const today = new Date()` 而非 `viewDate`，导致切换月份后时间线始终从当前月份开始
- 周视图：同样使用 `const today = new Date()` 而非 `viewDate`，导致切换周后时间线始终从当前周开始
- 修复后：月视图 `startDate = getStartOfMonth(viewDate)`，周视图 `startDate = getStartOfWeek(viewDate)`
- 现在「上一周/下一周」「上一月/下一月」按钮可正确偏移时间线

## 技术变更

### 前端
- `components/KanbanView.tsx`
  - 月视图起始日期计算：移除 `const today = new Date()`，改用 `viewDate`
  - 周视图起始日期计算：移除 `const today = new Date()`，改用 `viewDate`

## 验证清单
- [x] 前端 TypeScript 检查通过
- [x] 日期切换后时间线正确偏移
- [x] 月视图 3 个月跨度保持正确
- [x] 周视图 3 周跨度保持正确

## 部署说明
1. 提交代码到 GitHub main 分支
2. 登录线上服务器 120.92.36.175
3. 拉取最新代码并构建前端
4. 同步 dist 到两个入口目录
5. 验证前端正常访问
