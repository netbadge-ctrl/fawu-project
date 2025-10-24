# Version 3.0.0 - 参与人筛选部门分组功能

**发布日期**: 2025年10月24日

## 📋 概述

本版本对所有页面的参与人筛选功能进行了重大升级，将原来的平铺列表改为按部门分组的二级联级菜单，极大提升了查找效率和用户体验。

## ✨ 主要功能

### 参与人筛选部门分组
- **一级菜单**：按部门名称分组显示
- **二级菜单**：展示该部门下的所有员工
- **智能排序**：部门和员工均按中文拼音排序
- **全面应用**：覆盖所有页面的参与人/成员筛选

### 影响页面
1. ✅ **周会视图** - 参与人筛选
2. ✅ **项目总览** - 参与人筛选
3. ✅ **看板视图** - 按成员筛选
4. ✅ **项目列表** - 产品经理/后端研发/前端研发/测试筛选

## 🎯 用户体验优化

### 筛选效率提升
- **快速定位**：先选择部门，再选择员工，两级导航更直观
- **分组清晰**：同部门员工集中显示，避免在长列表中查找
- **自动排序**：部门和人员都按拼音排序，符合中文使用习惯

### 部门信息展示
- 产品管理部
- 业务平台研发部
- 基础平台研发部
- 前端技术部
- 测试部
- SRE平台组
- 技术部
- 未分配部门（无部门信息的员工）

## 🔧 技术实现

### 数据结构
使用 `MultiSelectDropdown` 组件已有的 `groupedOptions` 属性：

```typescript
const participantGroupedOptions = useMemo(() => {
  const departmentMap = new Map<string, User[]>();
  
  // 按部门分组
  allUsers.forEach(user => {
    const deptName = user.deptName || '未分配部门';
    if (!departmentMap.has(deptName)) {
      departmentMap.set(deptName, []);
    }
    departmentMap.get(deptName)!.push(user);
  });
  
  // 转换为 groupedOptions 格式并排序
  return Array.from(departmentMap.entries())
    .map(([deptName, users]) => ({
      label: deptName,
      options: users
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
        .map(u => ({ value: u.id, label: u.name }))
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}, [allUsers]);
```

### 组件使用
```tsx
<MultiSelectDropdown
  groupedOptions={participantGroupedOptions}
  selectedValues={selectedParticipantIds}
  onSelectionChange={setSelectedParticipantIds}
  placeholder="参与人"
/>
```

## 📦 文件变更

### 更新的文件
1. **components/WeeklyMeetingFilterBar.tsx**
   - 将 `participantOptions` 改为 `participantGroupedOptions`
   - 使用 `groupedOptions` 属性替代 `options`

2. **components/ProjectOverview.tsx**
   - 将 `participantOptions` 改为 `participantGroupedOptions`
   - 添加 useMemo 优化性能

3. **components/KanbanFilterBar.tsx**
   - 将 `userOptions` 改为 `userGroupedOptions`
   - 按成员筛选使用部门分组

4. **components/FilterBar.tsx**
   - 将 `userOptions` 改为 `userGroupedOptions`
   - 所有角色筛选（PM/BE/FE/QA）都使用部门分组

5. **version.json**
   - 版本号升级至 3.0.0
   - 更新功能列表和变更记录

## 🎨 界面效果

### 分组显示示例
```
参与人 ▼
├─ 产品管理部
│  ├─ □ 张三
│  ├─ □ 李四
│  └─ □ 王五
├─ 业务平台研发部
│  ├─ □ 陈楠
│  ├─ □ 周广瑞
│  └─ □ 王彧
├─ 前端技术部
│  ├─ □ 陈雨
│  └─ □ 文强
└─ 测试部
   ├─ □ 钟望
   └─ □ 靳庆康
```

## 💡 使用指南

### 筛选参与人的步骤
1. 点击"参与人"或"按成员筛选"按钮
2. 查看按部门分组的员工列表
3. 展开目标部门，选择需要的员工
4. 可选择多个部门的多个员工
5. 点击"全部选择"会选中所有筛选结果中的员工
6. 点击"取消选择"可一键清空所有选择

### 搜索功能
- 支持在分组列表中搜索员工姓名
- 支持通过邮箱前缀搜索
- 搜索结果会保持部门分组结构

## 🔄 兼容性

- **向后兼容**: v2.9.9
- **浏览器支持**: Chrome 60+, Firefox 55+, Safari 12+, Edge 79+
- **移动端**: 完全支持

## 📊 性能优化

- 使用 `useMemo` 缓存分组数据，避免重复计算
- 保持原有的搜索性能优化
- 不影响其他筛选功能的性能

## 🐛 已知问题

- FilterBar.tsx 中存在原有的 `ProjectStatus.Launched` 错误（与本次修改无关）
- ProjectOverview.tsx 中存在类型定义问题（与本次修改无关）

这些问题不影响部门分组功能的正常使用。

## 📝 升级说明

本次升级是功能性升级，不涉及数据库结构变更：
1. 前端代码自动部署后即可使用
2. 后端服务已包含部门信息，无需额外配置
3. 用户数据中的 `deptId` 和 `deptName` 字段已就绪

## 🎯 下一步计划

- 优化部门信息的管理界面
- 支持部门层级结构（如有需要）
- 添加部门筛选的统计功能
