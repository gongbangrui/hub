# 部署（宝塔面板）

单进程 Node 服务 + SQLite，Nginx 反代。推荐**直接在服务器上构建**。

## 速查

| 目标 | 做什么 | 跳到 |
| --- | --- | --- |
| 第一次部署 | 建目录 → 装 Node 22/PM2 → `npm ci && npm run build` → 组装 standalone → 写 `.env` → `pm2 start` → Nginx 反代 | 2 – 9 |
| 重新部署（服务器上已是旧版） | 备份 → 更新源码 → `bash scripts/deploy.sh` → 验证 | 11.1 – 11.3 |
| 只改 `.env` | 改完 `pm2 reload personal-hub --update-env` | 4 / 5 |
| 回滚到上一版 | `mv` 换回 `hub.prev` → `pm2 reload` | 11.4 |
| 彻底删除 | 停 PM2 → 删站点 → 删目录 → 按需删数据 | 13 |

---

## 0. 全流程一览（首次部署）

```bash
# 1) 装环境：宝塔装 Node 22 + PM2（第 1 节）
node -v && npm -v && pm2 -v

# 2) 取源码
mkdir -p /www/wwwroot/hub-src && cd /www/wwwroot/hub-src
git clone <你的仓库> .        # 或上传源码包后 tar -xzf hub-src.tar.gz

# 3) 装依赖并构建
npm ci --include=dev
npm run build

# 4) 组装 standalone 运行目录
mkdir -p /www/wwwroot/hub
cp -a .next/standalone/. /www/wwwroot/hub/
cp -a .next/static       /www/wwwroot/hub/.next/static
[ -d public ] && cp -a public /www/wwwroot/hub/public
cp ecosystem.config.js   /www/wwwroot/hub/

# 5) 写环境变量（第 4 节，务必设 AUTH_SECRET）
mkdir -p /www/wwwroot/hub-data
cat > /www/wwwroot/hub/.env <<EOF
AUTH_SECRET=$(openssl rand -hex 32)
ADMIN_PASSWORD=换成你的口令
CRON_KEY=$(openssl rand -hex 16)
DATA_DIR=/www/wwwroot/hub-data
EOF
chmod 600 /www/wwwroot/hub/.env

# 6) 启动
cd /www/wwwroot/hub
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup

# 7) 配置 Nginx 反代（第 7 节）后验证
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/   # 200
```

之后每次更新只需第 11 节的一条命令。

---

## 1. 环境

| 项 | 要求 |
| --- | --- |
| Node | **≥ 22**（better-sqlite3 13 要求；Next.js 15 本身 ≥ 18.18）。宝塔「软件商店 → Node.js 版本管理器」安装 22 LTS 并设为命令行版本 |
| PM2 | 宝塔「PM2 管理器」，或 `npm i -g pm2` |
| 编译工具 | 仅当 better-sqlite3 没有匹配的预编译包时需要：`yum install -y gcc-c++ make python3` / `apt install -y build-essential python3` |
| Nginx | 宝塔自带即可 |

```bash
node -v && npm -v && pm2 -v
```

---

## 2. 目录

```
/www/wwwroot/hub-src/      源码，在此构建（git clone 或上传解压）
/www/wwwroot/hub/          运行目录 = standalone 产物
├── server.js
├── package.json
├── node_modules/          精简后的运行依赖，含 better-sqlite3 二进制
├── .next/                 server/ + static/
├── public/                没有 public 目录则无
├── ecosystem.config.js
└── .env
/www/wwwroot/hub-data/     DATA_DIR：数据库 + 上传文件（持久，构建产物之外）
├── app.db  app.db-wal  app.db-shm
├── uploads/
└── chunks/                分片上传临时区
```

> `server.js` 启动时会 `chdir` 到自身目录。`DATA_DIR` 不设时默认 `/www/wwwroot/hub/data`，更新时容易被覆盖 —— 生产环境务必设为独立的绝对路径。

---

## 3. 构建

`next.config.ts` 已设 `output: 'standalone'`：构建后 `.next/standalone/` 是可独立运行的最小服务，但**不含** `.next/static` 和 `public`，需手动拷入。

