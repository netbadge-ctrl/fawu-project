# 项目管理工具 - 数据库格式说明

## 概述
本文档详细说明了项目管理工具的数据库结构，包括所有表的字段定义、数据类型、约束条件和关系。

## 数据库技术栈
- **数据库**: PostgreSQL
- **ORM**: 原生SQL + Go database/sql
- **JSON处理**: JSONB字段存储复杂数据结构

---

## 1. 用户表 (users)

### 表结构
```sql
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    avatar_url VARCHAR(255)
);
```

### 字段说明
| 字段名 | 数据类型 | 约束 | 说明 |
|--------|----------|------|------|
| id | VARCHAR(255) | PRIMARY KEY | 用户唯一标识符 |
| name | VARCHAR(255) | NOT NULL | 用户姓名 |
| email | VARCHAR(255) | - | 用户邮箱地址 |
| avatar_url | VARCHAR(255) | - | 用户头像URL |

### JSON结构示例
```json
{
  "id": "user_001",
  "name": "张三",
  "email": "zhangsan@company.com",
  "avatarUrl": "https://example.com/avatar/zhangsan.jpg"
}
```

---

## 2. OKR集合表 (okr_sets)

### 表结构
```sql
CREATE TABLE IF NOT EXISTS okr_sets (
    period_id VARCHAR(255) PRIMARY KEY,
    period_name VARCHAR(255) NOT NULL,
    okrs JSONB NOT NULL
);
```

### 字段说明
| 字段名 | 数据类型 | 约束 | 说明 |
|--------|----------|------|------|
| period_id | VARCHAR(255) | PRIMARY KEY | OKR周期ID (如: "2025-H2") |
| period_name | VARCHAR(255) | NOT NULL | OKR周期名称 (如: "2025下半年") |
| okrs | JSONB | NOT NULL | OKR列表，存储为JSON格式 |

### JSONB结构 - okrs字段
```json
[
  {
    "id": "okr_001",
    "objective": "提升用户体验",
    "keyResults": [
      {
        "id": "kr_001",
        "description": "用户满意度提升至90%"
      },
      {
        "id": "kr_002", 
        "description": "页面加载时间减少50%"
      }
    ]
  }
]
```

---

## 3. 项目表 (projects) - 核心表

### 表结构
```sql
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(255) PRIMARY KEY,
    name TEXT NOT NULL,
    business_direction VARCHAR(255),
    priority VARCHAR(50) NOT NULL,
    business_background TEXT,
    key_result_ids TEXT[],
    weekly_update TEXT,
    last_week_update TEXT,
    status VARCHAR(50) NOT NULL,
    owner JSONB,
    proposal_date DATE NULL,
    completion_date DATE NULL,
    followers TEXT[],
    comments JSONB,
    change_log JSONB
);
```

### 字段详细说明

#### 基础信息字段
| 字段名 | 数据类型 | 约束 | 说明 |
|--------|----------|------|------|
| id | VARCHAR(255) | PRIMARY KEY | 项目唯一标识符 |
| name | TEXT | NOT NULL | 项目名称 |
| business_direction | VARCHAR(255) | - | 业务方向 |
| priority | VARCHAR(50) | NOT NULL | 项目优先级 |
| business_background | TEXT | - | 业务背景 |
| status | VARCHAR(50) | NOT NULL | 项目状态 |

#### 优先级枚举值
```typescript
enum Priority {
    DeptOKR = '部门OKR相关',
    PersonalOKR = '个人OKR相关', 
    Urgent = '临时重要需求',
    Routine = '日常需求'
}
```

#### 项目状态枚举值
```typescript
enum ProjectStatus {
    NotStarted = '未开始',
    Discussion = '讨论中',
    RequirementsDone = '需求完成',
    ReviewDone = '评审完成',
    InProgress = '进行中',
    DevDone = '开发完成',
    Testing = '测试中',
    TestDone = '测试完成',
    Paused = '暂停',
    Launched = '已上线'
}
```

#### 关联和更新字段
| 字段名 | 数据类型 | 约束 | 说明 |
|--------|----------|------|------|
| key_result_ids | TEXT[] | - | 关联的OKR关键结果ID数组 |
| weekly_update | TEXT | - | 本周进展/问题 |
| last_week_update | TEXT | - | 上周进展/问题 |
| proposal_date | DATE | NULL | 项目提出日期 |
| completion_date | DATE | NULL | 项目完成日期 |
| followers | TEXT[] | - | 关注者用户ID数组 |

#### 团队角色字段 (JSONB格式)
| 字段名 | 数据类型 | 说明 |
|--------|----------|------|
| owner | JSONB | 项目负责人团队 |

##### 团队成员JSONB结构
```json
[
  {
    "userId": "user_001",
    "startDate": "2025-01-01",
    "endDate": "2025-06-30",
    "useSharedSchedule": false
  },
  {
    "userId": "user_002", 
    "startDate": "2025-02-01",
    "endDate": "2025-05-31",
    "useSharedSchedule": true
  }
]
```

#### 评论系统字段
| 字段名 | 数据类型 | 说明 |
|--------|----------|------|
| comments | JSONB | 项目评论列表 |

