const fs = require('node:fs')
const path = require('node:path')

/**
 * 独立构建产物里的 server.js 不会自己读 .env（实测：只认 process.env），
 * 所以在这里把同目录的 .env 解析后注入 PM2 进程环境。
 * 支持 KEY=VALUE、未加引号/单引号/双引号的值、# 注释与空行。
 */
function loadEnv(file) {
  const out = {}
  let raw = ''
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return out
  }
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const i = s.indexOf('=')
    if (i < 1) continue
    const key = s.slice(0, i).trim()
    let val = s.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) out[key] = val
  }
  return out
}

const fileEnv = loadEnv(path.join(__dirname, '.env'))

module.exports = {
  apps: [{
    name: 'personal-hub',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '512M',
    // .env 里的值优先于下面的默认值；两者都会被 shell 传入的同名变量覆盖
    env: { ...fileEnv },
    env_production: {
      NODE_ENV: 'production',
      PORT: '3000',
      HOSTNAME: '127.0.0.1',
      ...fileEnv,
    },
  }],
}