```bash
cd /www/wwwroot/hub-src
npm ci
npm run build

mkdir -p /www/wwwroot/hub
cp -a .next/standalone/. /www/wwwroot/hub/
cp -a .next/static       /www/wwwroot/hub/.next/static
[ -d public ] && cp -a public /www/wwwroot/hub/public
cp ecosystem.config.js   /www/wwwroot/hub/
```

之后的更新用 `scripts/deploy.sh` 一条命令完成（见第 11 节）。

### 本地构建再上传（可选）

仅当本地与服务器**同为 Linux x64 / 同 libc / 同 Node 主版本**时可行（原因见第 6 节）：

```bash
npm ci && npm run build
cd .next/standalone
cp -a ../static .next/static
[ -d ../../public ] && cp -a ../../public public
cp ../../ecosystem.config.js .
tar -czf ../../hub.tar.gz .
# 上传 hub.tar.gz 到服务器后
mkdir -p /www/wwwroot/hub && tar -xzf hub.tar.gz -C /www/wwwroot/hub
```

---

## 4. 环境变量

> **注意**：`output: 'standalone'` 生成的 `server.js` **不会自己读 `.env`**（实测只认 `process.env`，写了 `.env` 也不生效）。所以仓库里的 `ecosystem.config.js` 会解析 `server.js` 同目录下的 `.env` 并注入进程环境 —— 启动必须用 `pm2 start/reload ecosystem.config.js`，不要直接 `pm2 start server.js`。
>
> 替代方案：`pm2 start server.js --node-args="--env-file=/www/wwwroot/hub/.env"`（Node ≥ 20.6）。两种任选其一，别同时用。

在 `/www/wwwroot/hub/.env` 写入。模板见 `.env.example`。

| 变量 | 说明 |
| --- | --- |
| `AUTH_SECRET` | 会话签名密钥，`openssl rand -hex 32` 生成。**生产环境必须设置**（缺失或少于 16 位时服务拒绝启动，不再回落默认值）。修改后所有已登录会话失效 |
| `ADMIN_PASSWORD` | 后台口令，**只在首次启动、库里还没有口令时写入**。之后在后台「设置」修改，再改这里无效 |
| `CRON_KEY` | 计划任务清理过期文件的凭据，`openssl rand -hex 16` |
| `DATA_DIR` | 数据目录绝对路径，如 `/www/wwwroot/hub-data`。不在构建产物内，更新不受影响 |
| `GUEST_VISITOR_QUOTA_GB` | 可选。单个访客同时保留的临时文件总量上限，默认见 `lib/upload.ts` |
| `GUEST_TOTAL_QUOTA_GB` | 可选。所有访客临时文件占用的站点总上限 |
| `STORAGE_QUOTA_GB` | 可选。站点总存储上限（首页环形图的分母） |

访客靠签名 Cookie `hub_vid`（有效期 1 年，由 `AUTH_SECRET` 签名）认出自己上传的文件；更换 `AUTH_SECRET` 后访客将看不到更换前上传的文件。缩略图由 `sharp` 生成并缓存在 `DATA_DIR/thumbs`，`sharp` 已在 `next.config.ts` 中外置，需随部署一起安装。

```bash
mkdir -p /www/wwwroot/hub-data
cat > /www/wwwroot/hub/.env <<EOF
AUTH_SECRET=$(openssl rand -hex 32)
ADMIN_PASSWORD=换成你的口令
CRON_KEY=$(openssl rand -hex 16)
DATA_DIR=/www/wwwroot/hub-data
EOF
chmod 600 /www/wwwroot/hub/.env
```

`PORT` / `HOSTNAME` 已在 `ecosystem.config.js` 里设为 `3000` / `127.0.0.1`（只监听本机，由 Nginx 对外）。

演示数据（可选，表为空时才插入，可重复执行）：

```bash
cd /www/wwwroot/hub-src && DATA_DIR=/www/wwwroot/hub-data npm run db:seed
```

---

## 5. PM2

`ecosystem.config.js`：应用名 `personal-hub`，`script: server.js`，`cwd` 为文件所在目录，单实例 fork 模式（SQLite 单写者，不要开 cluster），内存超 512M 自动重启。

