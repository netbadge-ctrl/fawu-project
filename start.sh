#!/bin/bash

# 部署脚本：更新 codebuddy 项目并重启服务

set -e  # 遇到错误时停止执行

echo "开始部署 codebuddy..."

# 删除旧的项目目录
echo "删除旧的项目目录..."
rm -rf /opt/codebuddy

# 克隆最新代码（从 GitHub 拉取）
echo "克隆最新代码..."
git clone https://github.com/netbadge-ctrl/project.git /opt/codebuddy

# 进入项目目录
cd /opt/codebuddy

# 停止现有服务
echo "停止现有服务..."
# 停止后端服务
if [ -f backend.pid ]; then
    kill $(cat backend.pid) 2>/dev/null || true
    rm -f backend.pid
fi

# 停止前端服务
if [ -f frontend.pid ]; then
    kill $(cat frontend.pid) 2>/dev/null || true
    rm -f frontend.pid
fi

# 杀死所有与项目相关的旧进程（作为额外保障）
pids=$(ps aux | grep -E '(project-management-backend|vite)' | grep -v grep | awk '{print $2}')
if [ ! -z "$pids" ]; then
    echo "强制杀死残留进程: $pids"
    kill $pids || kill -9 $pids
fi

# 等待进程完全结束
sleep 3

# 启动后端服务
echo "启动后端服务..."
cd backend
export DATABASE_URL="postgresql://admin:Kingsoft0531@120.92.44.85:51022/project_codebuddy?sslmode=disable"
export PORT="9000"
source /root/.bash_profile

# 编译后端服务（如果需要）
echo "编译后端服务..."
go mod tidy
go build -o project-management-backend main.go

# 检查编译是否成功
if [ ! -f "project-management-backend" ]; then
    echo "后端编译失败！"
    exit 1
fi

echo "后端编译成功，启动服务..."
# 启动后端服务并记录 PID
nohup ./project-management-backend > backend.log 2>&1 &
backend_pid=$!
echo $backend_pid > ../backend.pid
echo "后端服务启动，PID: $backend_pid"

# 等待后端启动
sleep 3
if kill -0 $backend_pid 2>/dev/null; then
    echo "后端服务运行正常"
else
    echo "后端服务启动失败，查看日志:"
    cat backend.log
    exit 1
fi

cd ..

# 启动前端服务
echo "启动前端服务..."
# 安装依赖（如果需要）
echo "检查并安装前端依赖..."
npm install

# 设置生产环境变量
export VITE_APP_ENV=production
export VITE_API_BASE_URL=http://120.92.36.175:9000/api
export VITE_FRONTEND_URL=http://120.92.36.175:5173
export VITE_ENABLE_OIDC=true
export VITE_MOCK_USER_ID=
source /root/.bash_profile

echo "当前项目版本: 2.9.2"
echo "Tailwind CSS: 本地版本 3.4.17"
echo "React: 19.1.1"
echo "Vite: 6.2.0"

# 构建生产版本
echo "构建生产版本..."
npm run build

if [ ! -d "dist" ]; then
    echo "前端构建失败！"
    exit 1
fi

echo "前端构建成功，启动预览服务..."
# 启动前端预览服务（生产环境推荐）
nohup npm run preview > frontend.log 2>&1 &
echo $! > frontend.pid

echo "部署完成！"
echo "后端服务 PID: $(cat backend.pid)"
echo "前端服务 PID: $(cat frontend.pid)"

# 显示服务状态
sleep 2
echo "检查服务状态..."
ps aux | grep -E "(project-management-backend|vite)" | grep -v grep