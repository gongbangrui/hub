import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { eq } from 'drizzle-orm'
import { parseBody, defined } from '@/lib/validate'
import { categoryPatch } from '@/lib/schemas'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const cid = Number(id)
  if (!Number.isInteger(cid) || cid <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const r = await parseBody(req, categoryPatch)
  if ('res' in r) return r.res
  const patch = defined(r.data)
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

  // 分类删掉后，挂在上面的条目退回未分类，不跟着删（一个事务）
  db.transaction((tx) => {
    tx.update(schema.links).set({ categoryId: null }).where(eq(schema.links.categoryId, cid)).run()
    tx.update(schema.competitions).set({ categoryId: null }).where(eq(schema.competitions.categoryId, cid)).run()
    tx.delete(schema.categories).where(eq(schema.categories.id, cid)).run()
  })
  return NextResponse.json({ ok: true })
}
