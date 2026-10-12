import { db, schema } from '@/db'
import { asc, sql, isNotNull } from 'drizzle-orm'
import { CategoriesAdmin, type CatRow } from '@/components/admin/categories-admin'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  const [cats, linkUse, compUse] = await Promise.all([
    db.select().from(schema.categories).orderBy(asc(schema.categories.sort), asc(schema.categories.id)),
    db.select({ id: schema.links.categoryId, n: sql<number>`count(*)` })
      .from(schema.links).where(isNotNull(schema.links.categoryId)).groupBy(schema.links.categoryId),
    db.select({ id: schema.competitions.categoryId, n: sql<number>`count(*)` })
      .from(schema.competitions).where(isNotNull(schema.competitions.categoryId)).groupBy(schema.competitions.categoryId),
  ])

  const used = new Map<number, number>()
  for (const r of [...linkUse, ...compUse]) if (r.id != null) used.set(r.id, (used.get(r.id) ?? 0) + Number(r.n))

  // papers 表没有 categoryId，论文分类不计数
  const rows: CatRow[] = cats.map((c) => ({
    id: c.id, name: c.name, slug: c.slug, kind: c.kind, color: c.color, sort: c.sort,
    count: c.kind === 'paper' ? null : used.get(c.id) ?? 0,
  }))

  return <CategoriesAdmin rows={rows} />
}
