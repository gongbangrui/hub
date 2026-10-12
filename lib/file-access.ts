import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { db, schema } from '@/db'
import { eq } from 'drizzle-orm'
import { hashPassword, verifyPassword } from '@/lib/auth'
import type { FileRow } from '@/db/schema'

const GRANT_TTL = 60 * 60
const secret = () => process.env.AUTH_SECRET || 'dev-secret-change-me'
const sign = (id: number, exp: number) => createHmac('sha256', secret()).update(`dl:${id}:${exp}`).digest('base64url')
const grantName = (id: number) => `hub_dl_${id}`

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
}

export function toPublicFile(f: FileRow): PublicFile {
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
  }
}
