import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { sql } from 'drizzle-orm'
import { parseBody } from '@/lib/validate'
import { paperCreate } from '@/lib/schemas'
import { replaceAttachments } from '@/lib/attachments'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const r = await parseBody(req, paperCreate)
  if ('res' in r) return r.res
  const { attachments, ...b } = r.data

  const max = (await db.select({ m: sql<number>`coalesce(max(sort),0)` }).from(schema.papers).get())?.m ?? 0
  const [row] = await db.insert(schema.papers).values({
    title: b.title,
    authors: b.authors ?? [],
    venue: b.venue ?? null,
    type: b.type ?? null,
    status: b.status ?? 'draft',
    level: b.level ?? null,
    doi: b.doi ?? null,
    url: b.url ?? null,
    pubDate: b.pubDate ?? null,
    abstract: b.abstract ?? null,
    sort: max + 1,
  }).returning()

  replaceAttachments('paper', row.id, attachments)
  return NextResponse.json(row)
}
