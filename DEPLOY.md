# 部署（宝塔面板）

单进程 Node 服务 + SQLite，Nginx 反代。推荐**直接在服务器上构建**。

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
| `AUTH_SECRET` | 会话签名密钥，`openssl rand -hex 32` 生成。**必须设置**，否则回落到代码里的默认值。修改后所有已登录会话失效 |
| `ADMIN_PASSWORD` | 后台口令，**只在首次启动、库里还没有口令时写入**。之后在后台「设置」修改，再改这里无效 |
| `CRON_KEY` | 计划任务清理过期文件的凭据，`openssl rand -hex 16` |
| `DATA_DIR` | 数据目录绝对路径，如 `/www/wwwroot/hub-data`。不在构建产物内，更新不受影响 |

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

```bash
# 源码在 git 里
bash /www/wwwroot/hub-src/scripts/deploy.sh

# 或上传了新的源码包
bash /www/wwwroot/hub-src/scripts/deploy.sh /root/hub-src.tar.gz
```

脚本流程：`git pull`/解压 → `npm ci` → `npm run build` → 拷贝 `.next/static`、`public`、`ecosystem.config.js` 与现有 `.env` 组装新目录 → 自检 better-sqlite3 → 原子切换 `/www/wwwroot/hub` → `pm2 reload` → `pm2 save`。

上一版保留在 `/www/wwwroot/hub.prev`，回滚：

```bash
mv /www/wwwroot/hub /www/wwwroot/hub.bad && mv /www/wwwroot/hub.prev /www/wwwroot/hub && pm2 reload personal-hub
```

路径不同时用环境变量覆盖：`SRC_DIR=... APP_DIR=... PM2_NAME=... bash scripts/deploy.sh`。

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
