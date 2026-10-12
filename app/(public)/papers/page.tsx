import { db, schema } from '@/db'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { BookOpen } from 'lucide-react'
import { isAuthed } from '@/lib/auth'
import { PageTitle } from '@/components/ui/fx'
import { PapersView } from '@/components/public/papers-view'
import { LockedNotice } from '@/components/public/locked-notice'

export const dynamic = 'force-dynamic'

export default async function PapersPage() {
  const authed = await isAuthed()

  if (!authed) {
    const total = (await db.select({ n: sql<number>`count(*)` }).from(schema.papers).get())?.n ?? 0
    return (
      <div className="space-y-8">
        <PageTitle icon={<BookOpen size={19} />} title="论文" count={total || undefined} />
        <LockedNotice what="论文" count={total} />
      </div>
    )
  }

  const [rows, atts] = await Promise.all([
    db.select().from(schema.papers).orderBy(desc(schema.papers.pubDate), asc(schema.papers.sort)),
    db.select().from(schema.attachments).where(eq(schema.attachments.ownerType, 'paper')),
  ])

  const fileIds = [...new Set(atts.map((a) => a.fileId))]
  const files = fileIds.length
    ? await db.select().from(schema.files).where(sql`${schema.files.id} in ${fileIds}`)
    : []

  const enriched = rows.map((p) => ({
    ...p,
    attachments: atts
      .filter((a) => a.ownerId === p.id)
      .sort((a, b) => a.sort - b.sort)
      .map((a) => ({ ...a, file: files.find((f) => f.id === a.fileId) ?? null }))
      .filter((a) => a.file),
  }))

  return <PapersView items={enriched} authed={authed} />
}
