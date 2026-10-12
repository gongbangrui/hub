import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { removeStored, invalidateDirSize } from '@/lib/storage'
import { eq } from 'drizzle-orm'
import { timingSafeEqual } from 'node:crypto'
import { hashSharePassword } from '@/lib/file-access'

export const runtime = 'nodejs'

/** 等长比较，避免用 === 比删除凭证 */
function sameKey(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fileId = Number(id)
  if (!Number.isInteger(fileId) || fileId <= 0) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  const row = await db.select().from(schema.files).where(eq(schema.files.id, fileId)).get()
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const authed = await isAuthed()
  const key = req.nextUrl.searchParams.get('key')
  const ok = authed || (!!row.deleteKey && !!key && sameKey(key, row.deleteKey))
  if (!ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  await db.delete(schema.attachments).where(eq(schema.attachments.fileId, row.id))
  await db.delete(schema.files).where(eq(schema.files.id, row.id))
  removeStored(row.storedPath)
  invalidateDirSize()
  return NextResponse.json({ ok: true })
}

/** 改分享设置（仅登录） */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const fileId = Number(id)
  if (!Number.isInteger(fileId) || fileId <= 0) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  const body = await req.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  if (body.sharePassword !== undefined) patch.sharePassword = hashSharePassword(body.sharePassword)
  if (body.expiresAt !== undefined) {
    // 非法日期会写进 Invalid Date，之后所有比较都为 false，文件永不清理
    if (!body.expiresAt) patch.expiresAt = null
    else {
      const d = new Date(body.expiresAt)
      patch.expiresAt = Number.isNaN(d.getTime()) ? null : d
    }
  }
  if (body.originalName !== undefined) patch.originalName = String(body.originalName).slice(0, 200)
  // 设为永久：转为管理员文件并取消过期
  if (body.keep) { patch.owner = 'admin'; patch.expiresAt = null }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'NO_FIELDS' }, { status: 400 })

  const [row] = await db.update(schema.files).set(patch).where(eq(schema.files.id, fileId)).returning()
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json(row)
}
