import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { newShareCode, isSafeUploadId, CHUNK_SIZE, MAX_FILE_SIZE } from '@/lib/upload'
import { chunkDirFor, uploadedChunkIndexes, safeName } from '@/lib/storage'
import { and, eq, isNull, or, gt } from 'drizzle-orm'
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
 * - 带 fingerprint：命中已存在文件 → 秒传，返回 fileId
 * - 带 uploadId：返回已收到的分片号，用于断点续传
 */
export async function POST(req: NextRequest) {
  const authed = await isAuthed()
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'BAD_JSON' }, { status: 400 }) }

  const { name, size, mime, totalChunks, fingerprint, uploadId: resumeId, sharePassword } = body ?? {}

  // ---- 续传：只回分片进度 ----
  if (resumeId) {
    if (!isSafeUploadId(resumeId)) return NextResponse.json({ error: 'BAD_UPLOAD_ID' }, { status: 400 })
    const total = Number(totalChunks)
    if (!Number.isInteger(total) || total < 1 || total > 20000) {
      return NextResponse.json({ error: 'BAD_CHUNKS' }, { status: 400 })
    }
    // totalChunks 必须回传：客户端要靠它算 remaining 与进度，
    // 漏了会让续传算出 NaN 进度、并以 BAD_CHUNKS 结束
    return NextResponse.json({
      uploadId: resumeId,
      totalChunks: total,
      chunkSize: CHUNK_SIZE,
      received: uploadedChunkIndexes(resumeId, total),
    })
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

  // ---- 秒传 ----
  // 带口令的上传不参与秒传：一是「明确要建一条独立的加锁分享」，
  // 二是防止 A 上传的文件被 B 用同一份内容 + 口令锁住，也免得把别人的加锁文件 token 发出去。
  if (!sharePassword && typeof fingerprint === 'string' && /^[a-f0-9]{16,64}$/.test(fingerprint)) {
    const hit = await db.select().from(schema.files)
      .where(and(
        eq(schema.files.sha256, fingerprint),
        eq(schema.files.size, fileSize),
        isNull(schema.files.sharePassword),
        // 访客秒传只匹配访客文件，免得拿到私密文件的 token
        authed ? undefined : eq(schema.files.owner, 'guest'),
        or(isNull(schema.files.expiresAt), gt(schema.files.expiresAt, new Date())),
      ))
      .get()

    if (hit) {
      let code = hit.shareCode
      if (!code) {
        code = await freshShareCode()
        await db.update(schema.files).set({ shareCode: code }).where(eq(schema.files.id, hit.id))
      }
      return NextResponse.json({ instant: true, fileId: hit.id, token: hit.token, shareCode: code })
    }
  }

  const uploadId = idGen()
  chunkDirFor(uploadId)

  return NextResponse.json({
    uploadId,
    chunkSize: CHUNK_SIZE,
    totalChunks: total,
    received: [],
    authed,
  })
}
