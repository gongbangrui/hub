'use client'
import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UploadCloud, X, Loader2, FileText, GripVertical } from 'lucide-react'
import { cn, formatBytes, fileKind } from '@/lib/utils'
import { fileUrl } from '@/lib/file-url'
import { EASE } from '@/components/ui/fx'

export type AttItem = { fileId: number; caption: string; name: string; mime: string; size: number }

/**
 * 表单内附件上传：直接把文件放进中转站（owner 自动识别为 admin），
 * 拿到 fileId 后作为附件挂到竞赛/论文上。
 */
export function AttachmentDrop({ items, onChange, accept }: {
  ownerType: 'competition' | 'paper'
  items: AttItem[]
  onChange: (v: AttItem[]) => void
  accept?: string
}) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragItem = useRef<number | null>(null)

  async function add(files: File[]) {
    if (!files.length) return
    setUploading(true)

    const next = [...items]
    await Promise.all(
      files.map(async (file) => {
        // 表单内附件走同一条分片上传链路，只是不进队列 UI
        try {
          const { uploadFileDirect } = await import('@/lib/upload-direct')
          const out = await uploadFileDirect(file)
          if (out?.fileId) {
            next.push({ fileId: out.fileId, caption: '', name: file.name, mime: file.type || '', size: file.size })
          }
        } catch {
          // 失败的文件直接跳过，下面统一在 UI 里反映进度
        }
      }),
    )

    onChange(next)
    setUploading(false)
  }

  function reorder(to: number) {
    const from = dragItem.current
    if (from === null || from === to) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    dragItem.current = null
    onChange(next)
  }

  return (
    <div className="space-y-2.5">
      <motion.div
        role="button"
        tabIndex={0}
        aria-label="上传附件"
        title="上传附件"
        data-active={dragging}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false)
          void add(Array.from(e.dataTransfer.files))
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
        whileTap={{ scale: 0.985 }}
        className={cn(
          'liquid grad-border spotlight group relative flex min-h-[84px] cursor-pointer items-center justify-center gap-3 rounded-2xl px-4 py-5 transition-colors duration-300',
          dragging && 'bg-indigo-400/[0.07]',
        )}
      >
        <span aria-hidden className="pointer-events-none absolute inset-2 rounded-xl border border-dashed border-indigo-200/15 transition-colors duration-300 group-hover:border-indigo-200/30" />
        <motion.span
          animate={dragging ? { scale: 1.15, y: -2 } : { scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className={cn('relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]', dragging && 'pulse-ring')}
        >
          {uploading ? (
            <Loader2 size={17} className="animate-spin text-sky-300" />
          ) : (
            <UploadCloud size={17} className={cn('text-indigo-100/55 transition-colors group-hover:text-sky-200', dragging && 'text-sky-200')} />
          )}
        </motion.span>
        {items.length > 0 && <span className="num relative text-[11px] text-indigo-100/40">{items.length}</span>}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          hidden
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? [])
            if (picked.length) void add(picked)
            e.target.value = ''
          }}
        />
      </motion.div>

      {items.length > 0 && (
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {items.map((it, i) => {
              const kind = fileKind(it.mime, it.name)
              return (
                <motion.li
                  key={it.fileId}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  draggable
                  onDragStart={() => { dragItem.current = i }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => reorder(i)}
                  className="liquid liquid-hover flex items-center gap-2.5 rounded-xl py-1.5 pl-2 pr-1"
                >
                  <GripVertical size={13} className="shrink-0 cursor-grab text-indigo-100/25" aria-hidden />

                  {kind === 'image' ? (
                    <img src={fileUrl({ id: it.fileId }, true)} alt="" loading="lazy"
                         className="h-9 w-9 shrink-0 rounded-lg border border-white/[0.07] object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.035]">
                      <FileText size={14} className="text-indigo-100/45" />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] text-white/85" title={it.name}>{it.name}</p>
                    <p className="num text-[10px] text-indigo-100/35">{formatBytes(it.size)}</p>
                  </div>

                  <input
                    value={it.caption}
                    onChange={(e) => {
                      const next = [...items]
                      next[i] = { ...it, caption: e.target.value }
                      onChange(next)
                    }}
                    placeholder="#"
                    aria-label="说明"
                    title="说明"
                    className="h-9 w-20 shrink-0 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 text-[11.5px] outline-none transition-colors placeholder:text-indigo-100/30 focus:border-indigo-300/50 sm:w-28"
                  />

                  <button
                    type="button"
                    onClick={() => onChange(items.filter((_, j) => j !== i))}
                    className="btn btn-ghost btn-danger h-10 w-10 shrink-0 p-0"
                    aria-label="移除"
                    title="移除"
                  >
                    <X size={13} />
                  </button>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
