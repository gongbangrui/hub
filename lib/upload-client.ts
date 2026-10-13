export const CHUNK_SIZE = 4 * 1024 * 1024
export const CONCURRENCY = 3
const LS_KEY = 'hub.uploads.v1'

export type UploadState = 'queued' | 'hashing' | 'uploading' | 'paused' | 'done' | 'error'

export type Task = {
  id: string
  file: File
  progress: number
  state: UploadState
  error?: string
  uploadId?: string
  fileId?: number
  shareCode?: string
  expiresAt?: string | null
  instant?: boolean
  sentBytes: number
  speed: number
}

/** 断点记录：fileKey → { uploadId, name, size, lastModified } */
type Resume = { uploadId: string; name: string; size: number; mtime: number }
type ResumeMap = Record<string, Resume>

export function fileKey(f: File) {
  return `${f.name}::${f.size}::${f.lastModified}`
}

export function loadResumes(): ResumeMap {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

export function saveResume(key: string, r: Resume) {
  const all = loadResumes()
  all[key] = r
  try { localStorage.setItem(LS_KEY, JSON.stringify(all)) } catch {}
}

export function dropResume(key: string) {
  const all = loadResumes()
  delete all[key]
  try { localStorage.setItem(LS_KEY, JSON.stringify(all)) } catch {}
}

/**
 * 秒传指纹：对 4GB 文件做全量 SHA-256 要几十秒还卡主线程，
 * 所以取样「大小 + 首块 + 中块 + 尾块」，够区分大小相同的不同文件。
 *
 * **服务端 lib/upload.ts 的 sampleFingerprint() 会用同一算法重算并覆盖，
 * 所以改动这里必须同步改那里。** 刻意不掺 lastModified —— 服务端读不到它。
 */
export async function fingerprint(f: File): Promise<string> {
  const parts: BlobPart[] = [String(f.size)]
  const take = Math.min(CHUNK_SIZE, f.size)
  parts.push(f.slice(0, take))
  if (f.size > CHUNK_SIZE * 2) {
    const mid = Math.floor(f.size / 2)
    parts.push(f.slice(mid, mid + take))
  }
  if (f.size > CHUNK_SIZE) parts.push(f.slice(f.size - take))

  const buf = new Blob(parts)
  const digest = await crypto.subtle.digest('SHA-256', await buf.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function chunkCount(size: number) {
  return Math.max(1, Math.ceil(size / CHUNK_SIZE))
}
