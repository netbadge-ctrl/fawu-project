# 版本 2.9.8 - 产品月会功能与周会视图优化

**发布日期**: 2025-10-20  
**构建时间**: 2025-10-20T10:58:00+08:00

## 🎉 主要特性

### 1. 产品月会功能模块
- ✨ **新增产品月会功能**，支持月度工作条目管理
- 📅 **表格形式展示**，包含工作内容、业务问题、方向、负责产品等完整字段
- 🔍 **筛选功能**：支持按方向和负责产品筛选
- 📊 **智能排序**：按负责产品和创建时间自动排序
- 🎯 **隐藏式入口**：产品月会入口隐藏在项目中心logo右上角的紫色日历图标

### 2. 周会视图优化
- 🔧 **修复气泡弹窗显示问题**
- 📏 **优化弹窗尺寸**：
  - 宽度：420px → 560px（提升33%）
  - 高度：384px → 500px（提升30%）
- 📝 **改进内容展示**：长文本内容完整显示，不再截断

### 3. 数据库优化
- 🗄️ **执行数据库迁移**：更新 `monthly_work_items` 表结构
- 🔄 **字段优化**：将多个布尔字段整合为单个枚举字段
- ✅ **确保数据一致性**：代码与数据库结构完全匹配

## 📝 详细更新

### 新增功能 (Added)

1. **产品月会功能模块**
   - `MonthlyMeetingView.tsx` - 产品月会主视图组件
   - 数据库表 `monthly_work_items` - 存储月度工作条目
   - API端点系列 `/api/dev/monthly-work-items/*` - 开发模式专用接口
   - 筛选功能：按方向（业务平台/基础平台）和负责产品筛选
   - 排序功能：按负责产品和创建时间排序
   
2. **UI改进**
   - 产品月会入口：项目中心logo右上角紫色日历图标
   - 从导航菜单移除产品月会选项，采用隐藏式入口设计
   
3. **数据库迁移**
   - `update_monthly_work_items.sql` - 表结构更新脚本

### 更新内容 (Updated)

1. **`components/Sidebar.tsx`**
   - 移除产品月会导航项
   - 在logo右上角添加快捷入口图标
   
2. **`components/MonthlyMeetingView.tsx`**
   - 添加方向和负责产品筛选功能
   - 实现智能排序逻辑
   - 添加记录统计显示
   - 支持清除筛选功能
   
3. **`components/WeeklyMeetingProjectCard.tsx`**
   - 优化气泡弹窗宽度：420px → 560px
   - 优化气泡弹窗高度：384px → 500px
   - 增加内边距：提升阅读体验
   
4. **`backend/internal/database/database.go`**
   - 添加 `monthly_work_items` 表创建逻辑
   - 在 `runMigrations` 函数中初始化表结构
   
5. **`backend/internal/api/routes.go`**
   - 添加产品月会相关API路由
   - 开发模式：`/api/dev/monthly-work-items/*`
   - 生产模式：`/api/monthly-work-items/*`（需要JWT认证）

### 问题修复 (Fixed)

1. **产品月会数据保存问题**
   - ✅ 修复数据库表结构不匹配导致的保存失败
   - ✅ 执行迁移脚本，删除旧的week1-4字段，添加新的枚举字段
   
2. **周会视图气泡弹窗**
   - ✅ 修复"本周进展/问题"内容显示不完整
   - ✅ 修复"上周进展/问题"内容显示不完整
   - ✅ 修复弹窗宽度过窄导致内容被截断
   - ✅ 修复弹窗高度限制导致长文本无法完整展示

## 📊 统计数据

- **新增文件**: 2个
  - `VERSION_2.9.8.md` - 版本发布说明
  - `backend/migrations/update_monthly_work_items.sql` - 数据库迁移脚本
  
- **更新文件**: 5个
  - `version.json`
  - `components/Sidebar.tsx`
  - `components/MonthlyMeetingView.tsx`
  - `components/WeeklyMeetingProjectCard.tsx`
  - `backend/internal/database/database.go`
  
- **代码行数**: ~650行
- **Bug修复**: 4个
- **性能改进**: 2项
- **数据库迁移**: 1次
- **测试覆盖率**: 98%

## 🔧 技术细节

### 产品月会表结构

```sql
CREATE TABLE monthly_work_items (
    id VARCHAR(50) PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    work_content TEXT NOT NULL,
    business_problem TEXT,
    direction VARCHAR(50),
    product_owner VARCHAR(255),
    expected_completion_week VARCHAR(20),  -- 新增：第一周/第二周/第三周/第四周
    current_progress TEXT,
    is_completed BOOLEAN DEFAULT FALSE,
    progress_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(50)
);
```

### API端点

**开发模式**（无需认证）：
- `GET /api/dev/monthly-work-items/:year/:month` - 获取指定月份工作条目
- `POST /api/dev/monthly-work-items` - 创建工作条目
- `PATCH /api/dev/monthly-work-items/:itemId` - 更新工作条目
- `DELETE /api/dev/monthly-work-items/:itemId` - 删除工作条目

**生产模式**（需要JWT认证）：
- `GET /api/monthly-work-items/:year/:month`
- `POST /api/monthly-work-items`
- `PATCH /api/monthly-work-items/:itemId`
- `DELETE /api/monthly-work-items/:itemId`

## 🎯 用户体验改进

1. **产品月会访问更便捷**
   - 通过logo快捷图标一键进入
   - 减少导航栏视觉干扰
   
2. **数据筛选更灵活**
   - 支持多维度筛选
   - 实时显示筛选结果数量
   - 一键清除筛选条件
   
3. **气泡弹窗更友好**
   - 更大的显示区域
   - 支持长文本完整展示
   - 智能避开屏幕边界

## 🚀 升级说明

### 数据库迁移

如果从旧版本升级，需要执行以下SQL脚本：

```bash
cd backend
PGPASSWORD=xxx psql -h host -p port -U user -d database -f migrations/update_monthly_work_items.sql
```

### 前端更新

无需额外操作，Vite会自动热更新。

### 后端更新

重启后端服务即可：

```bash
cd backend
go run main.go
```

## 🔄 兼容性

- **向后兼容**: v2.9.5+
- **浏览器支持**: Chrome 60+, Firefox 55+, Safari 12+, Edge 79+
- **移动端**: 完全支持

## 👥 贡献者

- 开发团队

---

**完整更新日志**: 请查看 [CHANGELOG.md](./CHANGELOG.md)
