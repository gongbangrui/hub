/**
 * 签名密钥。middleware 也会引用，所以这里不能依赖 node: 模块。
 * 生产环境缺失或过短直接抛错（fail closed），否则会退回公开的开发密钥，任何人都能伪造管理员会话。
 */
const DEV_FALLBACK = 'dev-secret-change-me'

export function authSecret(): string {
  const s = process.env.AUTH_SECRET
  if (s && s.length >= 16) return s
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET 未设置或少于 16 位：请用 openssl rand -hex 32 生成并写入 .env')
  }
  return s || DEV_FALLBACK
}

export const authSecretBytes = () => new TextEncoder().encode(authSecret())
