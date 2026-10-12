import { db, schema } from '@/db'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { CompetitionsAdmin } from '@/components/admin/competitions-admin'

export const dynamic = 'force-dynamic'

export default async function AdminCompetitionsPage({ searchParams }: {
  searchParams: Promise<{ new?: string }>
}) {
  const sp = await searchParams

  const [rows, cats, atts] = await Promise.all([
    db.select().from(schema.competitions).orderBy(desc(schema.competitions.dateStart), asc(schema.competitions.sort)),
    db.select().from(schema.categories).where(eq(schema.categories.kind, 'competition')).orderBy(asc(schema.categories.sort)),
    db.select().from(schema.attachments).where(eq(schema.attachments.ownerType, 'competition')),
  ])

  const fileIds = [...new Set(atts.map((a) => a.fileId))]
  const files = fileIds.length
    ? await db.select().from(schema.files).where(sql`${schema.files.id} in ${fileIds}`)
    : []

  const items = rows.map((c) => ({
    ...c,
    attachments: atts
      .filter((a) => a.ownerId === c.id)
      .sort((a, b) => a.sort - b.sort)
      .map((a) => ({ ...a, file: files.find((f) => f.id === a.fileId) ?? null }))
      .filter((a) => a.file),
  }))

  return <CompetitionsAdmin items={items} categories={cats} startNew={sp.new === '1'} />
}
