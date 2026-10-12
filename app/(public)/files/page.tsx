import { db, schema } from '@/db'
import { desc, or, isNull, gt, and, eq } from 'drizzle-orm'
import { isAuthed } from '@/lib/auth'
import { PageTitle, Stat } from '@/components/ui/fx'
import { ArrowLeftRight, HardDrive, Timer } from 'lucide-react'
import { FileStation } from '@/components/public/file-station'
import { dirSize, UPLOAD_DIR } from '@/lib/storage'
import { sql, notInArray } from 'drizzle-orm'
import { toPublicFile } from '@/lib/file-access'

export const dynamic = 'force-dynamic'

export default async function FilesPage() {
  const authed = await isAuthed()

  const rows = await db.select().from(schema.files)
    .where(and(
      or(isNull(schema.files.expiresAt), gt(schema.files.expiresAt, new Date())),
      // 访客只看到长期公开文件：不含他人临时上传、不含竞赛/论文附件
      authed ? undefined : isNull(schema.files.expiresAt),
      authed ? undefined : notInArray(schema.files.id, db.select({ id: schema.attachments.fileId }).from(schema.attachments)),
    ))
    .orderBy(desc(schema.files.createdAt))
    .limit(200)

  const used = dirSize(UPLOAD_DIR)
  const tempCount = (await db.select({ n: sql<number>`count(*)` }).from(schema.files)
    .where(and(eq(schema.files.owner, 'guest'), gt(schema.files.expiresAt, new Date()))).get())?.n ?? 0

  return (
    <div className="space-y-8">
      <PageTitle
        icon={<ArrowLeftRight size={20} />}
        title="中转站"
        count={rows.length}
        right={<>
          <Stat icon={<HardDrive size={15} />} value={`${(used / 1024 ** 2).toFixed(1)} MB`} label="占用" />
          {authed && tempCount > 0 && <Stat icon={<Timer size={15} />} value={tempCount} label="临时" />}
        </>}
      />
      <FileStation
        files={rows.map((f) => {
          const p = toPublicFile(f)
          // 加锁文件对访客不暴露文件名（与 /s 分享页一致）
          return !authed && p.locked ? { ...p, originalName: '••••••' } : p
        })}
        authed={authed}
        tempCount={tempCount}
      />
    </div>
  )
}
