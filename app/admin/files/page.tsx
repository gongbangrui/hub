import fs from 'node:fs'
import { desc, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { dirSize, UPLOAD_DIR } from '@/lib/storage'
import { FilesAdmin, type AdminFile } from '@/components/admin/files-admin'

export const dynamic = 'force-dynamic'

/** 磁盘余量；部分环境不支持 statfs，失败就不显示 */
function disk() {
  try {
    const s = fs.statfsSync(UPLOAD_DIR)
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize }
  } catch { return null }
}

export default async function AdminFilesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams

  const [rows, refs] = await Promise.all([
    db.select().from(schema.files).orderBy(desc(schema.files.createdAt), desc(schema.files.id)),
    db.select({ fileId: schema.attachments.fileId, n: sql<number>`count(*)` })
      .from(schema.attachments).groupBy(schema.attachments.fileId),
  ])
  const refMap = new Map(refs.map((r) => [r.fileId, Number(r.n)]))

  const files: AdminFile[] = rows.map((f) => ({
    id: f.id,
    token: f.token,
    name: f.originalName,
    mime: f.mime,
    size: f.size,
    owner: f.owner,
    shareCode: f.shareCode,
    locked: !!f.sharePassword,
    downloads: f.downloads,
    expiresAt: f.expiresAt ? f.expiresAt.getTime() : null,
    createdAt: f.createdAt.getTime(),
    refs: refMap.get(f.id) ?? 0,
  }))

  return (
    <FilesAdmin
      files={files}
      used={dirSize(UPLOAD_DIR)}
      disk={disk()}
      now={Date.now()}
      autoPick={sp.new === '1'}
    />
  )
}
