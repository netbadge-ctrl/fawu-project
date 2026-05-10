---
trigger: always_on
---

# 项目配置规则

## 服务器登录配置

### 线上服务器
- **服务器地址**: 120.92.36.175
- **SSH连接**: 使用 `ssh -o BatchMode=yes -o ConnectTimeout=10` 确保命令可靠
- **文件传输**: 使用 `scp -r` 上传文件
- **系统日期基准**: 2026年5月3日

### 本地联调配置（直连线上PostgreSQL）
- **数据库地址**: `postgresql://admin:Kingsoft0531@120.92.44.85:51022/project_codebuddy?sslmode=disable`
- **白名单**: PG有IP白名单，本机公网IP需联系DBA加入白名单后才能连通
- **OIDC认证配置**:
  - **本地联调**: 禁用OIDC (`VITE_ENABLE_OIDC=false`)，使用模拟用户ID (`VITE_MOCK_USER_ID=22231`)
  - **线上生产**: 必须启用OIDC认证 (`VITE_ENABLE_OIDC=true`)
- **启动命令**:
  ```bash
  export DATABASE_URL="postgresql://admin:Kingsoft0531@120.92.44.85:51022/project_codebuddy?sslmode=disable"
  export DISABLE_SCHEDULER="true"   # 必须，避免和线上正式backend重复触发定时任务
  bash restart-backend.sh
  ```
- **验证连通**: `nc -zv -w 5 120.92.44.85 51022`
- **建表规范**: PostgreSQL不支持DATETIME，必须使用TIMESTAMP

## GitHub同步配置

### 仓库信息
- **仓库地址**: https://github.com/netbadge-ctrl/project.git
- **访问权限**: 仓库为private，需要SSH认证
- **SSH秘钥**: 使用 `~/.ssh/id_rsa_1` (SHA256:hj/VdZWs7YcKXCv38+53oj8DRcIUKE31w06xMWGTxbc)
- **主分支**: main

### 部署同步规范
- **代码源决策**: 所有部署脚本必须直接从GitHub拉取代码，弃用Gitee中转
- **克隆方式**: 使用SSH URL (`git@github.com:netbadge-ctrl/project.git`)，已配置SSH秘钥 `id_rsa_1`
- **适用范围**: 所有涉及自动化部署、代码克隆的shell脚本或CI/CD配置
