import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { eq, and } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const cid = Number(id)
  if (!Number.isInteger(cid) || cid <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const b = await req.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  for (const k of ['name', 'level', 'categoryId', 'dateStart', 'dateEnd', 'result', 'team', 'description', 'sort'] as const) {
    if (b[k] !== undefined) patch[k] = b[k] === '' ? null : b[k]
  }
  if (b.name !== undefined && !String(b.name).trim()) {
    return NextResponse.json({ error: '名称必填' }, { status: 400 })
  }

  // 只带 attachments 时 patch 为空，drizzle 的 .set({}) 会抛错 —— 跳过更新，直接取行
  const row = Object.keys(patch).length
    ? (await db.update(schema.competitions).set(patch).where(eq(schema.competitions.id, cid)).returning())[0]
    : await db.select().from(schema.competitions).where(eq(schema.competitions.id, cid)).get()
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  if (Array.isArray(b.attachments)) {
    await db.delete(schema.attachments)
      .where(and(eq(schema.attachments.ownerType, 'competition'), eq(schema.attachments.ownerId, cid)))
    if (b.attachments.length) {
      await db.insert(schema.attachments).values(
        b.attachments.filter((a: any) => a?.fileId).map((a: any, i: number) => ({
          ownerType: 'competition' as const,
          ownerId: cid,
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
  const cid = Number(id)
  if (!Number.isInteger(cid) || cid <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  await db.delete(schema.attachments)
    .where(and(eq(schema.attachments.ownerType, 'competition'), eq(schema.attachments.ownerId, cid)))
  await db.delete(schema.competitions).where(eq(schema.competitions.id, cid))
  return NextResponse.json({ ok: true })
}
