/**
 * 对照测试：客户端 lib/upload-client.ts 的 fingerprint() 与服务端
 * lib/upload.ts 的 sampleFingerprint() 必须算出同一个值。
 * 临时脚本，验证后删除。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sampleFingerprint, CHUNK_SIZE } from './lib/upload'

/** 照抄 lib/upload-client.ts 的 fingerprint()，只是把 File 换成 Blob+size */
async function clientFingerprint(blob: Blob, size: number): Promise<string> {
  const parts: BlobPart[] = [String(size)]
  const take = Math.min(CHUNK_SIZE, size)
  parts.push(blob.slice(0, take))
  if (size > CHUNK_SIZE * 2) {
    const mid = Math.floor(size / 2)
    parts.push(blob.slice(mid, mid + take))
  }
  if (size > CHUNK_SIZE) parts.push(blob.slice(size - take))

  const buf = new Blob(parts)
  const digest = await crypto.subtle.digest('SHA-256', await buf.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-'))
const sizes = [1, 4096, CHUNK_SIZE, CHUNK_SIZE + 1, CHUNK_SIZE * 2, CHUNK_SIZE * 2 + 7, CHUNK_SIZE * 3 + 12345]

async function main() {
  let bad = 0
  for (const size of sizes) {
    // 可复现的伪随机内容，避免全零文件掩盖偏移错误
    const buf = Buffer.alloc(size)
    for (let i = 0; i < size; i++) buf[i] = (i * 2654435761) % 251
    const p = path.join(dir, `f-${size}`)
    fs.writeFileSync(p, buf)

    const c = await clientFingerprint(new Blob([buf]), size)
    const s = sampleFingerprint(p, size)
    const ok = c === s
    if (!ok) bad++
    console.log(`${String(size).padStart(10)}  ${ok ? 'MATCH' : 'DIFF '}  client=${c.slice(0, 12)}… server=${s.slice(0, 12)}…`)
  }
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(bad ? `\n${bad} MISMATCH` : '\n全部一致')
  process.exit(bad ? 1 : 0)
}

void main()
