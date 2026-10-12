#!/usr/bin/env bash
# 服务器端一键更新：拉代码/解压 → 安装 → 构建 → 组装 standalone → 切换目录 → pm2 reload
#
# 用法：
#   bash scripts/deploy.sh                 # SRC_DIR 是 git 仓库时自动 git pull
#   bash scripts/deploy.sh /tmp/hub.tar.gz # 先把源码包解压到 SRC_DIR 再构建
#
# 可配置（环境变量）：
#   SRC_DIR   源码目录，在此构建         默认 /www/wwwroot/hub-src
#   APP_DIR   运行目录，PM2 从此启动     默认 /www/wwwroot/hub
#   PM2_NAME  与 ecosystem.config.js 一致 默认 personal-hub
#   KEEP_PREV 保留上一版用于回滚（1/0）   默认 1
set -euo pipefail

SRC_DIR="${SRC_DIR:-/www/wwwroot/hub-src}"
APP_DIR="${APP_DIR:-/www/wwwroot/hub}"
PM2_NAME="${PM2_NAME:-personal-hub}"
KEEP_PREV="${KEEP_PREV:-1}"
ARCHIVE="${1:-}"

APP_DIR="${APP_DIR%/}"
NEW_DIR="${APP_DIR}.new"
PREV_DIR="${APP_DIR}.prev"

log() { printf '\033[36m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null || die "找不到 node"
command -v npm  >/dev/null || die "找不到 npm"
command -v pm2  >/dev/null || die "找不到 pm2（npm i -g pm2）"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || die "Node 需 >= 22（better-sqlite3 要求），当前 $(node -v)"

# —— 1. 取源码 ——
mkdir -p "$SRC_DIR"
if [ -n "$ARCHIVE" ]; then
  [ -f "$ARCHIVE" ] || die "源码包不存在：$ARCHIVE"
  log "解压 $ARCHIVE → $SRC_DIR"
  tar -xzf "$ARCHIVE" -C "$SRC_DIR"
elif [ -d "$SRC_DIR/.git" ]; then
  log "git pull"
  git -C "$SRC_DIR" pull --ff-only
else
  log "无 git 仓库也未给源码包，直接用 $SRC_DIR 现有源码"
fi
cd "$SRC_DIR"
[ -f package.json ] || die "$SRC_DIR 下没有 package.json"

# —— 2. 安装 & 构建 ——
# 构建需要 devDependencies（tailwind / typescript），即使环境里 NODE_ENV=production
log "npm ci"
npm ci --include=dev --no-audit --no-fund

# 构建期会加载 db 模块，指到临时目录，避免触碰线上数据库
log "npm run build"
rm -rf .next
DATA_DIR="$SRC_DIR/.build-data" npm run build
rm -rf "$SRC_DIR/.build-data"

# server.js 一般在 .next/standalone 根；monorepo/上层有锁文件时会嵌套，按实际位置找
SERVER_JS="$(find .next/standalone -name server.js -not -path '*/node_modules/*' | head -n 1)"
[ -n "$SERVER_JS" ] || die "没找到 .next/standalone/**/server.js，确认 next.config 里 output: 'standalone'"
STANDALONE="$(dirname "$SERVER_JS")"

# —— 3. 组装新版本 ——
log "组装 $NEW_DIR"
rm -rf "$NEW_DIR"
cp -a "$STANDALONE" "$NEW_DIR"
mkdir -p "$NEW_DIR/.next"
cp -a .next/static "$NEW_DIR/.next/static"
[ -d public ] && cp -a public "$NEW_DIR/public"
cp -a ecosystem.config.js "$NEW_DIR/"
# 源码目录里的 .env 会被 next build 带进产物；运行目录里的 .env 优先
[ -f "$APP_DIR/.env" ] && cp -a "$APP_DIR/.env" "$NEW_DIR/.env"
[ -f "$NEW_DIR/.env" ] || log "警告：$NEW_DIR/.env 不存在，将使用默认密钥与 ./data"

# 原生模块自检：ABI 不匹配会在这里直接失败，而不是上线后 502
log "检查 better-sqlite3"
(cd "$NEW_DIR" && node -e "new (require('better-sqlite3'))(':memory:').prepare('select 1').get()") \
  || die "better-sqlite3 加载失败；在 $SRC_DIR 执行 npm rebuild better-sqlite3 后重试"

# 未设置 DATA_DIR 时数据默认在 APP_DIR/data，切换前搬过去
if [ -d "$APP_DIR/data" ] && [ ! -L "$APP_DIR/data" ]; then
  log "迁移 $APP_DIR/data"
  mv "$APP_DIR/data" "$NEW_DIR/data"
elif [ -L "$APP_DIR/data" ]; then
  cp -a "$APP_DIR/data" "$NEW_DIR/data"
fi

# —— 4. 切换 & 重载 ——
log "切换目录"
rm -rf "$PREV_DIR"
[ -d "$APP_DIR" ] && mv "$APP_DIR" "$PREV_DIR"
mv "$NEW_DIR" "$APP_DIR"

cd "$APP_DIR"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  log "pm2 reload $PM2_NAME"
  pm2 reload ecosystem.config.js --env production --update-env
else
  log "pm2 start $PM2_NAME"
  pm2 start ecosystem.config.js --env production
fi
pm2 save >/dev/null

[ "$KEEP_PREV" = "1" ] || rm -rf "$PREV_DIR"

log "完成 → $(node -p "require('$APP_DIR/package.json').version" 2>/dev/null || echo ok)"
[ "$KEEP_PREV" = "1" ] && log "回滚：mv $APP_DIR $APP_DIR.bad && mv $PREV_DIR $APP_DIR && pm2 reload $PM2_NAME"
exit 0
