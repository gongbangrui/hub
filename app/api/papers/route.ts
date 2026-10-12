import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { sql } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const b = await req.json()
  if (!b?.title?.trim()) return NextResponse.json({ error: '标题必填' }, { status: 400 })

  const max = (await db.select({ m: sql<number>`coalesce(max(sort),0)` }).from(schema.papers).get())?.m ?? 0
  const [row] = await db.insert(schema.papers).values({
    title: String(b.title).trim().slice(0, 400),
    authors: Array.isArray(b.authors) ? b.authors.filter(Boolean).slice(0, 40) : [],
    venue: b.venue || null,
    type: b.type || null,
    status: b.status || 'draft',
    level: b.level || null,
    doi: b.doi || null,
    url: b.url || null,
    pubDate: b.pubDate || null,
    abstract: b.abstract || null,
    sort: max + 1,
  }).returning()

  if (Array.isArray(b.attachments) && b.attachments.length) {
    await db.insert(schema.attachments).values(
      b.attachments.filter((a: any) => a?.fileId).map((a: any, i: number) => ({
        ownerType: 'paper' as const,
        ownerId: row.id,
        fileId: Number(a.fileId),
        caption: a.caption || null,
        sort: i,
      })),
    )
  }
  return NextResponse.json(row)
}
