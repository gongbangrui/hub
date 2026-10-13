import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { eq } from 'drizzle-orm'
import { parseBody, defined } from '@/lib/validate'
import { competitionPatch } from '@/lib/schemas'
import { replaceAttachments, clearAttachments } from '@/lib/attachments'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const cid = Number(id)
  if (!Number.isInteger(cid) || cid <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const r = await parseBody(req, competitionPatch)
  if ('res' in r) return r.res
  const { attachments, ...rest } = r.data
  const patch = defined(rest)

  // 只带 attachments 时 patch 为空，drizzle 的 .set({}) 会抛错 —— 跳过更新，直接取行
  const row = Object.keys(patch).length
    ? (await db.update(schema.competitions).set(patch).where(eq(schema.competitions.id, cid)).returning())[0]
    : await db.select().from(schema.competitions).where(eq(schema.competitions.id, cid)).get()
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  replaceAttachments('competition', cid, attachments)
  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const cid = Number(id)
  if (!Number.isInteger(cid) || cid <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  // 先删附件（连带清理磁盘上不再被引用的文件），再删竞赛本身
  clearAttachments('competition', cid)
  await db.delete(schema.competitions).where(eq(schema.competitions.id, cid))
  return NextResponse.json({ ok: true })
}
