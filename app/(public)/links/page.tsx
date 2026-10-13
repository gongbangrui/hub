import { db, schema } from '@/db'
import { asc, desc, eq } from 'drizzle-orm'
import { Bookmark } from 'lucide-react'
import { isAuthed } from '@/lib/auth'
import { PageTitle } from '@/components/ui/page'
import { LinksBrowser } from '@/components/public/links-browser'
import { LinkImporter } from '@/components/public/link-importer'

export const dynamic = 'force-dynamic'

export default async function LinksPage() {
  const authed = await isAuthed()

  const [rows, cats] = await Promise.all([
    db.select().from(schema.links).orderBy(desc(schema.links.pinned), asc(schema.links.sort), desc(schema.links.createdAt)),
    db.select().from(schema.categories).where(eq(schema.categories.kind, 'link')).orderBy(asc(schema.categories.sort), asc(schema.categories.name)),
  ])

  return (
    <div className="space-y-8">
      <PageTitle
        icon={<Bookmark size={20} />}
        title="收藏"
        count={rows.length}
        right={authed ? <LinkImporter /> : null}
      />
      <LinksBrowser links={rows} categories={cats} authed={authed} />
    </div>
  )
}
