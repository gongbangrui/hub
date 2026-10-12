'use client'
import { useCallback, useRef, useState } from 'react'
import {
  CHUNK_SIZE, CONCURRENCY, chunkCount, dropResume, fileKey, fingerprint,
  loadResumes, saveResume, type Task,
} from '@/lib/upload-client'

export function useUploader(onDone?: () => void) {
  const [tasks, setTasks] = useState<Task[]>([])
  const cancelRef = useRef<Set<string>>(new Set())
  const pausedRef = useRef<Set<string>>(new Set())
  const optsRef = useRef<Map<string, { sharePassword?: string } | undefined>>(new Map())

  const patch = useCallback((id: string, next: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...next } : t)))
  }, [])

  const start = useCallback(async (files: File[], opts?: { sharePassword?: string }) => {
    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setTasks((prev) => [
        ...prev,
        { id, file, progress: 0, state: 'queued', sentBytes: 0, speed: 0 },
      ])
      optsRef.current.set(id, opts)
      void run(id, file, opts)
    }
  }, [])

  async function run(id: string, file: File, opts?: { sharePassword?: string }) {
    try {
      // ---- 1. 指纹（秒传判定用） ----
      patch(id, { state: 'hashing' })
      const fp = await fingerprint(file)
      if (cancelRef.current.has(id)) return

      // ---- 2. 初始化；带 uploadId 尝试续传 ----
      const resume = loadResumes()[fileKey(file)]
      patch(id, { state: 'uploading' })

      const initRes = await fetch('/api/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          fingerprint: fp,
          uploadId: resume?.uploadId,
          totalChunks: chunkCount(file.size),
          sharePassword: opts?.sharePassword || undefined,
        }),
      })
      if (!initRes.ok) throw new Error((await initRes.json().catch(() => ({}))).error || '初始化失败')
      const init = await initRes.json()

      // ---- 秒传命中 ----
      if (init.instant) {
        dropResume(fileKey(file))
        patch(id, {
          state: 'done', progress: 100, sentBytes: file.size,
          fileId: init.fileId, shareCode: init.shareCode, instant: true,
        })
        onDone?.()
        return
      }

      const { uploadId, totalChunks } = init
      saveResume(fileKey(file), { uploadId, name: file.name, size: file.size, mtime: file.lastModified })

      const received = new Set<number>(init.received ?? [])
      const remaining: number[] = []
      for (let i = 0; i < totalChunks; i++) if (!received.has(i)) remaining.push(i)

      const alreadyDone = received.size * CHUNK_SIZE
      patch(id, { uploadId, sentBytes: Math.min(alreadyDone, file.size), progress: (received.size / totalChunks) * 100 })

      // ---- 3. 并发传分片 ----
      let done = received.size
      let sent = alreadyDone
      const t0 = Date.now()
      let cursor = 0

      async function worker() {
        while (cursor < remaining.length) {
          if (cancelRef.current.has(id)) throw new Error('CANCELLED')
          while (pausedRef.current.has(id)) {
            await new Promise((r) => setTimeout(r, 300))
            if (cancelRef.current.has(id)) throw new Error('CANCELLED')
          }

          const idx = remaining[cursor++]
          const blob = file.slice(idx * CHUNK_SIZE, Math.min(file.size, (idx + 1) * CHUNK_SIZE))

          const fd = new FormData()
          fd.append('uploadId', uploadId)
          fd.append('index', String(idx))
          fd.append('chunk', blob, `chunk-${idx}`)

          const res = await fetch('/api/upload/chunk', { method: 'POST', body: fd })
          if (!res.ok) throw new Error(`分片 ${idx} 失败`)

          done++
          sent += blob.size
          const elapsed = (Date.now() - t0) / 1000
          patch(id, {
            progress: (done / totalChunks) * 100,
            sentBytes: Math.min(sent, file.size),
            speed: elapsed > 0 ? (sent - alreadyDone) / elapsed : 0,
          })
        }
      }

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, remaining.length || 1) }, worker))

      // ---- 4. 合并 ----
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
          sharePassword: opts?.sharePassword || undefined,
        }),
      })
      if (!doneRes.ok) throw new Error((await doneRes.json().catch(() => ({}))).error || '合并失败')
      const out = await doneRes.json()

      dropResume(fileKey(file))
      patch(id, {
        state: 'done', progress: 100, sentBytes: file.size,
        fileId: out.fileId, shareCode: out.shareCode, deleteKey: out.deleteKey, expiresAt: out.expiresAt,
      })
      onDone?.()
    } catch (e: any) {
      if (e?.message === 'CANCELLED') {
        setTasks((prev) => prev.filter((t) => t.id !== id))
        return
      }
      // 断点记录故意保留 —— 重新拖同一个文件就能续上
      patch(id, { state: 'error', error: e?.message ?? '上传失败' })
    }
  }

  const pause = useCallback((id: string) => {
    pausedRef.current.add(id)
    patch(id, { state: 'paused' })
  }, [patch])

  const resumeTask = useCallback((id: string) => {
    pausedRef.current.delete(id)
    const t = tasks.find((x) => x.id === id)
    if (!t) return
    patch(id, { state: 'uploading', error: undefined })
    // 暂停中的 worker 仍在轮询，解除暂停即可继续；只有出错的任务才重新跑（走断点续传）
    if (t.state === 'error') void run(id, t.file, optsRef.current.get(id))
  }, [tasks, patch])

  const cancel = useCallback((id: string) => {
    cancelRef.current.add(id)
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const clearFinished = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.state !== 'done'))
  }, [])

  return { tasks, start, pause, resume: resumeTask, cancel, clearFinished }
}
