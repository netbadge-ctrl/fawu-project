#!/bin/bash

# 项目管理后端部署脚本

echo "🚀 开始部署项目管理后端服务..."

# 检查Go环境
if ! command -v go &> /dev/null; then
    echo "❌ Go 未安装，请先安装 Go 1.21+"
    exit 1
fi

# 进入后端目录
cd "$(dirname "$0")"

echo "📦 安装依赖..."
go mod tidy

echo "🔧 构建应用..."
go build -o project-management-backend main.go

echo "🗄️  初始化数据库..."
echo "正在连接数据库并创建表结构..."

# 设置环境变量（如果需要）
export DATABASE_URL="postgresql://admin:Kingsoft0531@120.92.122.77:59971/project_codebuddy?sslmode=disable"
export PORT="9000"

echo "🌱 启动服务..."
./project-management-backend &
SERVER_PID=$!

# 等待服务启动
sleep 5

echo "🔍 检查服务状态..."
if curl -s http://120.92.44.21:9000/health > /dev/null; then
    echo "✅ 服务启动成功！"
    echo "🌐 健康检查: http://120.92.44.21:9000/health"
    echo "📊 API文档: http://120.92.44.21:9000/api/"
    
    echo "📥 执行数据迁移..."
    if curl -X POST http://120.92.44.21:9000/api/migrate-initial-data > /dev/null 2>&1; then
        echo "✅ 初始数据迁移完成！"
    else
        echo "⚠️  数据迁移可能失败，请手动执行"
    fi
    
    echo ""
    echo "🎉 部署完成！"
    echo "服务运行在: http://120.92.44.21:9000"
    echo "进程ID: $SERVER_PID"
    echo ""
    echo "📋 可用的API端点:"
    echo "  GET  /health                     - 健康检查"
    echo "  GET  /api/users                  - 获取用户列表"
    echo "  GET  /api/projects               - 获取项目列表"
    echo "  POST /api/projects               - 创建新项目"
    echo "  GET  /api/okr-sets               - 获取OKR集合"
    echo "  POST /api/perform-weekly-rollover - 执行周会滚动"
    echo ""
    echo "🛑 停止服务: kill $SERVER_PID"
else
    echo "❌ 服务启动失败！"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi