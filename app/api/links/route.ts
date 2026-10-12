import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { eq, sql } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function GET() {
  const rows = await db.select().from(schema.links)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const body = await req.json()
  if (!body?.title || !body?.url) return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 })

  const max = await db.select({ m: sql<number>`coalesce(max(sort),0)` }).from(schema.links).get()
  const [row] = await db.insert(schema.links).values({
    title: String(body.title).slice(0, 200),
    url: String(body.url).slice(0, 2000),
    description: body.description ?? null,
    categoryId: body.categoryId ?? null,
    tags: Array.isArray(body.tags) ? body.tags.slice(0, 20) : [],
    pinned: !!body.pinned,
    sort: (max?.m ?? 0) + 1,
  }).returning()

  return NextResponse.json(row)
}
