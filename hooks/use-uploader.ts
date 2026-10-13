'use client'
import { useCallback, useRef, useState } from 'react'
import {
  CHUNK_SIZE, CONCURRENCY, chunkCount, dropResume, fileKey, fingerprint,
  loadResumes, saveResume, type Task,
} from '@/lib/upload-client'

/**
 * 续传时"已传字节"的精确值。分片是定长的，只有最后一片可能短，
 * 用 size * CHUNK_SIZE 会高估，进度条一开始就跳到一个偏大的位置。
 */
function receivedBytes(received: Set<number>, size: number) {
  let sum = 0
  for (const i of received) sum += Math.min(CHUNK_SIZE, size - i * CHUNK_SIZE)
  return sum
}

export function useUploader(onDone?: () => void) {
  const [tasks, setTasks] = useState<Task[]>([])
  const cancelRef = useRef<Set<string>>(new Set())
  const pausedRef = useRef<Set<string>>(new Set())
  const optsRef = useRef<Map<string, { sharePassword?: string } | undefined>>(new Map())
  // 每个任务一个 signal。任何一个分片失败或用户取消，都必须把同批其余
  // worker 正在飞的分片请求一起掐掉 —— 否则它们会继续往同一个 uploadId
  // 写盘，重试时就是两个会话并发写同一份分片。
  const abortRef = useRef<Map<string, AbortController>>(new Map())
  // 还有几个任务在跑。onDone 只在最后一个结束时触发 —— 否则调用方那句
  // location.reload() 会把同批其余文件正在飞的分片请求全部掐断。
  const inFlight = useRef(0)
  // onDone 存进 ref：start 的依赖是空数组，闭包里的 onDone 会停留在首帧
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  // 还在跑的任务 id。settle 靠它做成幂等：cancel 与 run 的 finally 都会调，
  // 只有第一次真正生效，否则 inFlight 会被减两次、过早触发 onDone。
  const liveRef = useRef<Set<string>>(new Set())

  const patch = useCallback((id: string, next: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...next } : t)))
  }, [])

  const settle = useCallback((id: string) => {
    abortRef.current.get(id)?.abort()
    abortRef.current.delete(id)
    if (!liveRef.current.delete(id)) return
    cancelRef.current.delete(id)
    pausedRef.current.delete(id)
    optsRef.current.delete(id)
    inFlight.current = Math.max(0, inFlight.current - 1)
    if (inFlight.current === 0) doneRef.current?.()
  }, [])

  const start = useCallback(async (files: File[], opts?: { sharePassword?: string }) => {
    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setTasks((prev) => [
        ...prev,
        { id, file, progress: 0, state: 'queued', sentBytes: 0, speed: 0 },
      ])
      optsRef.current.set(id, opts)
      liveRef.current.add(id)
      inFlight.current += 1
      void run(id, file, opts)
    }
  }, [])

  async function run(id: string, file: File, opts?: { sharePassword?: string }) {
    const ac = new AbortController()
    abortRef.current.set(id, ac)
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
        signal: ac.signal,
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
          fileId: init.fileId, shareCode: init.shareCode, expiresAt: init.expiresAt, instant: true,
        })
        return
      }

      const { uploadId } = init
      // 兜底：服务端没回 totalChunks 时按文件大小自己算，避免进度变成 NaN
      const totalChunks: number = Number.isInteger(init.totalChunks) ? init.totalChunks : chunkCount(file.size)
      saveResume(fileKey(file), { uploadId, name: file.name, size: file.size, mtime: file.lastModified })

      const received = new Set<number>(init.received ?? [])
      const remaining: number[] = []
      for (let i = 0; i < totalChunks; i++) if (!received.has(i)) remaining.push(i)

      const alreadyDone = receivedBytes(received, file.size)
      patch(id, { uploadId, sentBytes: Math.min(alreadyDone, file.size), progress: (received.size / totalChunks) * 100 })

      // ---- 3. 并发传分片 ----
      let done = received.size
      let sent = alreadyDone
      const t0 = Date.now()
      let cursor = 0

      // 首个失败的原因。不能靠 allSettled 数组顺序取第一个 rejected ——
      // 先失败的那个未必排在前面，取到的可能是被连累的 AbortError
      let firstError: unknown = null

      async function worker() {
        try {
          while (cursor < remaining.length) {
            if (ac.signal.aborted || cancelRef.current.has(id)) throw new Error('CANCELLED')
            while (pausedRef.current.has(id)) {
              await new Promise((r) => setTimeout(r, 300))
              if (ac.signal.aborted || cancelRef.current.has(id)) throw new Error('CANCELLED')
            }

            const idx = remaining[cursor++]
            const blob = file.slice(idx * CHUNK_SIZE, Math.min(file.size, (idx + 1) * CHUNK_SIZE))

            const fd = new FormData()
            fd.append('uploadId', uploadId)
            fd.append('index', String(idx))
            fd.append('chunk', blob, `chunk-${idx}`)

            const res = await fetch('/api/upload/chunk', { method: 'POST', body: fd, signal: ac.signal })
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
        } catch (err) {
          // 一失败就立刻掐掉同批其余 worker 正在飞的分片请求，
          // 否则它们会把当前这片传完才停，服务器上留下一堆白传的数据
          if (!firstError) firstError = err
          ac.abort()
          throw err
        }
      }

      await Promise.allSettled(
        Array.from({ length: Math.min(CONCURRENCY, remaining.length || 1) }, worker),
      )
      if (firstError) throw firstError

      // ---- 4. 合并 ----
      const doneRes = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
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
        fileId: out.fileId, shareCode: out.shareCode, expiresAt: out.expiresAt,
      })
    } catch (e: any) {
      // 判定"是不是取消"只能看 cancel 标记，不能看 ac.signal.aborted ——
      // worker 失败时自己也会 abort，真正的错误会被误当成取消静默丢掉
      const cancelled = cancelRef.current.has(id) || e?.message === 'CANCELLED'
      if (cancelled) {
        setTasks((prev) => prev.filter((t) => t.id !== id))
        return
      }
      // 断点记录故意保留 —— 重新拖同一个文件就能续上
      patch(id, { state: 'error', error: e?.message ?? '上传失败' })
    } finally {
      // 所有出口都在这里收敛：成功、秒传、取消、报错
      settle(id)
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
    if (t.state === 'error') {
      // 重新计入 live/inFlight，否则 run 的 finally 会早退，onDone 永远不触发
      liveRef.current.add(id)
      inFlight.current += 1
      void run(id, t.file, optsRef.current.get(id))
    }
  }, [tasks, patch])

  const cancel = useCallback((id: string) => {
    cancelRef.current.add(id)
    setTasks((prev) => prev.filter((t) => t.id !== id))
    // 立刻收尾：worker 要到下一片才看到取消标记，不能让 inFlight 挂着等
    settle(id)
  }, [settle])

  const clearFinished = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.state !== 'done'))
  }, [])

  return { tasks, start, pause, resume: resumeTask, cancel, clearFinished }
}
