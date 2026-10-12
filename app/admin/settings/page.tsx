import fs from 'node:fs'
import path from 'node:path'
import { db, schema, DATA_ROOT } from '@/db'
import { and, isNotNull, lt, sql } from 'drizzle-orm'
import { getSetting } from '@/lib/auth'
import { UPLOAD_DIR, CHUNK_DIR, dirSize } from '@/lib/storage'
import { SettingsForm } from '@/components/admin/settings-form'

export const dynamic = 'force-dynamic'

const fileSize = (p: string) => { try { return fs.statSync(p).size } catch { return 0 } }

export default async function SettingsPage() {
  const [site_title, site_subtitle, hero_line, footer_note, expired, total] = await Promise.all([
    getSetting('site_title'), getSetting('site_subtitle'), getSetting('hero_line'), getSetting('footer_note'),
    db.select({ n: sql<number>`count(*)` }).from(schema.files)
      .where(and(isNotNull(schema.files.expiresAt), lt(schema.files.expiresAt, new Date()))).get(),
    db.select({ n: sql<number>`count(*)` }).from(schema.files).get(),
  ])

  // WAL 模式下数据分散在三个文件里
  const dbFile = path.join(DATA_ROOT, 'app.db')
  const dbBytes = fileSize(dbFile) + fileSize(`${dbFile}-wal`) + fileSize(`${dbFile}-shm`)

  return (
    <SettingsForm
      copy={{
        site_title: site_title ?? '',
        site_subtitle: site_subtitle ?? '',
        hero_line: hero_line ?? '',
        footer_note: footer_note ?? '',
      }}
      storage={{
        root: DATA_ROOT,
        db: dbBytes,
        uploads: dirSize(UPLOAD_DIR),
        chunks: dirSize(CHUNK_DIR),
        files: Number(total?.n ?? 0),
        expired: Number(expired?.n ?? 0),
      }}
    />
  )
}
