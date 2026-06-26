#!/bin/bash

# 生产环境启动脚本

echo "🚀 启动生产环境..."
echo "📋 配置信息:"
echo "  - 环境: production"
echo "  - 版本: 2.8.5"
echo "  - OIDC认证: 启用"
echo "  - API地址: http://120.92.44.21:9000/api"
echo "  - 认证方式: OIDC单点登录"
echo "  - Tailwind CSS: 本地版本 3.4.17"
echo ""

# 检查依赖
echo "📦 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "安装依赖..."
    npm install
fi

# 设置生产环境变量
export VITE_APP_ENV=production
export VITE_API_BASE_URL=http://120.92.44.21:9000/api
export VITE_FRONTEND_URL=http://120.92.44.21:5173
export VITE_ENABLE_OIDC=true
export VITE_MOCK_USER_ID=

# 构建并启动生产版本
echo "🔨 构建项目..."
npm run build

echo "🌐 启动预览服务器..."
npm run preview