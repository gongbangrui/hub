import { db, schema } from '@/db'
import { and, eq, inArray } from 'drizzle-orm'
import { removeStored, removeThumbs, invalidateDirSize } from '@/lib/storage'

type OwnerType = 'competition' | 'paper'
type Input = { fileId: number; caption?: string | null }[] | undefined

/**
 * 整体替换某个竞赛/论文的附件（事务内完成）。
 * 被摘下、且不再被任何地方引用的文件会连同磁盘文件一起删掉 ——
 * 否则它们是「长期、非附件」文件，会立刻出现在公开的中转站列表里（证书、证明材料外泄）。
 */
export function replaceAttachments(ownerType: OwnerType, ownerId: number, input: Input) {
  if (input === undefined) return
  const owner = and(eq(schema.attachments.ownerType, ownerType), eq(schema.attachments.ownerId, ownerId))

  const detached = db.transaction((tx) => {
    const before = tx.select({ fileId: schema.attachments.fileId }).from(schema.attachments).where(owner).all()
    const ids = [...new Set(input.map((a) => a.fileId))]
    const existing = ids.length
      ? new Set(tx.select({ id: schema.files.id }).from(schema.files).where(inArray(schema.files.id, ids)).all().map((r) => r.id))
      : new Set<number>()
    const keep = input.filter((a, i) => existing.has(a.fileId) && input.findIndex((b) => b.fileId === a.fileId) === i)

    tx.delete(schema.attachments).where(owner).run()
    if (keep.length) {
      tx.insert(schema.attachments).values(keep.map((a, i) => ({
        ownerType, ownerId, fileId: a.fileId, caption: a.caption ?? null, sort: i,
      }))).run()
    }
    // 表单里先上传的附件是「待定」文件（带短期过期，见 upload/complete）；保存后转为长期
    if (keep.length) {
      tx.update(schema.files).set({ expiresAt: null })
        .where(inArray(schema.files.id, keep.map((a) => a.fileId))).run()
    }
    const kept = new Set(keep.map((a) => a.fileId))
    return before.map((r) => r.fileId).filter((id) => !kept.has(id))
  })

  dropOrphanFiles(detached)
}

/** 删除竞赛/论文时调用：清掉它的全部附件 */
export function clearAttachments(ownerType: OwnerType, ownerId: number) {
  replaceAttachments(ownerType, ownerId, [])
}

function dropOrphanFiles(ids: number[]) {
  if (!ids.length) return
  const rows = db.transaction((tx) => {
    const stillUsed = new Set(
      tx.select({ id: schema.attachments.fileId }).from(schema.attachments)
        .where(inArray(schema.attachments.fileId, ids)).all().map((r) => r.id),
    )
    const free = ids.filter((id) => !stillUsed.has(id))
    if (!free.length) return []
    const gone = tx.select().from(schema.files).where(inArray(schema.files.id, free)).all()
    // 只处理管理员上传的附件文件
    const mine = gone.filter((f) => f.owner === 'admin')
    if (mine.length) tx.delete(schema.files).where(inArray(schema.files.id, mine.map((f) => f.id))).run()
    return mine
  })
  for (const f of rows) { removeStored(f.storedPath); removeThumbs(f.id) }
  if (rows.length) invalidateDirSize()
}