```bash
cd /www/wwwroot/hub
pm2 start ecosystem.config.js --env production   # 首次
pm2 reload personal-hub --update-env              # 更新后
pm2 save                                          # 保存进程列表
pm2 startup                                       # 开机自启，按提示执行它打印的命令
pm2 logs personal-hub --lines 100                 # 看日志
```

**验证环境变量真的注入了**（`.env` 改动后必须 `reload --update-env` 才生效）：

```bash
pm2 env 0 | grep -E "AUTH_SECRET|DATA_DIR|CRON_KEY"
curl -s http://127.0.0.1:3000/ -o /dev/null -w '%{http_code}\n'   # 200
```

`AUTH_SECRET` 没注入的话会回落到代码里的默认值，等于会话可被伪造 —— 这一步别省。

> 必须带 `--env production`，否则 `PORT`/`HOSTNAME` 不生效（会监听 `0.0.0.0:3000`），`.env` 里的变量也不会注入。
> 用宝塔「PM2 管理器」界面添加也可以：启动文件选 `/www/wwwroot/hub/server.js`，运行目录 `/www/wwwroot/hub`，端口 3000。

---

## 6. better-sqlite3 原生模块

better-sqlite3 是 C++ 扩展，`.node` 二进制与**操作系统、CPU 架构、libc、Node ABI（主版本）**绑定。standalone 会把构建机上的二进制原样带进 `node_modules/better-sqlite3/build/Release/`。

- 在 macOS / Windows 或不同 Node 主版本下构建再上传 → 启动即报 `invalid ELF header` / `NODE_MODULE_VERSION mismatch` → 502。
- **推荐在服务器上构建**，天然匹配。
- 已经上传了不匹配的产物：

  ```bash
  cd /www/wwwroot/hub-src && npm rebuild better-sqlite3 && npm run build
  # 或直接在运行目录重建
  cd /www/wwwroot/hub && npm rebuild better-sqlite3
  ```

- 升级 Node 主版本后同样需要 rebuild。

自检：

```bash
cd /www/wwwroot/hub && node -e "new (require('better-sqlite3'))(':memory:');console.log('ok')"
```

---

## 7. Nginx

宝塔「网站 → 添加站点」（纯静态，根目录填 `/www/wwwroot/hub/public` 或任意空目录）→「设置 → 配置文件」。

**先删掉**宝塔默认生成的这两段，否则 `/_next/static/*.js` 会被它们按站点根目录查找而 404：

```nginx
location ~ .*\.(gif|jpg|jpeg|png|bmp|swf)$ { ... }
location ~ .*\.(js|css)?$ { ... }
```

不要再用宝塔「反向代理」标签页，它会生成另一份 `location /` 与下面冲突。在 `server { }` **之前**加：

```nginx
map $http_upgrade $hub_connection {
    default upgrade;
    ''      '';
}
```

在 `server { }` 内加：

```nginx
    # 分片上传每片 4MB（multipart 再多几百字节）。默认 1m 会在第一片就 413。
    # 64m 留足余量；整文件大小不受此限制。
    client_max_body_size 64m;

    # 构建产物带内容哈希，永久缓存
    location ^~ /_next/static/ {
        alias /www/wwwroot/hub/.next/static/;
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $hub_connection;

        # Range 透传：视频拖动、下载器断点续传
        proxy_set_header Range    $http_range;
        proxy_set_header If-Range $http_if_range;

        # 上传：边收边转，不在 Nginx 落盘
        proxy_request_buffering off;
        # 下载：流式回传，大文件不占 Nginx 临时目录
        proxy_buffering off;

        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
```

```bash
nginx -t && nginx -s reload
```

> `X-Forwarded-For` 用于登录失败限流按 IP 计数；不传则所有人共用一个计数。

---

## 8. SSL

宝塔「网站 → 设置 → SSL → Let's Encrypt」：域名已解析到本机、80 端口放行 → 申请 → 打开「强制 HTTPS」。证书自动续期。

**后台必须走 HTTPS**：生产环境下会话 Cookie 带 `Secure`，`http://` 访问时浏览器不会保存，登录后会被踢回登录页。

---

## 9. 计划任务：清理过期文件

