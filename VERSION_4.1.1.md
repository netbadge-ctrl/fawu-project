# Version 4.1.1

## 发布日期
2026-03-20

## 更新内容

### Bug 修复
- **修复富文本编辑器内容丢失问题**:
  - 修复了"本周进展/问题"字段编辑时原有内容被清空的问题
  - 修改 `RichTextInput` 组件初始化逻辑，优先使用传入的 `html` 内容
  - 只有在内容为空时才生成默认标题模板
  - 初始化 `useEffect` 改为空依赖数组，只在组件挂载时执行一次

## 技术变更
- `RichTextInput.tsx` - 修复内容初始化逻辑
  - `generateDefaultTemplate`: 优先检查并返回传入的 `html` 内容
  - `useEffect`: 改为 `[]` 依赖，避免重复初始化

## 文件变更
- `package.json` - 更新版本号到 4.1.1
- `components/RichTextInput.tsx` - 修复内容丢失问题
