import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { eq, and } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const pid = Number(id)
  if (!Number.isInteger(pid) || pid <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const b = await req.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  for (const k of ['title', 'venue', 'type', 'status', 'level', 'doi', 'url', 'pubDate', 'abstract', 'sort'] as const) {
    if (b[k] !== undefined) patch[k] = b[k] === '' ? null : b[k]
  }
  if (b.authors !== undefined) patch.authors = Array.isArray(b.authors) ? b.authors.filter(Boolean).slice(0, 40) : []

  // 只带 attachments 时 patch 为空，drizzle 的 .set({}) 会抛错 —— 跳过更新，直接取行
  const row = Object.keys(patch).length
    ? (await db.update(schema.papers).set(patch).where(eq(schema.papers.id, pid)).returning())[0]
    : await db.select().from(schema.papers).where(eq(schema.papers.id, pid)).get()
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  if (Array.isArray(b.attachments)) {
    await db.delete(schema.attachments)
      .where(and(eq(schema.attachments.ownerType, 'paper'), eq(schema.attachments.ownerId, pid)))
    if (b.attachments.length) {
      await db.insert(schema.attachments).values(
        b.attachments.filter((a: any) => a?.fileId).map((a: any, i: number) => ({
          ownerType: 'paper' as const,
          ownerId: pid,
          fileId: Number(a.fileId),
          caption: a.caption || null,
          sort: i,
        })),
      )
    }
  }
  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const pid = Number(id)
  if (!Number.isInteger(pid) || pid <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  await db.delete(schema.attachments)
    .where(and(eq(schema.attachments.ownerType, 'paper'), eq(schema.attachments.ownerId, pid)))
  await db.delete(schema.papers).where(eq(schema.papers.id, pid))
  return NextResponse.json({ ok: true })
}
