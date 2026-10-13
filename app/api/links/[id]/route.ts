import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { eq } from 'drizzle-orm'
import { parseBody, defined } from '@/lib/validate'
import { linkPatch } from '@/lib/schemas'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { id } = await params
  const linkId = Number(id)
  if (!Number.isInteger(linkId) || linkId <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const r = await parseBody(req, linkPatch)
  if ('res' in r) return r.res
  const patch = defined(r.data)
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
