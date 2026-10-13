import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { parseBookmarksHtml } from '@/lib/links'
import { parseBody } from '@/lib/validate'
import { and, eq, sql } from 'drizzle-orm'

export const runtime = 'nodejs'

const body = z.object({
  html: z.string().max(8_000_000, '文件过大'),
  createFolders: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const r = await parseBody(req, body)
  if ('res' in r) return r.res
  const { html, createFolders } = r.data

  const parsed = parseBookmarksHtml(html)
  if (!parsed.length) return NextResponse.json({ imported: 0, skipped: 0, folders: 0 })

  // 整个导入放进一个事务：逐条自动提交每条都要一次 fsync，几千条会卡几十秒
  const result = db.transaction((tx) => {
    const existing = new Set(tx.select({ url: schema.links.url }).from(schema.links).all().map((x) => x.url))

    let folders = 0
    const folderId = new Map<string, number>()
    if (createFolders) {
      const names = [...new Set(parsed.map((p) => p.folder).filter(Boolean) as string[])]
      const maxSort = tx.select({ m: sql<number>`coalesce(max(sort),0)` }).from(schema.categories).get()?.m ?? 0
      names.forEach((name, i) => {
        const base = name.toLowerCase().replace(/[^a-z0-9一-龥]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || `folder-${i}`
        // 只复用「链接」分类：同 slug 的竞赛/论文分类不能被拿来挂链接
        const sameKind = tx.select().from(schema.categories)
          .where(and(eq(schema.categories.slug, base), eq(schema.categories.kind, 'link'))).get()
        if (sameKind) { folderId.set(name, sameKind.id); return }
        const taken = tx.select({ id: schema.categories.id }).from(schema.categories)
          .where(eq(schema.categories.slug, base)).get()
        const slug = taken ? `${base}-link` : base
        const row = tx.insert(schema.categories)
          .values({ name: name.slice(0, 80), slug, kind: 'link', sort: maxSort + i + 1 })
          .onConflictDoNothing().returning().get()
        const id = row?.id ?? tx.select().from(schema.categories).where(eq(schema.categories.slug, slug)).get()?.id
        if (id) { folderId.set(name, id); if (row) folders++ }
      })
    }

    let imported = 0
    let skipped = 0
    const maxSort = tx.select({ m: sql<number>`coalesce(max(sort),0)` }).from(schema.links).get()?.m ?? 0
    parsed.forEach((p, i) => {
      if (existing.has(p.url)) { skipped++; return }
      existing.add(p.url)
      tx.insert(schema.links).values({
        title: p.title.slice(0, 200),
        url: p.url.slice(0, 2000),
        categoryId: p.folder ? folderId.get(p.folder) ?? null : null,
        tags: [],
        sort: maxSort + i + 1,
      }).run()
      imported++
    })
    return { imported, skipped, folders }
  })

  return NextResponse.json(result)
}
