import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { sql } from 'drizzle-orm'
import { parseBody } from '@/lib/validate'
import { linkCreate } from '@/lib/schemas'

export const runtime = 'nodejs'

export async function GET() {
  const rows = await db.select().from(schema.links)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const r = await parseBody(req, linkCreate)
  if ('res' in r) return r.res
  const b = r.data

  const max = await db.select({ m: sql<number>`coalesce(max(sort),0)` }).from(schema.links).get()
  const [row] = await db.insert(schema.links).values({
    title: b.title,
    url: b.url,
    description: b.description ?? null,
    categoryId: b.categoryId ?? null,
    tags: b.tags ?? [],
    pinned: !!b.pinned,
    sort: (max?.m ?? 0) + 1,
  }).returning()

  return NextResponse.json(row)
}
