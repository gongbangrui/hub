import { db, schema } from '@/db'
import { asc, desc, eq } from 'drizzle-orm'
import { LinksAdmin } from '@/components/admin/links-admin'

export const dynamic = 'force-dynamic'

export default async function AdminLinksPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams

  const [rows, cats] = await Promise.all([
    db.select().from(schema.links).orderBy(desc(schema.links.pinned), asc(schema.links.sort), desc(schema.links.createdAt)),
    db.select().from(schema.categories).where(eq(schema.categories.kind, 'link')).orderBy(asc(schema.categories.sort), asc(schema.categories.name)),
  ])

  return <LinksAdmin links={rows} categories={cats} autoNew={sp.new === '1'} />
}
