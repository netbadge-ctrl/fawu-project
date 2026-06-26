# 项目管理后端服务

基于 Go 语言构建的项目管理系统后端 API 服务。

## 功能特性

- **RESTful API**: 完整的项目管理 API 端点
- **PostgreSQL 数据库**: 使用 JSONB 存储复杂数据结构
- **定时任务**: 每日自动同步员工数据
- **数据迁移**: 一键导入初始数据
- **CORS 支持**: 支持跨域请求

## 技术栈

- **语言**: Go 1.21+
- **Web 框架**: Gin
- **数据库**: PostgreSQL
- **定时任务**: robfig/cron
- **数据库驱动**: lib/pq

## 快速开始

### 1. 安装依赖

```bash
go mod tidy
```

### 2. 配置环境变量（可选）

```bash
export DATABASE_URL="postgresql://admin:Kingsoft0531@120.92.122.77:59971/project_codebuddy"
export PORT="8080"
```

### 3. 启动服务

```bash
go run main.go
```

服务将在 `http://120.92.36.175:8080` 启动。

## API 端点

### 项目管理
- `GET /api/projects` - 获取所有项目
- `POST /api/projects` - 创建新项目
- `PATCH /api/projects/:projectId` - 更新项目
- `DELETE /api/projects/:projectId` - 删除项目

### OKR 管理
- `GET /api/okr-sets` - 获取所有 OKR 集合
- `POST /api/okr-sets` - 创建新 OKR 集合
- `PUT /api/okr-sets/:periodId` - 更新 OKR 集合

### 用户管理
- `GET /api/users` - 获取所有用户

### 工具
- `POST /api/perform-weekly-rollover` - 执行周会数据滚动
- `POST /api/migrate-initial-data` - 迁移初始数据（一次性）

### 健康检查
- `GET /health` - 服务健康状态

## 数据库结构

### users 表
```sql
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    avatar_url VARCHAR(255)
);
```

### okr_sets 表
```sql
CREATE TABLE okr_sets (
    period_id VARCHAR(255) PRIMARY KEY,
    period_name VARCHAR(255) NOT NULL,
    okrs JSONB NOT NULL
);
```

### projects 表
```sql
CREATE TABLE projects (
    id VARCHAR(255) PRIMARY KEY,
    name TEXT NOT NULL,
    priority VARCHAR(50) NOT NULL,
    business_problem TEXT,
    key_result_ids TEXT[],
    weekly_update TEXT,
    last_week_update TEXT,
    status VARCHAR(50) NOT NULL,
    product_managers JSONB,
    backend_developers JSONB,
    frontend_developers JSONB,
    qa_testers JSONB,
    proposal_date DATE,
    launch_date DATE,
    followers TEXT[],
    comments JSONB,
    change_log JSONB
);
```

## 定时任务

系统会在每天上午 11:00 自动执行员工数据同步任务，从内部接口获取最新的员工信息并更新到数据库。

## 初始化数据

首次部署后，可以调用以下 API 导入初始数据：

```bash
curl -X POST http://120.92.36.175:8080/api/migrate-initial-data
```

这将导入用户、OKR 和项目的初始数据。

## 开发说明

### 项目结构
```
backend/
├── main.go                    # 程序入口
├── internal/
│   ├── api/                   # API 路由和处理器
│   │   ├── routes.go         # 路由定义
│   │   ├── handlers.go       # API 处理器
│   │   └── migration.go      # 数据迁移
│   ├── config/               # 配置管理
│   │   └── config.go
│   ├── database/             # 数据库连接和初始化
│   │   └── database.go
│   ├── models/               # 数据模型
│   │   └── models.go
│   └── scheduler/            # 定时任务
│       └── scheduler.go
├── go.mod                    # Go 模块定义
└── README.md                 # 项目说明
```

### 添加新的 API 端点

1. 在 `internal/api/handlers.go` 中添加处理函数
2. 在 `internal/api/routes.go` 中注册路由
3. 如需要，在 `internal/models/models.go` 中添加数据模型

## 部署

### 使用 Docker（推荐）

```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o main .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/main .
CMD ["./main"]
```

### 直接部署

```bash
# 构建
go build -o project-management-backend

# 运行
./project-management-backend
```

## 注意事项

1. 确保 PostgreSQL 数据库可访问
2. 员工数据同步需要内网环境
3. 首次启动后记得执行数据迁移
4. 生产环境建议配置适当的日志级别和监控