import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { eq } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const linkId = Number(id)
  if (!Number.isInteger(linkId) || linkId <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const body = await req.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  if (body.title !== undefined) patch.title = String(body.title).slice(0, 200)
  if (body.url !== undefined) patch.url = String(body.url).slice(0, 2000)
  if (body.description !== undefined) patch.description = body.description
  if (body.categoryId !== undefined) patch.categoryId = body.categoryId
  if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags.slice(0, 20) : []
  if (body.pinned !== undefined) patch.pinned = !!body.pinned
  if (body.sort !== undefined) patch.sort = Number(body.sort)

  if (!Object.keys(patch).length) return NextResponse.json({ error: 'NO_FIELDS' }, { status: 400 })

  const [row] = await db.update(schema.links).set(patch).where(eq(schema.links.id, linkId)).returning()
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const linkId = Number(id)
  if (!Number.isInteger(linkId) || linkId <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  await db.delete(schema.links).where(eq(schema.links.id, linkId))
  return NextResponse.json({ ok: true })
}
