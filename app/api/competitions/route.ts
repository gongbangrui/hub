import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { sql } from 'drizzle-orm'
import { parseBody } from '@/lib/validate'
import { competitionCreate } from '@/lib/schemas'
import { replaceAttachments } from '@/lib/attachments'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const r = await parseBody(req, competitionCreate)
  if ('res' in r) return r.res
  const { attachments, ...b } = r.data

  const max = (await db.select({ m: sql<number>`coalesce(max(sort),0)` }).from(schema.competitions).get())?.m ?? 0
  const [row] = await db.insert(schema.competitions).values({
    name: b.name,
    level: b.level ?? null,
    categoryId: b.categoryId ?? null,
    dateStart: b.dateStart ?? null,
    dateEnd: b.dateEnd ?? null,
    result: b.result ?? null,
    team: b.team ?? null,
    description: b.description ?? null,
    sort: max + 1,
  }).returning()

  replaceAttachments('competition', row.id, attachments)
  return NextResponse.json(row)
}
