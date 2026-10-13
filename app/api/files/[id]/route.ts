import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { removeStored, removeThumbs, invalidateDirSize } from '@/lib/storage'
import { eq } from 'drizzle-orm'
import { hashSharePassword, readVisitorId, isAttached } from '@/lib/file-access'

export const runtime = 'nodejs'

const badId = (id: number) => !Number.isInteger(id) || id <= 0

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fileId = Number(id)
  if (badId(fileId)) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const row = await db.select().from(schema.files).where(eq(schema.files.id, fileId)).get()
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  // 管理员，或这份文件就是当前访客自己传的（签名 Cookie 认人，不再用 URL 里的 key）
  const authed = await isAuthed()
  const vid = authed ? null : await readVisitorId()
  const ok = authed || (!!vid && row.owner === 'guest' && row.uploaderId === vid)
  if (!ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  // 已被竞赛/论文引用的文件不能直接删：这里静默连带删掉 attachments，
  // 会让管理员那边的记录凭空少一个附件（访客删除自己文件时尤其意外）
  if (await isAttached(row.id)) {
    return NextResponse.json({ error: '这个文件已被竞赛或论文引用，请先在那边移除附件' }, { status: 409 })
  }

  await db.delete(schema.attachments).where(eq(schema.attachments.fileId, row.id))
  await db.delete(schema.files).where(eq(schema.files.id, row.id))
  removeStored(row.storedPath)
  removeThumbs(row.id)
  invalidateDirSize()
  return NextResponse.json({ ok: true })
}

/** 改分享设置（仅登录） */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const fileId = Number(id)
  if (badId(fileId)) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
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
  // 设为永久：转为管理员文件、取消过期，并切断原上传者的访问（否则他仍能凭 Cookie 删掉它）
  if (body.keep) { patch.owner = 'admin'; patch.expiresAt = null; patch.uploaderId = null; patch.deleteKey = null }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'NO_FIELDS' }, { status: 400 })

  const [row] = await db.update(schema.files).set(patch).where(eq(schema.files.id, fileId)).returning()
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json(row)
}
