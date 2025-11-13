#!/bin/bash

# CORS修复部署脚本
# 用于部署CORS跨域问题修复到生产服务器

echo "🚀 开始部署CORS修复到生产服务器..."

# 服务器信息
SERVER_IP="120.92.36.175"
SERVER_USER="root"
PROJECT_DIR="/root/project"
BACKEND_DIR="$PROJECT_DIR/backend"

echo "📡 连接到服务器 $SERVER_USER@$SERVER_IP..."

# SSH到服务器执行部署命令
ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
    echo "📂 进入项目目录..."
    cd /root/project
    
    echo "📥 拉取最新代码..."
    git pull origin main
    
    echo "🛑 停止现有后端服务..."
    # 查找并停止Go进程
    pkill -f "project-management-backend" || pkill -f "go run main.go" || echo "没有找到运行中的服务"
    
    # 等待进程完全停止
    sleep 2
    
    echo "📦 进入后端目录并安装依赖..."
    cd backend
    go mod tidy
    
    echo "🔧 编译后端服务..."
    go build -o project-management-backend main.go
    
    echo "🌱 启动后端服务（后台运行）..."
    # 使用nohup在后台运行
    nohup ./project-management-backend > /tmp/backend.log 2>&1 &
    
    # 等待服务启动
    sleep 3
    
    echo "🔍 检查服务状态..."
    if curl -s http://localhost:9000/health > /dev/null; then
        echo "✅ 后端服务启动成功！"
        echo "🌐 服务地址: http://120.92.36.175:9000"
    else
        echo "❌ 后端服务启动失败！"
        echo "📋 查看日志: tail -f /tmp/backend.log"
        exit 1
    fi
    
    echo "🎉 CORS修复部署完成！"
ENDSSH

echo ""
echo "✅ 部署脚本执行完成！"
echo ""
echo "📝 测试建议："
echo "1. 访问前端页面: http://120.92.36.175:5173"
echo "2. 检查浏览器控制台是否还有CORS错误"
echo "3. 测试OIDC登录功能"
echo ""
echo "📋 如果需要查看服务器日志："
echo "   ssh root@120.92.36.175 'tail -f /tmp/backend.log'"
