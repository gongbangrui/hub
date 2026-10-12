import { NextResponse, type NextRequest } from 'next/server'
import { isSafeUploadId } from '@/lib/upload'
import { chunkDirFor } from '@/lib/storage'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * 接收单个分片。用 multipart 而不是裸二进制 ——
 * 浏览器与 nginx 对 multipart 的边界处理最稳，且能带上 uploadId/index 元数据。
 */
export async function POST(req: NextRequest) {
  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'BAD_FORM' }, { status: 400 }) }

  const uploadId = form.get('uploadId')
  const index = Number(form.get('index'))
  const chunk = form.get('chunk')

  if (!isSafeUploadId(uploadId)) return NextResponse.json({ error: 'BAD_UPLOAD_ID' }, { status: 400 })
  if (!Number.isInteger(index) || index < 0 || index > 20000) {
    return NextResponse.json({ error: 'BAD_INDEX' }, { status: 400 })
  }
  if (!(chunk instanceof Blob)) return NextResponse.json({ error: 'NO_CHUNK' }, { status: 400 })
  if (chunk.size === 0) return NextResponse.json({ error: 'EMPTY_CHUNK' }, { status: 400 })

  const dir = chunkDirFor(uploadId)
  const target = path.join(dir, `${index}.part`)

  // 原子写：先写 .tmp 再 rename，避免半截分片被当成完整分片
  const tmp = `${target}.tmp`
  fs.writeFileSync(tmp, Buffer.from(await chunk.arrayBuffer()))
  fs.renameSync(tmp, target)

  return NextResponse.json({ ok: true, index, size: chunk.size })
}