##### 评论JSONB结构
```json
[
  {
    "id": "comment_001",
    "userId": "user_001",
    "text": "项目进展顺利，预计按时完成",
    "createdAt": "2025-08-23T10:30:00Z",
    "mentions": ["user_002", "user_003"],
    "readBy": ["user_001", "user_002"]
  }
]
```

#### 变更日志字段
| 字段名 | 数据类型 | 说明 |
|--------|----------|------|
| change_log | JSONB | 项目变更历史记录 |

##### 变更日志JSONB结构
```json
[
  {
    "id": "cl_001",
    "userId": "user_001",
    "field": "项目状态",
    "oldValue": "进行中",
    "newValue": "测试中",
    "changedAt": "2025-08-23T14:20:00Z"
  },
  {
    "id": "cl_002",
    "userId": "user_002", 
    "field": "产品经理",
    "oldValue": "张三",
    "newValue": "张三, 李四",
    "changedAt": "2025-08-23T15:10:00Z"
  }
]
```

---

## 4. 数据关系说明

### 主要关联关系
1. **项目 ↔ 用户**: 通过各角色字段、followers、评论等建立多对多关系
2. **项目 ↔ OKR**: 通过key_result_ids字段关联OKR的关键结果
3. **用户 ↔ 评论**: 通过comments中的userId建立关系
4. **用户 ↔ 变更日志**: 通过change_log中的userId记录操作者

### 数据完整性约束
- 所有用户ID引用必须在users表中存在
- 项目状态必须为预定义枚举值之一
- 优先级必须为预定义枚举值之一
- 日期字段使用ISO 8601格式

---

## 5. 索引建议

### 推荐索引
```sql
-- 项目状态索引（用于状态筛选）
CREATE INDEX idx_projects_status ON projects(status);

-- 项目优先级索引（用于优先级筛选）
CREATE INDEX idx_projects_priority ON projects(priority);

-- 项目完成日期索引（用于时间范围查询）
CREATE INDEX idx_projects_completion_date ON projects(completion_date);

-- 用户邮箱索引（用于用户查找）
CREATE INDEX idx_users_email ON users(email);

-- OKR周期索引（用于周期查询）
CREATE INDEX idx_okr_sets_period ON okr_sets(period_id);
```

---

## 6. 数据备份和迁移

### 备份策略
- 定期全量备份projects表（包含所有JSONB数据）
- 增量备份变更日志
- 用户数据实时同步

### 数据迁移注意事项
- JSONB字段需要特殊处理
- 数组字段使用PostgreSQL特定语法
- 日期字段需要格式转换

---

## 7. 性能优化建议

### 查询优化
1. 对JSONB字段使用GIN索引提升查询性能
2. 合理使用部分索引减少存储开销
3. 避免在JSONB字段上进行复杂的嵌套查询

### 存储优化
1. 定期清理过期的变更日志
2. 压缩历史评论数据
3. 优化JSONB字段的存储结构

---

## 8. API接口数据格式

### 项目列表接口响应格式
```json
{
  "projects": [
    {
      "id": "project_001",
      "name": "用户体验优化项目",
      "priority": "部门OKR相关",
      "status": "进行中",
      "businessProblem": "当前用户界面响应速度慢，影响用户体验",
      "keyResultIds": ["kr_001", "kr_002"],
      "weeklyUpdate": "完成了首页性能优化，提升了30%的加载速度",
      "lastWeekUpdate": "完成了需求分析和技术方案设计",
      "productManagers": [
        {
          "userId": "user_001",
          "startDate": "2025-01-01",
          "endDate": "2025-06-30"
        }
      ],
      "backendDevelopers": [
        {
          "userId": "user_002", 
          "startDate": "2025-01-15",
          "endDate": "2025-05-31"
        }
      ],
      "frontendDevelopers": [
        {
          "userId": "user_003",
          "startDate": "2025-01-15", 
          "endDate": "2025-05-31"
        }
      ],
      "qaTesters": [
        {
          "userId": "user_004",
          "startDate": "2025-03-01",
          "endDate": "2025-06-15"
        }
      ],
      "proposalDate": "2025-01-01",
      "launchDate": "2025-06-30",
      "followers": ["user_005", "user_006"],
      "comments": [
        {
          "id": "comment_001",
          "userId": "user_001",
          "text": "项目进展顺利，预计按时完成",
          "createdAt": "2025-08-23T10:30:00Z",
          "mentions": [],
          "readBy": ["user_001"]
        }
      ],
      "changeLog": [
        {
          "id": "cl_001",
          "userId": "user_001",
          "field": "项目状态",
          "oldValue": "需求完成",
          "newValue": "进行中", 
          "changedAt": "2025-08-23T09:00:00Z"
        }
      ]
    }
  ]
}
```

---

## 总结

本数据库设计采用了PostgreSQL的高级特性，通过JSONB字段存储复杂的嵌套数据结构，既保证了数据的完整性，又提供了良好的查询性能。设计充分考虑了项目管理的实际需求，支持完整的项目生命周期管理、团队协作、OKR关联等功能。