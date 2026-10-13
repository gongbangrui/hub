import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { db, schema } from '@/db'
import { eq } from 'drizzle-orm'
import { cache } from 'react'

import { authSecretBytes } from '@/lib/secret'

const COOKIE = 'hub_session'
const secret = authSecretBytes

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`
}

export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const a = Buffer.from(hash, 'hex')
  const b = scryptSync(pw, salt, 64)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function readSetting(key: string) {
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()
  return row?.value ?? null
}

/** 同一次请求内按 key 去重：布局和页面各取一次 site_title 只查一次库 */
export const getSetting = cache(readSetting)

export async function setSetting(key: string, value: string) {
  await db.insert(schema.settings).values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
}

const g = globalThis as unknown as { __initDone?: Promise<void> }

/** 首次访问时写入默认设置与初始口令。整个进程只做一次，失败了下次再试 */
export function ensureInit() {
  if (!g.__initDone) {
    g.__initDone = doInit().catch((e) => { g.__initDone = undefined; throw e })
  }
  return g.__initDone
}

async function doInit() {
  const existing = await readSetting('password_hash')
  if (!existing) {
    const initial = process.env.ADMIN_PASSWORD
    // 生产环境不允许落到默认口令 'admin'
    if (!initial && process.env.NODE_ENV === 'production') {
      throw new Error('首次启动需要设置 ADMIN_PASSWORD')
    }
    await setSetting('password_hash', hashPassword(initial || 'admin'))
  }
  const title = await readSetting('site_title')
  if (title === null) {
    await setSetting('site_title', 'Foliage')
    await setSetting('site_subtitle', '链接、文件、竞赛与论文')
    await setSetting('hero_line', '把散落的东西，收在一处。')
  }
}

export async function createSession() {
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret())
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function destroySession() {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export async function isAuthed(): Promise<boolean> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return false
  try {
    await jwtVerify(token, secret(), { algorithms: ['HS256'] })
    return true
  } catch {
    return false
  }
}

export async function requireAuth() {
  if (!(await isAuthed())) throw new Error('UNAUTHORIZED')
}

const attempts = new Map<string, { count: number; first: number; until: number }>()
const MAX = 5
const LOCK_MS = 5 * 60 * 1000
const WINDOW_MS = 5 * 60 * 1000
const MAX_ENTRIES = 5000

/** 过期条目只在被访问时清理，扫描型攻击可以无限堆内存 —— 超阈值时整体清一遍 */
function sweep() {
  if (attempts.size < MAX_ENTRIES) return
  const t = Date.now()
  for (const [k, v] of attempts) if (t >= v.until) attempts.delete(k)
  // 全都还在锁定中（极端情况）就直接换掉，宁可放过也不无限增长
  if (attempts.size >= MAX_ENTRIES) attempts.clear()
}

export function checkRate(ip: string) {
  const rec = attempts.get(ip)
  if (!rec) return 0
  if (Date.now() >= rec.until) { attempts.delete(ip); return 0 }
  return rec.count >= MAX ? Math.ceil((rec.until - Date.now()) / 1000) : 0
}

export function recordFail(ip: string) {
  sweep()
  const now = Date.now()
  const rec = attempts.get(ip)
  // 首次失败，或距首次失败已超出统计窗口 → 重新开始计数
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: now, until: now + LOCK_MS })
    return
  }
  rec.count += 1
  rec.until = now + LOCK_MS
}

export function clearFails(ip: string) { attempts.delete(ip) }

/**
 * 限流用的客户端 IP：优先 nginx 写入的 X-Real-IP，其次 X-Forwarded-For 最后一跳
 * （首段可被客户端伪造，换个值就能绕过限流）
 */
export function clientIp(headers: Headers) {
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real
  const hops = headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean)
  return hops?.length ? hops[hops.length - 1] : 'local'
}
