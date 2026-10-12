import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { eq } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const cid = Number(id)
  if (!Number.isInteger(cid) || cid <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const b = await req.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  if (b.name !== undefined) patch.name = String(b.name).trim().slice(0, 80)
  if (b.color !== undefined) patch.color = b.color || null
  if (b.sort !== undefined) patch.sort = Number(b.sort)
  if (patch.name === '') return NextResponse.json({ error: '名称必填' }, { status: 400 })
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'NO_FIELDS' }, { status: 400 })

  const [row] = await db.update(schema.categories).set(patch).where(eq(schema.categories.id, cid)).returning()
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const cid = Number(id)
  if (!Number.isInteger(cid) || cid <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  // 分类删掉后，挂在上面的条目退回未分类，不跟着删
  await db.update(schema.links).set({ categoryId: null }).where(eq(schema.links.categoryId, cid))
  await db.update(schema.competitions).set({ categoryId: null }).where(eq(schema.competitions.categoryId, cid))
  await db.delete(schema.categories).where(eq(schema.categories.id, cid))
  return NextResponse.json({ ok: true })
}
