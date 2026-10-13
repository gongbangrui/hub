import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed, clientIp } from '@/lib/auth'
import { ensureVisitorId } from '@/lib/file-access'
import { rateLimit } from '@/lib/rate'
import {
  newShareCode, isSafeUploadId, CHUNK_SIZE, MAX_CHUNKS, MAX_FILE_SIZE, GUEST_VISITOR_QUOTA, GUEST_TOTAL_QUOTA,
} from '@/lib/upload'
import {
  chunkDirFor, chunkDirExists, uploadedChunkIndexes, safeName, dirSize, UPLOAD_DIR, CHUNK_DIR,
  markChunkOwner, pendingBytesOf,
} from '@/lib/storage'
import { and, eq, isNull, gt, sql } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'

export const runtime = 'nodejs'
export const maxDuration = 60

const idGen = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 24)

/** 生成不会撞车的分享短码 */
async function freshShareCode() {
  let code = newShareCode()
  for (let i = 0; i < 6; i++) {
    const dup = await db.select({ id: schema.files.id }).from(schema.files)
      .where(eq(schema.files.shareCode, code)).get()
    if (!dup) return code
    code = newShareCode()
  }
  return code
}

/**
 * 开始上传。
 * - 带 fingerprint：命中「自己的」已存在文件 → 秒传，返回 fileId
 * - 带 uploadId 且分片目录还在：返回已收到的分片号，用于断点续传
 */
export async function POST(req: NextRequest) {
  const authed = await isAuthed()
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'BAD_JSON' }, { status: 400 }) }

  const { name, size, mime, totalChunks, fingerprint, uploadId: resumeId, sharePassword } = body ?? {}

  // 访客身份在这里签发：之后的 complete / 文件列表都靠它认出「我的文件」
  const vid = authed ? null : await ensureVisitorId()

  // ---- 续传：分片目录还在才续，否则当作新上传（由服务端发新的 uploadId） ----
  if (resumeId) {
    if (!isSafeUploadId(resumeId)) return NextResponse.json({ error: 'BAD_UPLOAD_ID' }, { status: 400 })
    const total = Number(totalChunks)
    if (!Number.isInteger(total) || total < 1 || total > MAX_CHUNKS) {
      return NextResponse.json({ error: 'BAD_CHUNKS' }, { status: 400 })
    }
    if (chunkDirExists(resumeId)) {
      // totalChunks 必须回传：客户端要靠它算 remaining 与进度，
      // 漏了会让续传算出 NaN 进度、并以 BAD_CHUNKS 结束
      return NextResponse.json({
        uploadId: resumeId,
        totalChunks: total,
        chunkSize: CHUNK_SIZE,
        received: uploadedChunkIndexes(resumeId, total),
      })
    }
  }

  // ---- 新上传 ----
  const fileName = safeName(String(name ?? '').trim())
  const fileSize = Number(size)
  if (!fileName) return NextResponse.json({ error: '文件名不对' }, { status: 400 })
  if (!Number.isFinite(fileSize) || fileSize <= 0) return NextResponse.json({ error: '文件大小不对' }, { status: 400 })
  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json({ error: '超过 4GB', max: MAX_FILE_SIZE }, { status: 413 })
  }

  const total = Number.isInteger(Number(totalChunks)) ? Number(totalChunks) : Math.ceil(fileSize / CHUNK_SIZE)
  if (total < 1 || total > 20000) return NextResponse.json({ error: 'BAD_CHUNKS' }, { status: 400 })

  if (!authed) {
    const rl = rateLimit(`upload-init:${clientIp(req.headers)}`, 60, 10 * 60 * 1000)
    if (!rl.ok) {
      return NextResponse.json({ error: '上传太频繁，请稍后再试' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })
    }
  }

  // ---- 秒传 ----
  // 带口令的上传不参与秒传：「明确要建一条独立的加锁分享」。
  // 命中范围只限上传者自己的文件：
  //  - 访客只能命中自己的、未过期的文件（别人的文件不会借秒传把 token / 删除权限泄露出来）
  //  - 管理员只能命中长期有效的管理员文件（不会把访客的 24h 临时文件挂到竞赛/论文附件上）
  if (!sharePassword && typeof fingerprint === 'string' && /^[a-f0-9]{16,64}$/.test(fingerprint)) {
    const mineCond = authed
      ? and(eq(schema.files.owner, 'admin'), isNull(schema.files.expiresAt))
      : and(eq(schema.files.owner, 'guest'), eq(schema.files.uploaderId, vid!), gt(schema.files.expiresAt, new Date()))

    const hit = await db.select().from(schema.files)
      .where(and(
        eq(schema.files.sha256, fingerprint),
        eq(schema.files.size, fileSize),
        isNull(schema.files.sharePassword),
        mineCond,
      ))
      .get()

    if (hit) {
      let code = hit.shareCode
      if (!code) {
        code = await freshShareCode()
        await db.update(schema.files).set({ shareCode: code }).where(eq(schema.files.id, hit.id))
      }
      return NextResponse.json({
        instant: true, fileId: hit.id, token: hit.token, shareCode: code,
        expiresAt: hit.expiresAt, size: hit.size,
      })
    }
  }

  // ---- 访客配额：防止匿名用户把磁盘写满 ----
  // 未完成上传的分片也要算进去：分片在 complete 之前不进 files 表，
  // 不统计的话反复 init + chunk（不 complete）就能绕过配额把磁盘写满。
  if (!authed) {
    const used = (await db.select({ n: sql<number>`coalesce(sum(${schema.files.size}), 0)` }).from(schema.files)
      .where(and(eq(schema.files.uploaderId, vid!), gt(schema.files.expiresAt, new Date()))).get())?.n ?? 0
    const pending = pendingBytesOf(vid!)
    if (used + pending + fileSize > GUEST_VISITOR_QUOTA()) {
      return NextResponse.json({ error: '临时空间已满，请先删除一些文件，或等待 24 小时后自动清理' }, { status: 413 })
    }
    if (dirSize(UPLOAD_DIR) + dirSize(CHUNK_DIR) + fileSize > GUEST_TOTAL_QUOTA()) {
      return NextResponse.json({ error: '站点存储空间不足' }, { status: 507 })
    }
  }

  const uploadId = idGen()
  chunkDirFor(uploadId)
  if (vid) markChunkOwner(uploadId, vid)

  return NextResponse.json({
    uploadId,
    chunkSize: CHUNK_SIZE,
    totalChunks: total,
    received: [],
    authed,
  })
}
