import { NextResponse, type NextRequest } from 'next/server'
import { isSafeUploadId, CHUNK_SIZE, MAX_CHUNKS } from '@/lib/upload'
import { CHUNK_DIR, invalidateDirSize } from '@/lib/storage'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * 接收单个分片。用 multipart 而不是裸二进制 ——
 * 浏览器与 nginx 对 multipart 的边界处理最稳，且能带上 uploadId/index 元数据。
 */
export async function POST(req: NextRequest) {
  // 先看声明的体积，免得 formData() 把一个超大请求整个读进内存（留 1MB 给 multipart 边界）
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > CHUNK_SIZE + 1024 * 1024) {
    return NextResponse.json({ error: 'CHUNK_TOO_LARGE' }, { status: 413 })
  }

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'BAD_FORM' }, { status: 400 }) }

  const uploadId = form.get('uploadId')
  const index = Number(form.get('index'))
  const chunk = form.get('chunk')

  if (!isSafeUploadId(uploadId)) return NextResponse.json({ error: 'BAD_UPLOAD_ID' }, { status: 400 })
  if (!Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) {
    return NextResponse.json({ error: 'BAD_INDEX' }, { status: 400 })
  }
  if (!(chunk instanceof Blob)) return NextResponse.json({ error: 'NO_CHUNK' }, { status: 400 })
  if (chunk.size === 0) return NextResponse.json({ error: 'EMPTY_CHUNK' }, { status: 400 })
  if (chunk.size > CHUNK_SIZE) return NextResponse.json({ error: 'CHUNK_TOO_LARGE' }, { status: 413 })

  // 目录只由 /api/upload/init 创建：没经过 init 的 uploadId 一律拒绝，防止匿名凭空建目录
  const dir = path.join(CHUNK_DIR, uploadId)
  if (!fs.existsSync(dir)) return NextResponse.json({ error: 'UNKNOWN_UPLOAD' }, { status: 404 })
  const target = path.join(dir, `${index}.part`)

  // 原子写：先写 .tmp 再 rename，避免半截分片被当成完整分片
  const tmp = `${target}.tmp`
  try {
    fs.writeFileSync(tmp, Buffer.from(await chunk.arrayBuffer()))
    fs.renameSync(tmp, target)
  } catch {
    fs.rmSync(tmp, { force: true })
    return NextResponse.json({ error: 'WRITE_FAILED' }, { status: 500 })
  }

  // 分片也会占磁盘，配额依据的目录大小缓存必须跟着失效，
  // 否则连续上传期间 dirSize 一直返回缓存值，总量上限形同虚设
  invalidateDirSize()
  return NextResponse.json({ ok: true, index, size: chunk.size })
}

