import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { sql } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const b = await req.json()
  if (!b?.name?.trim()) return NextResponse.json({ error: '名称必填' }, { status: 400 })

  const max = (await db.select({ m: sql<number>`coalesce(max(sort),0)` }).from(schema.competitions).get())?.m ?? 0
  const [row] = await db.insert(schema.competitions).values({
    name: String(b.name).trim().slice(0, 300),
    level: b.level || null,
    categoryId: b.categoryId ?? null,
    dateStart: b.dateStart || null,
    dateEnd: b.dateEnd || null,
    result: b.result || null,
    team: b.team || null,
    description: b.description || null,
    sort: max + 1,
  }).returning()

  if (Array.isArray(b.attachments) && b.attachments.length) {
    await db.insert(schema.attachments).values(
      b.attachments.filter((a: any) => a?.fileId).map((a: any, i: number) => ({
        ownerType: 'competition' as const,
        ownerId: row.id,
        fileId: Number(a.fileId),
        caption: a.caption || null,
        sort: i,
      })),
    )
  }
  return NextResponse.json(row)
}
