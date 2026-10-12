import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { isSafeUploadId, newToken, newDeleteKey, newShareCode, sampleFingerprint, GUEST_TTL_MS } from '@/lib/upload'
import { mergeChunks, safeName, monthDir, UPLOAD_DIR, invalidateDirSize } from '@/lib/storage'
import { hashSharePassword } from '@/lib/file-access'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const authed = await isAuthed()
  const body = await req.json().catch(() => null)
  const { uploadId, name, size, mime, totalChunks, fingerprint, sharePassword } = body ?? {}

  if (!isSafeUploadId(uploadId)) return NextResponse.json({ error: 'BAD_UPLOAD_ID' }, { status: 400 })
  const total = Number(totalChunks)
  if (!Number.isInteger(total) || total < 1 || total > 20000) {
    return NextResponse.json({ error: 'BAD_CHUNKS' }, { status: 400 })
  }

  const fileName = safeName(String(name ?? 'file'))
  const destDir = monthDir()
  const destPath = path.join(destDir, `${uploadId}-${fileName}`)

  try {
    mergeChunks(uploadId, total, destPath)
  } catch (e) {
    return NextResponse.json({ error: 'MERGE_FAILED', detail: String(e) }, { status: 400 })
  }

  const stat = fs.statSync(destPath)
  const expected = Number(size)
  if (Number.isFinite(expected) && expected > 0 && stat.size !== expected) {
    fs.rmSync(destPath, { force: true })
    return NextResponse.json({ error: 'SIZE_MISMATCH', got: stat.size, want: expected }, { status: 400 })
  }

  // 指纹一律由服务端从落盘的文件重算：客户端传来的值不能当哈希入库，
  // 否则它能凭空指定 sha256，污染秒传索引（让别的上传命中一个内容不符的文件）。
  // 客户端传来的 fingerprint 只当参考，不一致说明传输损坏，但采样算法本就允许
  // 「首/中/尾相同而中段不同」的文件互相命中，所以不比对、只重算。
  const sha = sampleFingerprint(destPath, stat.size)

  const rel = path.relative(UPLOAD_DIR, destPath)
  const shareCode = newShareCode()

  const [row] = await db.insert(schema.files).values({
    token: newToken(),
    originalName: fileName,
    storedPath: rel,
    mime: String(mime ?? 'application/octet-stream').slice(0, 120),
    size: stat.size,
    sha256: sha,
    owner: authed ? 'admin' : 'guest',
    shareCode,
    sharePassword: hashSharePassword(sharePassword),
    // 未登录上传的文件只保留 24 小时
    expiresAt: authed ? null : new Date(Date.now() + GUEST_TTL_MS),
    ...(authed ? {} : { deleteKey: newDeleteKey() }),
  }).returning()

  invalidateDirSize()

  return NextResponse.json({
    fileId: row.id,
    token: row.token,
    shareCode: row.shareCode,
    size: row.size,
    expiresAt: row.expiresAt,
    deleteKey: row.deleteKey,
  })
}
