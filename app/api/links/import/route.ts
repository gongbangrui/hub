import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { parseBookmarksHtml } from '@/lib/links'
import { eq, sql } from 'drizzle-orm'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { html, createFolders } = await req.json()
  if (typeof html !== 'string' || html.length > 8_000_000) {
    return NextResponse.json({ error: 'BAD_INPUT' }, { status: 400 })
  }

  const parsed = parseBookmarksHtml(html)
  if (!parsed.length) return NextResponse.json({ imported: 0, skipped: 0, folders: 0 })

  const existing = new Set((await db.select({ url: schema.links.url }).from(schema.links)).map((r) => r.url))

  let folderCount = 0
  const folderId = new Map<string, number>()
  if (createFolders) {
    const names = [...new Set(parsed.map((p) => p.folder).filter(Boolean) as string[])]
    const maxSort = (await db.select({ m: sql<number>`coalesce(max(sort),0)` }).from(schema.categories).get())?.m ?? 0
    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      const slug = name.toLowerCase().replace(/[^a-z0-9一-龥]+/g, '-').slice(0, 60) || `folder-${i}`
      const found = await db.select().from(schema.categories).where(eq(schema.categories.slug, slug)).get()
      if (found) { folderId.set(name, found.id); continue }
      const [row] = await db.insert(schema.categories)
        .values({ name, slug, kind: 'link', sort: maxSort + i + 1 })
        .returning()
      folderId.set(name, row.id)
      folderCount++
    }
  }

  let imported = 0
  let skipped = 0
  const maxSort = (await db.select({ m: sql<number>`coalesce(max(sort),0)` }).from(schema.links).get())?.m ?? 0

  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i]
    if (existing.has(p.url)) { skipped++; continue }
    existing.add(p.url)
    await db.insert(schema.links).values({
      title: p.title.slice(0, 200),
      url: p.url.slice(0, 2000),
      categoryId: p.folder ? folderId.get(p.folder) ?? null : null,
      tags: [],
      sort: maxSort + i + 1,
    })
    imported++
  }

  return NextResponse.json({ imported, skipped, folders: folderCount })
}
