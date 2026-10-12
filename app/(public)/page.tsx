import { db, schema } from '@/db'
import { isAuthed, getSetting } from '@/lib/auth'
import { sql, desc, eq, and, isNull, notInArray } from 'drizzle-orm'
import { dirSize, UPLOAD_DIR } from '@/lib/storage'
import { Hero } from '@/components/public/hero'
import { ShellBento } from '@/components/public/shell-bento'

export const dynamic = 'force-dynamic'

async function count(table: any) {
  const r = await db.select({ n: sql<number>`count(*)` }).from(table).get()
  return r?.n ?? 0
}

/** 与 /files 一致：访客只看长期公开、未被竞赛/论文引用的文件 */
function guestVisible() {
  return and(
    isNull(schema.files.expiresAt),
    notInArray(schema.files.id, db.select({ id: schema.attachments.fileId }).from(schema.attachments)),
  )
}

export default async function Home() {
  const authed = await isAuthed()
  const [hero, title] = await Promise.all([getSetting('hero_line'), getSetting('site_title')])

  const [linkCount, openFiles, compCount, paperCount, recent, publicRecent] = await Promise.all([
    count(schema.links),
    db.select({ n: sql<number>`count(*)`, s: sql<number>`coalesce(sum(size),0)` }).from(schema.files)
      .where(authed ? undefined : guestVisible()).get(),
    authed ? count(schema.competitions) : Promise.resolve(0),
    authed ? count(schema.papers) : Promise.resolve(0),
    db.select().from(schema.files)
      .where(and(eq(schema.files.owner, 'admin'), authed ? undefined : guestVisible()))
      .orderBy(desc(schema.files.createdAt)).limit(4),
    db.select().from(schema.links).orderBy(desc(schema.links.clickCount)).limit(6),
  ])

  const total = dirSize(UPLOAD_DIR)

  return (
    <div className="space-y-10 md:space-y-14">
      <Hero line={hero ?? ''} title={title ?? 'Foliage'} />
      <ShellBento
        data={{
          authed,
          links: {
            count: linkCount,
            top: publicRecent.map((l) => ({ id: l.id, title: l.title, url: l.url })),
          },
          files: {
            count: openFiles?.n ?? 0,
            // 访客：加锁文件不露名
            recent: recent.map((f) => ({ id: f.id, name: !authed && f.sharePassword ? '••••••' : f.originalName, size: f.size })),
            used: total,
            quota: 10 * 1024 ** 3,
          },
          competitions: compCount,
          papers: paperCount,
        }}
      />
    </div>
  )
}
