import { db, schema } from '@/db'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { isAuthed } from '@/lib/auth'
import { Trophy } from 'lucide-react'
import { PageTitle } from '@/components/ui/page'
import { CompetitionsView } from '@/components/public/competitions-view'
import { LockedNotice } from '@/components/public/locked-notice'

export const dynamic = 'force-dynamic'

export default async function CompetitionsPage() {
  const authed = await isAuthed()

  // 未登录：一条记录都不查，只拿总数用于提示
  if (!authed) {
    const total = (await db.select({ n: sql<number>`count(*)` }).from(schema.competitions).get())?.n ?? 0
    return (
      <div className="space-y-8">
        <PageTitle icon={<Trophy size={20} />} title="竞赛" count={total} />
        <LockedNotice what="竞赛记录" count={total} />
      </div>
    )
  }

  const [rows, cats, atts] = await Promise.all([
    db.select().from(schema.competitions).orderBy(desc(schema.competitions.dateStart), asc(schema.competitions.sort)),
    db.select().from(schema.categories).where(eq(schema.categories.kind, 'competition')),
    db.select().from(schema.attachments).where(eq(schema.attachments.ownerType, 'competition')),
  ])

  const fileIds = [...new Set(atts.map((a) => a.fileId))]
  const files = fileIds.length
    ? await db.select().from(schema.files).where(sql`${schema.files.id} in ${fileIds}`)
    : []

  const enriched = rows.map((c) => ({
    ...c,
    attachments: atts
      .filter((a) => a.ownerId === c.id)
      .sort((a, b) => a.sort - b.sort)
      .map((a) => ({ ...a, file: files.find((f) => f.id === a.fileId) ?? null }))
      .filter((a) => a.file),
  }))

  return (
    <div className="space-y-8">
      <CompetitionsView items={enriched} categories={cats} authed={authed} />
    </div>
  )
}
