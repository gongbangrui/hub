import { db, schema } from '@/db'
import { asc, desc, eq } from 'drizzle-orm'
import { PapersAdmin } from '@/components/admin/papers-admin'
import type { PaperItem } from '@/components/public/papers-view'

export const dynamic = 'force-dynamic'

export default async function AdminPapersPage({ searchParams }: {
  searchParams: Promise<{ new?: string }>
}) {
  const sp = await searchParams

  const [rows, atts] = await Promise.all([
    db.select().from(schema.papers).orderBy(desc(schema.papers.pubDate), asc(schema.papers.sort)),
    // 附件直接 join 文件，丢掉文件已被删的悬挂记录
    db.select({ att: schema.attachments, file: schema.files })
      .from(schema.attachments)
      .innerJoin(schema.files, eq(schema.files.id, schema.attachments.fileId))
      .where(eq(schema.attachments.ownerType, 'paper'))
      .orderBy(asc(schema.attachments.sort)),
  ])

  const byOwner = new Map<number, PaperItem['attachments']>()
  for (const { att, file } of atts) {
    const list = byOwner.get(att.ownerId) ?? []
    list.push({ ...att, file })
    byOwner.set(att.ownerId, list)
  }

  const items: PaperItem[] = rows.map((p) => ({ ...p, attachments: byOwner.get(p.id) ?? [] }))

  return <PapersAdmin items={items} startNew={sp.new === '1'} />
}
