#!/bin/bash

# v4.0.6 部署脚本
# 执行前请确保已在本地构建完成

echo "🚀 开始部署 v4.0.6 到线上服务器..."
echo "================================================"

# 服务器配置
SERVER_IP="120.92.36.175"
SERVER_USER="root"
SERVER_PATH="/opt"
BACKUP_DIR="/opt/backup"

# 1. 备份现有版本
echo "📦 备份现有版本..."
ssh ${SERVER_USER}@${SERVER_IP} "mkdir -p ${BACKUP_DIR} && cd ${SERVER_PATH} && tar -czf ${BACKUP_DIR}/project-v4.0.5-backup-$(date +%Y%m%d-%H%M%S).tar.gz --exclude='backup' --exclude='*.tar.gz' ."
echo "✅ 备份完成"

# 2. 构建前端（本地）
echo "🔨 构建前端生产版本..."
node switch-env.cjs production
npm run build

# 3. 上传文件到服务器
echo "📤 上传文件到服务器..."
scp -r dist/* ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/dist/
scp -r components backend api.ts types.ts constants.ts utils.ts index.html package.json styles.css tailwind.config.js postcss.config.js vite.config.ts tsconfig.json version.json ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/
echo "✅ 文件上传完成"

# 4. 部署后端
echo "🔄 部署后端服务..."
ssh ${SERVER_USER}@${SERVER_IP} "cd ${SERVER_PATH}/backend && pkill -f project-management-backend 2>/dev/null; sleep 2; go build -o project-management-backend main.go && nohup ./project-management-backend > backend.log 2>&1 &"
echo "✅ 后端部署完成"

# 5. 检查服务状态
echo "🔍 检查服务状态..."
sleep 3
if ssh ${SERVER_USER}@${SERVER_IP} "curl -s http://localhost:9000/health > /dev/null"; then
    echo "✅ 后端服务运行正常"
else
    echo "⚠️ 后端服务可能未启动，请手动检查"
fi

echo ""
echo "================================================"
echo "🎉 v4.0.6 部署完成！"
echo ""
echo "📋 访问地址:"
echo "  前端: http://${SERVER_IP}:5173"
echo "  后端: http://${SERVER_IP}:9000"
echo ""
echo "📦 备份位置: ${BACKUP_DIR}/"
echo "🔄 回滚命令: ssh ${SERVER_USER}@${SERVER_IP} 'cd ${SERVER_PATH} && tar -xzf ${BACKUP_DIR}/project-v4.0.5-backup-xxx.tar.gz'"
echo "================================================"
