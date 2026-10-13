import { CHUNK_SIZE, chunkCount, fingerprint, fileKey, dropResume, saveResume } from './upload-client'

/**
 * 表单内嵌上传：和队列上传走同一套分片协议，但不做 UI 队列、不暂停、串行推进。
 * 返回 { fileId, shareCode }，调用方拿 fileId 当附件 id 用。
 */
export async function uploadFileDirect(
  file: File,
  onProgress?: (pct: number) => void,
  opts?: { purpose?: 'attachment' },
): Promise<{ fileId: number; shareCode: string | null }> {
  const fp = await fingerprint(file)

  const initRes = await fetch('/api/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      fingerprint: fp,
      totalChunks: chunkCount(file.size),
      purpose: opts?.purpose,
    }),
  })
  if (!initRes.ok) throw new Error('init failed')
  const init = await initRes.json()

  if (init.instant) {
    // 秒传直接返回，也要把之前的断点记录清掉，否则 localStorage 里永久留一条废记录
    dropResume(fileKey(file))
    onProgress?.(100)
    return { fileId: init.fileId, shareCode: init.shareCode ?? null }
  }

  const { uploadId, totalChunks } = init
  const received = new Set<number>(init.received ?? [])

  let done = received.size
  for (let i = 0; i < totalChunks; i++) {
    if (received.has(i)) continue
    const blob = file.slice(i * CHUNK_SIZE, Math.min(file.size, (i + 1) * CHUNK_SIZE))

    const fd = new FormData()
    fd.append('uploadId', uploadId)
    fd.append('index', String(i))
    fd.append('chunk', blob, `chunk-${i}`)

    const res = await fetch('/api/upload/chunk', { method: 'POST', body: fd })
    if (!res.ok) {
      // 保留分片：同一个文件重试时会走续传
      saveResume(fileKey(file), { uploadId, name: file.name, size: file.size, mtime: file.lastModified })
      throw new Error(`chunk ${i} failed`)
    }
    done++
    onProgress?.((done / totalChunks) * 100)
  }

  const doneRes = await fetch('/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploadId,
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      totalChunks,
      fingerprint: fp,
      purpose: opts?.purpose,
    }),
  })
  if (!doneRes.ok) throw new Error('complete failed')

  const out = await doneRes.json()
  dropResume(fileKey(file))
  return { fileId: out.fileId, shareCode: out.shareCode ?? null }
}
