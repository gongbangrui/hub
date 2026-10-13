import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { eq } from 'drizzle-orm'
import { parseBody, defined } from '@/lib/validate'
import { paperPatch } from '@/lib/schemas'
import { replaceAttachments, clearAttachments } from '@/lib/attachments'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const pid = Number(id)
  if (!Number.isInteger(pid) || pid <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const r = await parseBody(req, paperPatch)
  if ('res' in r) return r.res
  const { attachments, ...rest } = r.data
  const patch = defined(rest)

  // 只带 attachments 时 patch 为空，drizzle 的 .set({}) 会抛错 —— 跳过更新，直接取行
  const row = Object.keys(patch).length
    ? (await db.update(schema.papers).set(patch).where(eq(schema.papers.id, pid)).returning())[0]
    : await db.select().from(schema.papers).where(eq(schema.papers.id, pid)).get()
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  replaceAttachments('paper', pid, attachments)
  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const pid = Number(id)
  if (!Number.isInteger(pid) || pid <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  clearAttachments('paper', pid)
  await db.delete(schema.papers).where(eq(schema.papers.id, pid))
  return NextResponse.json({ ok: true })
}