宝塔「计划任务 → 添加」：类型 **Shell 脚本**，执行周期 **每天 03:17**：

```bash
curl -fsS -X POST "https://你的域名/api/files/purge?key=你的CRON_KEY"
```

- 只接受 `POST`，参数名 `key`，与 `.env` 里 `CRON_KEY` 比对；不匹配返回 403。
- 删除已过期的文件及其附件引用，并清掉 2 天未续传的分片残留。
- 返回 `{"removed":N,"bytes":N,"orphaned":N}`，可在任务日志里查看。
- 也可绕过 Nginx 直连：`http://127.0.0.1:3000/api/files/purge?key=...`

---

## 10. 备份

数据全部在 `DATA_DIR`。

**方式 A：后台下载**　后台「设置 → 下载数据库备份」（`GET /api/admin/backup`，WAL 安全的在线快照）。只含数据库，不含上传的文件。

**方式 B：服务器定时备份**　宝塔计划任务，每天执行：

```bash
B=/www/backup/hub/$(date +%F) && mkdir -p "$B"
cd /www/wwwroot/hub && node -e "new (require('better-sqlite3'))('/www/wwwroot/hub-data/app.db').backup('$B/app.db').then(()=>console.log('db ok'))"
tar -czf "$B/uploads.tar.gz" -C /www/wwwroot/hub-data uploads
find /www/backup/hub -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
```

> 进程运行中不要直接 `cp app.db`：WAL 模式下未合并的写入在 `app.db-wal` 里，单拷主文件会丢数据。要冷拷贝就先 `pm2 stop personal-hub`，整目录复制后再 `pm2 start`。

**恢复**：`pm2 stop personal-hub` → 删掉 `app.db-wal`、`app.db-shm` → 用备份覆盖 `app.db`（及 `uploads/`）→ `pm2 start personal-hub`。

---

## 11. 更新

服务器上跑的是旧版时，按下面三步走：**更新代码 → 装依赖 → 一键部署脚本**。

### 11.1 首次从旧版升级（重要）

本次更新引入了若干**历史数据库没有的列**（`files.uploader_id`、`files.width`、`files.height`）。这些列由 `db/index.ts` 在启动时用 `PRAGMA table_info` 守卫自动补齐，**不需要手动迁移**，但请注意：

- 升级前先备份数据库（第 10 节），万一失败可回滚。
- 新增列对旧数据是 `NULL`：旧文件 `uploader_id` 为空，因此**旧访客文件不会出现在任何访客的「我的临时文件」里**，也不再能被访客删除；它们会继续按过期时间被清理。管理员不受影响。
- 本次部署**必须设齐 `AUTH_SECRET`（≥16 位）和 `ADMIN_PASSWORD`**，否则生产环境会拒绝启动（旧版是回落到默认值）。见第 4 节。
- 新增可选配额变量 `GUEST_VISITOR_QUOTA_GB` / `GUEST_TOTAL_QUOTA_GB` / `STORAGE_QUOTA_GB`，不设则用默认值。
- 缩略图现在依赖 `sharp`；它已写进 `package.json`，`npm ci` 会装上。`sharp` 的预编译二进制与平台绑定，**若在本地构建再上传，务必确认平台一致**，否则缩略图失败只是回退原图（不会 502），但仍建议在服务器上构建。
- 旧的 `.env` 里若没有 `DATA_DIR`，升级时数据目录会被新目录覆盖（见 11.4 的注意事项）。

### 11.2 更新到新版本

```bash
# 源码在 git 里
bash /www/wwwroot/hub-src/scripts/deploy.sh

# 或上传了新的源码包
bash /www/wwwroot/hub-src/scripts/deploy.sh /root/hub-src.tar.gz
```

脚本流程：`git pull`/解压 → `npm ci` → `npm run build` → 拷贝 `.next/static`、`public`、`ecosystem.config.js` 与现有 `.env` 组装新目录 → 自检 better-sqlite3 → 原子切换 `/www/wwwroot/hub` → `pm2 reload` → `pm2 save`。

**先看这一步**：如果源码目录是用 `git clone` 拉的，先 `git -C /www/wwwroot/hub-src status` 确认没有本地改动，否则 `git pull --ff-only` 会失败。本地构建再上传的场景，源码包用 `tar -czf hub-src.tar.gz --exclude=node_modules --exclude=.next .` 打包，别把 `.next` 和 `node_modules` 打进去。

