import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { eq } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { ids } = await req.json()
  if (!Array.isArray(ids)) return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 })

  for (let i = 0; i < ids.length; i++) {
    await db.update(schema.links).set({ sort: i }).where(eq(schema.links.id, Number(ids[i])))
  }
  return NextResponse.json({ ok: true })
}
