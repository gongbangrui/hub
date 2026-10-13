import { db, schema } from '@/db'
import { desc, or, isNull, gt, and, eq, sql, notInArray } from 'drizzle-orm'
import { isAuthed } from '@/lib/auth'
import { PageTitle, Stat } from '@/components/ui/page'
import { ArrowLeftRight, HardDrive, Timer } from 'lucide-react'
import { FileStation } from '@/components/public/file-station'
import { dirSize, UPLOAD_DIR } from '@/lib/storage'
import { toPublicFile, readVisitorId } from '@/lib/file-access'

export const dynamic = 'force-dynamic'

export default async function FilesPage() {
  const authed = await isAuthed()
  const vid = authed ? null : await readVisitorId()
  const now = new Date()

  // 访客可见 = 长期公开文件（非竞赛/论文附件）+ 自己上传的临时文件。
  // 他人的临时文件不会出现；自己的靠签名 Cookie 认出，与是否过期无关地排在前面。
  const publicCond = and(
    isNull(schema.files.expiresAt),
    notInArray(schema.files.id, db.select({ id: schema.attachments.fileId }).from(schema.attachments)),
  )
  const visible = authed
    ? undefined
    : vid
      ? or(publicCond, and(eq(schema.files.uploaderId, vid), gt(schema.files.expiresAt, now)))
      : publicCond

  const rows = await db.select().from(schema.files)
    .where(and(or(isNull(schema.files.expiresAt), gt(schema.files.expiresAt, now)), visible))
    .orderBy(desc(schema.files.createdAt))
    .limit(200)

  const used = dirSize(UPLOAD_DIR)
  const tempCount = authed
    ? (await db.select({ n: sql<number>`count(*)` }).from(schema.files)
        .where(and(eq(schema.files.owner, 'guest'), gt(schema.files.expiresAt, now))).get())?.n ?? 0
    : 0

  const viewer = { admin: authed, vid }
  const list = rows.map((f) => {
    const p = toPublicFile(f, viewer)
    // 加锁文件对访客不暴露文件名（与 /s 分享页一致），自己的除外
    return !authed && p.locked && !p.mine ? { ...p, originalName: '••••••' } : p
  })
  // 自己的文件置顶
  list.sort((a, b) => Number(b.mine) - Number(a.mine))

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
      <FileStation files={list} authed={authed} tempCount={tempCount} />
    </div>
  )
}
