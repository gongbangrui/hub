import { customAlphabet } from 'nanoid'
import { createHash } from 'node:crypto'
import fs from 'node:fs'

const CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
export const newToken = customAlphabet(CODE_ALPHABET, 12)
export const newShareCode = customAlphabet(CODE_ALPHABET, 7)
export const newDeleteKey = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 32)

export const CHUNK_SIZE = 4 * 1024 * 1024
export const GUEST_TTL_MS = 24 * 60 * 60 * 1000
export const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024 // 4GB

/** uploadId 只允许安全字符，防止路径穿越 */
export function isSafeUploadId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(id)
}

export function isSafeToken(t: unknown): t is string {
  return typeof t === 'string' && /^[23456789abcdefghjkmnpqrstuvwxyz]{12}$/.test(t)
}

/**
 * 采样指纹（服务端从磁盘重算）。
 *
 * **改动这里必须同步改 lib/upload-client.ts 的 fingerprint()** —— 两边算出的
 * 值必须逐字节一致，否则秒传永远不命中。
 *
 * 只取「大小 + 首块 + 中块 + 尾块」，最多读 12MB，4GB 文件也不慢；
 * 不再掺入 lastModified：服务端读不到客户端的那个值，掺了就无法复核。
 */
export function sampleFingerprint(absPath: string, size: number) {
  const h = createHash('sha256')
  h.update(String(size))

  const take = Math.min(CHUNK_SIZE, size)
  const offsets = [0]
  if (size > CHUNK_SIZE * 2) offsets.push(Math.floor(size / 2))
  if (size > CHUNK_SIZE) offsets.push(size - take)

  const fd = fs.openSync(absPath, 'r')
  try {
    const buf = Buffer.allocUnsafe(take)
    for (const off of offsets) {
      const n = fs.readSync(fd, buf, 0, take, off)
      h.update(buf.subarray(0, n))
    }
  } finally { fs.closeSync(fd) }

  return h.digest('hex')
}
