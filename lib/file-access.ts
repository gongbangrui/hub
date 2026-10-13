import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { db, schema } from '@/db'
import { eq } from 'drizzle-orm'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { authSecret } from '@/lib/secret'
import type { FileRow } from '@/db/schema'

const GRANT_TTL = 60 * 60
const secret = authSecret
const sign = (id: number, exp: number) => createHmac('sha256', secret()).update(`dl:${id}:${exp}`).digest('base64url')
const grantName = (id: number) => `hub_dl_${id}`

// ---- 访客身份：签名 Cookie，用来认出「这是我传的文件」 ----
const VID_COOKIE = 'hub_vid'
const VID_TTL = 60 * 60 * 24 * 365
const signVid = (id: string) => createHmac('sha256', secret()).update(`vid:${id}`).digest('base64url')

function parseVid(raw: string | undefined) {
  if (!raw) return null
  const [id, sig] = raw.split('.')
  if (!id || !sig || !/^[A-Za-z0-9_-]{16,32}$/.test(id)) return null
  const a = Buffer.from(sig)
  const b = Buffer.from(signVid(id))
  return a.length === b.length && timingSafeEqual(a, b) ? id : null
}

/** 只读：服务端组件也能用（不能写 Cookie）。没有或签名不对返回 null */
export async function readVisitorId() {
  return parseVid((await cookies()).get(VID_COOKIE)?.value)
}

/** 读取或签发访客标识。只能在 Route Handler / Server Action 里调用 */
export async function ensureVisitorId() {
  const jar = await cookies()
  const existing = parseVid(jar.get(VID_COOKIE)?.value)
  if (existing) return existing
  const id = randomBytes(16).toString('base64url')
  jar.set(VID_COOKIE, `${id}.${signVid(id)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: VID_TTL,
  })
  return id
}

/** 分享口令验证通过后发一个 1 小时有效的下载凭证（HttpOnly Cookie，img/iframe 也能带上） */
export async function setGrant(id: number) {
  const exp = Math.floor(Date.now() / 1000) + GRANT_TTL
  const jar = await cookies()
  jar.set(grantName(id), `${exp}.${sign(id, exp)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GRANT_TTL,
  })
}

export async function hasGrant(id: number) {
  const raw = (await cookies()).get(grantName(id))?.value
  if (!raw) return false
  const [expStr, sig] = raw.split('.')
  const exp = Number(expStr)
  if (!sig || !Number.isFinite(exp) || exp * 1000 < Date.now()) return false
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(id, exp))
  return a.length === b.length && timingSafeEqual(a, b)
}

/** 被竞赛/论文引用的文件视为私密 */
export async function isAttached(fileId: number) {
  const hit = await db.select({ id: schema.attachments.id }).from(schema.attachments)
    .where(eq(schema.attachments.fileId, fileId)).get()
  return !!hit
}

export function hashSharePassword(pw: unknown) {
  const s = typeof pw === 'string' ? pw.trim().slice(0, 60) : ''
  return s ? hashPassword(s) : null
}

/** 兼容旧数据：早期分享口令是明文存的 */
export function checkSharePassword(input: string, stored: string) {
  if (/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) return verifyPassword(input, stored)
  const a = Buffer.from(input)
  const b = Buffer.from(stored)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type Access = 'ok' | 'locked' | 'not_found'

/** 未登录访问规则：只认随机 token、附件不可见、有口令须先解锁 */
export async function guestAccess(row: FileRow, viaToken: boolean): Promise<Access> {
  if (!viaToken) return 'not_found'
  if (await isAttached(row.id)) return 'not_found'
  if (row.sharePassword && !(await hasGrant(row.id))) return 'locked'
  return 'ok'
}

/** 下发给浏览器的文件字段：不含存储路径、删除凭证、口令 */
export type PublicFile = {
  id: number
  token: string
  originalName: string
  mime: string
  size: number
  owner: 'guest' | 'admin'
  shareCode: string | null
  locked: boolean
  downloads: number
  expiresAt: string | null
  createdAt: string
  /** 当前访客自己上传的（管理员视角下恒为 false） */
  mine: boolean
  width: number | null
  height: number | null
  /** 当前访问者能否删除：管理员，或这是自己传的 */
  canDelete: boolean
}

export function toPublicFile(f: FileRow, viewer: { admin: boolean; vid: string | null }): PublicFile {
  const mine = !viewer.admin && !!viewer.vid && f.uploaderId === viewer.vid
  return {
    id: f.id,
    token: f.token,
    originalName: f.originalName,
    mime: f.mime,
    size: f.size,
    owner: f.owner,
    shareCode: f.shareCode,
    locked: !!f.sharePassword,
    downloads: f.downloads,
    expiresAt: f.expiresAt ? f.expiresAt.toISOString() : null,
    createdAt: f.createdAt.toISOString(),
    mine,
    width: f.width,
    height: f.height,
    canDelete: viewer.admin || mine,
  }
}
