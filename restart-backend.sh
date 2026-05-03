#!/bin/bash

# 停止现有的后端服务
echo "停止现有的后端服务..."
pkill -f project-management-backend
pkill -f backend-app

# 等待进程完全停止
sleep 2

# 进入后端目录
cd backend

# 本地联调连线上 PostgreSQL：
# - DATABASE_URL 指向线上库，项目/OKR/周报统一读写线上数据
# - DISABLE_SCHEDULER=true 禁用本地定时任务，避免和线上正式 backend 重复触发
export DATABASE_URL="postgresql://admin:Kingsoft0531@120.92.44.85:51022/project_codebuddy?sslmode=disable"
export DISABLE_SCHEDULER="true"
export PORT="9000"

echo "DATABASE_URL=$DATABASE_URL"
echo "DISABLE_SCHEDULER=$DISABLE_SCHEDULER"

# 重新构建
echo "重新构建后端服务..."
go build -o backend-app .

# 启动新的后端服务
echo "启动后端服务..."
nohup ./backend-app > backend.log 2>&1 &

# 显示进程状态
sleep 2
echo "后端服务状态:"
ps aux | grep -E "(backend-app|project-management-backend)" | grep -v grep

echo "后端服务已重启完成!"
echo "日志文件: backend/backend.log"
echo "⚠️  本地已直连线上数据库，所有写操作将直接影响线上数据。"