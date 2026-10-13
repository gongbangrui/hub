import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { sql } from 'drizzle-orm'
import { isAuthed } from '@/lib/auth'
import { isSafeUploadId, newToken, newShareCode, sampleFingerprint, GUEST_TTL_MS, MAX_FILE_SIZE } from '@/lib/upload'
import { mergeChunks, removeChunks, safeName, monthDir, UPLOAD_DIR, invalidateDirSize } from '@/lib/storage'
import { hashSharePassword, ensureVisitorId } from '@/lib/file-access'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const maxDuration = 300

const PENDING_TTL_MS = 3 * 24 * 60 * 60 * 1000

/** 正在合并的 uploadId：同一个上传并发调两次 complete 只放行第一次 */
const merging = new Set<string>()

export async function POST(req: NextRequest) {
  const authed = await isAuthed()
  const body = await req.json().catch(() => null)
  const { uploadId, name, size, mime, totalChunks, sharePassword, purpose } = body ?? {}

  if (!isSafeUploadId(uploadId)) return NextResponse.json({ error: 'BAD_UPLOAD_ID' }, { status: 400 })
  const total = Number(totalChunks)
  if (!Number.isInteger(total) || total < 1 || total > 20000) {
    return NextResponse.json({ error: 'BAD_CHUNKS' }, { status: 400 })
  }
  const expected = Number(size)
  if (!Number.isFinite(expected) || expected <= 0 || expected > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'BAD_SIZE' }, { status: 400 })
  }

  const vid = authed ? null : await ensureVisitorId()
  const fileName = safeName(String(name ?? 'file'))

  // 幂等：响应丢了客户端会重发 complete，此时分片已被清掉，直接把已入库的那条返回去
  const prev = await db.select().from(schema.files)
    .where(sql`instr(${schema.files.storedPath}, ${`${uploadId}-`}) > 0`).get()
  if (prev) {
    // 只把结果还给上传者本人，别人拿到 uploadId 也读不到
    return authed || prev.uploaderId === vid
      ? NextResponse.json(done(prev))
      : NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  if (merging.has(uploadId)) return NextResponse.json({ error: 'BUSY' }, { status: 409 })
  merging.add(uploadId)

  const destPath = path.join(monthDir(), `${uploadId}-${fileName}`)
  try {
    try {
      mergeChunks(uploadId, total, destPath)
    } catch {
      return NextResponse.json({ error: 'MERGE_FAILED' }, { status: 400 })
    }

    const stat = fs.statSync(destPath)
    if (stat.size !== expected || stat.size > MAX_FILE_SIZE) {
      fs.rmSync(destPath, { force: true })
      removeChunks(uploadId)
      return NextResponse.json({ error: 'SIZE_MISMATCH' }, { status: 400 })
    }

    // 指纹一律由服务端从落盘的文件重算：客户端传来的值不能当哈希入库，
    // 否则它能凭空指定 sha256，污染秒传索引。
    const sha = sampleFingerprint(destPath, stat.size)
    const dims = await imageSize(destPath, String(mime ?? ''), stat.size)
    const rel = path.relative(UPLOAD_DIR, destPath)

    let row: typeof schema.files.$inferSelect
    try {
      ;[row] = await db.insert(schema.files).values({
        token: newToken(),
        originalName: fileName,
        storedPath: rel,
        mime: String(mime ?? 'application/octet-stream').slice(0, 120),
        size: stat.size,
        sha256: sha,
        owner: authed ? 'admin' : 'guest',
        uploaderId: vid,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        shareCode: newShareCode(),
        sharePassword: hashSharePassword(sharePassword),
        // 未登录上传的文件只保留 24 小时；管理员给竞赛/论文表单传的附件先按「待定」留 3 天，
        // 保存表单（replaceAttachments）后才转为长期 —— 取消表单不会留下公开可见的孤儿文件
        expiresAt: authed
          ? (purpose === 'attachment' ? new Date(Date.now() + PENDING_TTL_MS) : null)
          : new Date(Date.now() + GUEST_TTL_MS),
      }).returning()
    } catch {
      fs.rmSync(destPath, { force: true })
      return NextResponse.json({ error: 'SAVE_FAILED' }, { status: 500 })
    }

    removeChunks(uploadId)
    invalidateDirSize()
    return NextResponse.json(done(row))
  } finally {
    merging.delete(uploadId)
  }
}

/** 读图片像素尺寸（只解析文件头，很快）；失败就当没有，不影响上传 */
async function imageSize(file: string, mime: string, size: number) {
  if (!/^image\/(png|jpe?g|webp|gif|avif|tiff?)$/i.test(mime) || size > 80 * 1024 * 1024) return null
  try {
    const sharp = (await import('sharp')).default
    const m = await sharp(file, { failOn: 'none' }).metadata()
    // EXIF 方向 5-8 时宽高要对调
    const swap = (m.orientation ?? 1) >= 5
    return m.width && m.height ? { width: swap ? m.height : m.width, height: swap ? m.width : m.height } : null
  } catch { return null }
}

function done(row: typeof schema.files.$inferSelect) {
  return {
    fileId: row.id,
    token: row.token,
    shareCode: row.shareCode,
    size: row.size,
    expiresAt: row.expiresAt,
  }
}
