# Version 4.1.2

## 发布日期
2026-04-02

## 更新内容

### Bug 修复
- **修复周会视图弹窗滚动问题**:
  - 移除了弹窗的 `pointer-events-none` 类，恢复鼠标事件支持
  - 修改滚动事件处理逻辑，弹窗内部滚动时不再自动关闭
  - 给弹窗添加 `update-tooltip-popup` 类名用于识别内部滚动

- **修复富文本编辑器内容丢失问题**:
  - 使用 `key={project.id}` 强制组件重新挂载
  - 简化 `useEffect` 初始化逻辑，只在挂载时设置内容

## 技术变更
- `WeeklyMeetingProjectCard.tsx` - 修复弹窗滚动和关闭逻辑
- `RichTextInput.tsx` - 修复内容初始化和光标跳动问题
- `ProjectDetailModal.tsx` - 添加 `key` 属性强制重新挂载

## 文件变更
- `package.json` - 更新版本号到 4.1.2
- `components/WeeklyMeetingProjectCard.tsx` - 修复弹窗滚动
- `components/RichTextInput.tsx` - 修复编辑器问题
- `components/ProjectDetailModal.tsx` - 添加 key 属性