### 11.3 验证

```bash
pm2 ls                                  # personal-hub 应为 online
pm2 logs personal-hub --lines 50        # 无报错
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/    # 200
```

浏览器打开首页确认样式正常；中转站页应出现「我的临时文件」分区与取件码输入框（旧版没有）。

### 11.4 回滚

上一版保留在 `/www/wwwroot/hub.prev`：

```bash
mv /www/wwwroot/hub /www/wwwroot/hub.bad
mv /www/wwwroot/hub.prev /www/wwwroot/hub
pm2 reload personal-hub
```

如果失败发生在构建阶段（还没切换目录），源码目录里的旧版本仍在，直接改回去重跑即可。数据库层面：新增的列不影响旧代码读（旧代码只是不查它们），**一般情况下不需要回滚数据库**；如果你在升级后大量使用了新功能，回滚应用前先用备份还原数据库。

> ⚠️ 没有设 `DATA_DIR` 时数据在 `/www/wwwroot/hub/data`，脚本切换目录会把 `data` 搬到新目录，但 `.prev` 里的旧 `data` 可能残留 —— 这会导致回滚后看到的是旧数据。生产环境务必设 `DATA_DIR` 到独立路径（见第 2、4 节）。

### 11.5 路径不同时的自定义

```bash
SRC_DIR=/opt/hub-src APP_DIR=/opt/hub PM2_NAME=myhub KEEP_PREV=0 bash scripts/deploy.sh
```

`KEEP_PREV=0` 部署后删除 `.prev`，不留回滚版本。

---

## 12. 常见问题

**502 Bad Gateway**
- `pm2 ls` 看进程是否 `online`；`pm2 logs personal-hub` 看报错。
- 日志里 `invalid ELF header` / `NODE_MODULE_VERSION` / `Could not locate the bindings file` → 第 6 节，rebuild better-sqlite3。
- `SQLITE_CANTOPEN` / `EACCES` → `DATA_DIR` 不存在或运行用户无写权限：`mkdir -p` 并 `chown -R` 给运行 PM2 的用户。
- 启动时没带 `--env production` → 监听端口与 Nginx 不一致。`curl -I http://127.0.0.1:3000` 自查。

**上传卡在 4MB / 第一片就失败，控制台 413**
- Nginx `client_max_body_size` 没生效（默认 1m）。确认写在当前站点的 `server { }` 里，`nginx -t && nginx -s reload`。
- 套了 CDN / WAF 的，同样放宽它们的单请求体限制。

**大文件上传到一半断开 / 504**
- 确认 `proxy_request_buffering off` 与 `proxy_read_timeout 300s` 已加。

**登录后一刷新就掉登录 / 会话看起来是伪造的**
- `.env` 没被注入：`pm2 env 0 | grep AUTH_SECRET` 为空说明用的是默认密钥。`pm2 reload personal-hub --update-env`。
- 数据没落在预期位置：`DATA_DIR` 没注入时默认 `server.js` 同级的 `data/`，更新会被新目录覆盖。

**登录成功后又跳回登录页**
- 用的是 `http://`：生产环境 Cookie 为 `Secure`（`NODE_ENV=production` 时开启，`server.js` 强制为 production），浏览器丢弃。启用 SSL 并强制 HTTPS。
- `AUTH_SECRET` 变了或多份配置不一致（比如 PM2 里旧进程还带着旧环境）：统一 `.env` 后 `pm2 reload personal-hub --update-env`，必要时 `pm2 delete personal-hub` 再 start。
- 浏览器还留着旧 Cookie：清除站点 Cookie 后重登。

**口令忘了 / `ADMIN_PASSWORD` 改了不生效**
- 它只在库里没有口令时生效。删掉库里的口令记录后重启即按 `.env` 重新初始化：

  ```bash
  cd /www/wwwroot/hub && node -e "new (require('better-sqlite3'))('/www/wwwroot/hub-data/app.db').prepare(\"delete from settings where key='password_hash'\").run()"
  pm2 restart personal-hub
  ```

