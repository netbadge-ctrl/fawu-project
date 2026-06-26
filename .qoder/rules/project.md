---
trigger: always_on
---

# 项目配置规则

## 服务器登录配置

### 线上服务器
- **服务器地址**: 120.92.44.21
- **SSH连接**: 使用 `ssh -o BatchMode=yes -o ConnectTimeout=10` 确保命令可靠
- **文件传输**: 使用 `scp -r` 上传文件
- **系统日期基准**: 2026年5月3日

### 本地联调配置（直连线上PostgreSQL）
- **数据库地址**: `postgresql://admin:Kingsoft0531@120.92.122.77:59971/project_codebuddy?sslmode=disable`
- **白名单**: PG有IP白名单，本机公网IP需联系DBA加入白名单后才能连通
- **OIDC认证配置**:
  - **本地联调**: 禁用OIDC (`VITE_ENABLE_OIDC=false`)，使用模拟用户ID (`VITE_MOCK_USER_ID=52688`)
  - **线上生产**: 必须启用OIDC认证 (`VITE_ENABLE_OIDC=true`)
- **启动命令**:
  ```bash
  export DATABASE_URL="postgresql://admin:Kingsoft0531@120.92.122.77:59971/project_codebuddy?sslmode=disable"
  export DISABLE_SCHEDULER="true"   # 必须，避免和线上正式backend重复触发定时任务
  bash restart-backend.sh
  ```
- **验证连通**: `nc -zv -w 5 120.92.122.77 59971`
- **建表规范**: PostgreSQL不支持DATETIME，必须使用TIMESTAMP

## GitHub同步配置

### 仓库信息
- **仓库地址**: https://github.com/netbadge-ctrl/project.git
- **访问权限**: 仓库为private，需要SSH认证
- **SSH秘钥**: 使用 `~/.ssh/id_rsa_1` (SHA256:hj/VdZWs7YcKXCv38+53oj8DRcIUKE31w06xMWGTxbc)
- **主分支**: main

## 部署同步规范
- **代码源决策**: 所有部署脚本必须直接从GitHub拉取代码，弃用Gitee中转
- **克隆方式**: 使用SSH URL (`git@github.com:netbadge-ctrl/project.git`)，已配置SSH秘钥 `id_rsa_1`
- **适用范围**: 所有涉及自动化部署、代码克隆的shell脚本或CI/CD配置

## 线上前端部署纪律（强制）

### 双 dist 漂移陷阱（已发生事故，必须规避）
线上服务器 `120.92.44.21` 历史上**同时存在两套前端入口**，构建时间会漂移导致用户访问到旧版本：

| 入口 URL | 提供方 | dist 路径 | 工作目录 |
|---|---|---|---|
| `http://120.92.44.21` (:80) | Nginx (`/etc/nginx/conf.d/project-management.conf`) | `/opt/project-management/dist` | — |
| `http://120.92.44.21:5173` | `vite preview` 后台进程 | `/opt/codebuddy/dist` | `/opt/codebuddy` |

**用户实际访问入口**：`.env.production` 中 `VITE_FRONTEND_URL=http://120.92.44.21:5173`，即 **:5173 才是用户入口**，:80 仅作为备份/Nginx 通道。**两边 dist 必须保持一致**，否则会出现「OKR 不加粗、风险提示不显示」等"代码改了线上看不到"的现象。

### 部署 SOP（任何前端发版都必须遵守）
1. **构建产物只构建一次**，禁止在两个目录分别 `npm run build`，避免 hash 不一致与漂移。
2. **同步两份 dist**（必须同时覆盖，缺一不可）：
   ```bash
   # 把构建好的 dist 同步到两个入口目录（保留 timestamp 备份）
   TS=$(date +%Y%m%d_%H%M%S)
   ssh root@120.92.44.21 "mv /opt/codebuddy/dist /opt/codebuddy/dist.bak.$TS && cp -r /opt/project-management/dist /opt/codebuddy/dist"
   ```
3. **重启 :5173 vite preview 进程**（vite preview 是静态服务，文件名带 hash 时浏览器强刷即可生效，但保险做法是重启）：
   ```bash
   ssh root@120.92.44.21 "pkill -f 'vite preview --host 0.0.0.0 --port 5173' || true; \
     setsid bash -c 'cd /opt/codebuddy && nohup npm exec -- vite preview --host 0.0.0.0 --port 5173 >/tmp/vite-preview.log 2>&1 < /dev/null &'"
   ```
   **必须用 `setsid + nohup + </dev/null`**，否则 SSH 断连会把 vite 进程一起带走（已踩坑）。
4. **校验关键特征字（grep 法）**：minify 后变量名会丢失，但字符串字面量保留，必须验证下列关键字在线上 JS 中存在：
   ```bash
   JS=$(curl -s http://120.92.44.21:5173/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
   for kw in scheduleChanges delayRisks memberAlerts 本周排期空闲人员 font-bold; do
     echo "$kw -> $(curl -s http://120.92.44.21:5173/assets/$JS | grep -c "$kw")"
   done
   ```
   全部 `>=1` 才算部署成功；任意一项为 0 表示线上跑的是旧 dist。
5. **浏览器强制刷新**：通知使用方 `Ctrl/⌘+Shift+R` 清掉旧 `index.html` 缓存（index.html 不带 hash，会被浏览器缓存）。

### 排查口诀（线上与本地表现不一致时）
1. 看 `nginx -T` 与 `ps -ef | grep 'vite preview'` 找出真实 dist 路径。
2. 比较两个 dist 的 `index.html` 引用的 `index-*.js` hash 是否一致。
3. 用 `grep` 关键字符串字面量验证产物是否包含本次新增功能。
4. 不一致就按上述 SOP 重新同步 + 重启 + 校验。
