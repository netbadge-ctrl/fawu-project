#!/bin/bash

# 开发环境启动脚本

echo "🔧 启动开发环境..."
echo "📋 配置信息:"
echo "  - 环境: development"
echo "  - 版本: 2.8.0"
echo "  - OIDC认证: 禁用"
echo "  - API地址: http://localhost:9000/api"
echo "  - 模拟用户: 刘媛 (ID: 52688)"
echo "  - Tailwind CSS: 本地版本 3.4.17"
echo ""

# 检查依赖
echo "📦 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "安装依赖..."
    npm install
fi

# 设置开发环境变量
export VITE_APP_ENV=development
export VITE_API_BASE_URL=http://localhost:9000/api
export VITE_FRONTEND_URL=http://localhost:5173
export VITE_ENABLE_OIDC=false
export VITE_MOCK_USER_ID=52688

# 启动前端开发服务器
npm run dev