**页面没样式 / `/_next/static/...` 404**
- 漏拷 `.next/static`，或宝塔默认的 `location ~ .*\.(js|css)?$` 没删（第 7 节）。

**计划任务返回 403**
- `key` 与 `.env` 中 `CRON_KEY` 不一致，或 `CRON_KEY` 为空；改 `.env` 后需 `pm2 reload personal-hub --update-env`。

**访客上传后看不到自己的文件（升级后仍出现）**
- 检查是否真的升到了新版：`pm2 logs` 里 `GET /api/files/[id]/thumb` 之类的日志说明是新版。
- 访客身份靠 `hub_vid` Cookie（由 `AUTH_SECRET` 签名）。若部署后换过 `AUTH_SECRET`，旧 Cookie 全部失效，访客会「看不到之前传的文件」——这是预期行为，重新上传即可。
- 浏览器开了「退出时清除 Cookie」或无痕模式，每次都是新访客，也会看不到。

**缩略图不显示 / 一律是原图**
- `sharp` 没装上或平台不匹配：`cd /www/wwwroot/hub && node -e "require('sharp');console.log('ok')"`。
- 不复用旧的 `node_modules`：`sharp` 必须随 `npm ci` 一起装，手动拷贝要带上 `@img/` 目录。

---

## 13. 删除 / 下线

按「先停服务 → 再删站点 → 最后删文件」的顺序做，避免 Nginx 反代到一个已经没了的端口。

### 13.1 停止并移除 PM2 进程

```bash
pm2 stop personal-hub
pm2 delete personal-hub
pm2 save                                   # 同步进程列表，否则重启后又会被拉起来
```

如果用宝塔「PM2 管理器」界面添加的，也在那个界面里点「删除」。检查是否真的没了：

```bash
pm2 ls                                     # 列表里不应还有 personal-hub
ss -ltnp | grep ':3000'                    # 不应再有监听
```

### 13.2 删除宝塔站点

宝塔「网站 → 找到本站 → 删除」。删除时弹出的选项：

- **不要勾**「删除网站目录」（目录我们手动删，且要注意 `DATA_DIR` 在站点目录之外）。
- 若勾了「删除数据库」，与 SQLite 无关，不影响本站数据。
- 若站点开了 SSL，「网站 → SSL」里的证书一并清理。
- 若配置过反向代理，一并删除（第 7 节那份手写的 `map` / `location` 会随站点删除）。

### 13.3 删除目录

```bash
# 运行目录与源码目录
rm -rf /www/wwwroot/hub
rm -rf /www/wwwroot/hub.prev
rm -rf /www/wwwroot/hub.bad
rm -rf /www/wwwroot/hub-src

# 数据目录（数据库 + 上传文件 + 分片）—— 删了就没了，先确认已备份
rm -rf /www/wwwroot/hub-data

# 备份（若做过服务器定时备份）
rm -rf /www/backup/hub
```

> `rm -rf` 不可恢复。执行前先 `ls -la /www/wwwroot/hub-data` 确认里面确实是你想删的数据；要留一份就先 `tar -czf /root/hub-data-$(date +%F).tar.gz -C /www/wwwroot/hub-data .`。

### 13.4 清理计划任务与开机自启

- 宝塔「计划任务」：删掉第 9 节的过期文件清理任务、第 10 节的备份任务。
- 开机自启：`pm2 unstartup`（按提示执行它打印的命令），或直接不管 —— 进程已 `pm2 delete`，`pm2 save` 后不会再有。

### 13.5 验证删除干净

```bash
pm2 ls | grep personal-hub || echo 'pm2 已清理'
ss -ltnp | grep ':3000'   || echo '端口已释放'
curl -s -o /dev/null -w '%{http_code}\n' https://你的域名/   # 应为 404 或连接失败
ls /www/wwwroot | grep -E '^hub' || echo '目录已清理'
```

### 13.6 只想临时下线（保留数据）

不要 `rm -rf`，改用：

```bash
pm2 stop personal-hub            # 停服务，站点仍在但 502
# 或在宝塔「网站」里直接「停用」该站点，Nginx 会返回 503
```

恢复：`pm2 start personal-hub` 或重新启用站点。
