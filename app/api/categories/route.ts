import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { sql, eq } from 'drizzle-orm'
import { parseBody } from '@/lib/validate'
import { categoryCreate } from '@/lib/schemas'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const r = await parseBody(req, categoryCreate)
  if ('res' in r) return r.res
  const b = r.data

  const name = b.name
  const slug = (b.slug || name)
    .toLowerCase().replace(/[^a-z0-9一-龥]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    || `cat-${Date.now()}`

  if (await db.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.slug, slug)).get()) {
    return NextResponse.json({ error: '这个标识已存在' }, { status: 409 })
  }

  const max = (await db.select({ m: sql<number>`coalesce(max(sort),0)` }).from(schema.categories).get())?.m ?? 0
  const [row] = await db.insert(schema.categories).values({
    name, slug,
    kind: b.kind ?? 'link',
    color: b.color ?? null,
    sort: max + 1,
  }).returning()
  return NextResponse.json(row)
}
