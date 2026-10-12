'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UploadCloud, File as FileIcon, ImageIcon, FileArchive, FileText, Film, Music,
  Code2, Table2, Download, Trash2, Link2, Link2Off, Loader2, Check, X, Pause, Play,
  Copy, RefreshCw, Eye, Lock, Clock, Zap, Fingerprint, CheckCheck, LayoutGrid,
  Search, SearchX, ArrowDownToLine, RotateCw, ExternalLink, Infinity as InfinityIcon,
} from 'lucide-react'
import type { PublicFile as FileRow } from '@/lib/file-access'
import type { Task } from '@/lib/upload-client'
import { fileUrl } from '@/lib/file-url'
import { cn, formatBytes, fileKind } from '@/lib/utils'
import { useUploader } from '@/hooks/use-uploader'
import { EmptyState, Modal } from '@/components/ui/primitives'
import { stagger } from '@/components/motion/reveal'
import { EASE } from '@/components/ui/fx'

const ICONS: Record<string, React.ElementType> = {
  image: ImageIcon, pdf: FileText, archive: FileArchive, video: Film,
  audio: Music, code: Code2, doc: FileText, sheet: Table2, other: FileIcon,
}
const KIND_LABEL: Record<string, string> = {
  image: '图片', pdf: 'PDF', archive: '压缩包', video: '视频', audio: '音频',
  code: '代码', doc: '文档', sheet: '表格', other: '其他',
}
const KIND_ORDER = ['image', 'pdf', 'doc', 'sheet', 'archive', 'video', 'audio', 'code', 'other']
const PREVIEWABLE = new Set(['image', 'pdf', 'video', 'audio'])
const MY_KEYS = 'hub.myfiles'

// 不用 filter：残留的 blur(0px) 会截断子元素的 backdrop-filter（液态玻璃失效）
const cardItem = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: EASE } },
}

function readKeys(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MY_KEYS) || '{}') } catch { return {} }
}

/** 加锁文件不能直接请求（访客会 401），统一走分享页 */
function downloadHref(f: FileRow) {
  return f.locked && f.shareCode ? `/s/${f.shareCode}` : fileUrl(f)
}

export function FileStation({ files, authed, tempCount }: { files: FileRow[]; authed: boolean; tempCount: number }) {
  const [dragging, setDragging] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [shareFor, setShareFor] = useState<FileRow | null>(null)
  const [preview, setPreview] = useState<FileRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [myKeys, setMyKeys] = useState<Record<string, string>>({})
  const [kind, setKind] = useState('all')
  const [q, setQ] = useState('')
  const dragDepth = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { tasks, start, pause, resume, cancel, clearFinished } = useUploader(() => setTimeout(() => location.reload(), 600))

  useEffect(() => setMounted(true), [])

  // 本机上传的删除凭证：记下来，访客才能删自己的文件
  useEffect(() => {
    const keys = readKeys()
    let changed = false
    for (const t of tasks) {
      if (t.state === 'done' && t.fileId && t.deleteKey && keys[t.fileId] !== t.deleteKey) {
        keys[t.fileId] = t.deleteKey
        changed = true
      }
    }
    if (changed) { try { localStorage.setItem(MY_KEYS, JSON.stringify(keys)) } catch {} }
    setMyKeys(keys)
  }, [tasks])

  // 整页拖拽：用计数器避免子元素冒泡导致的闪烁
  useEffect(() => {
    function onEnter(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return
      dragDepth.current++
      setDragging(true)
    }
    function onLeave() {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    function onOver(e: DragEvent) { e.preventDefault() }
    function onDrop(e: DragEvent) {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const dropped = Array.from(e.dataTransfer?.files ?? [])
      if (dropped.length) void start(dropped)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [start])

  const kinds = useMemo(() => {
    const m: Record<string, number> = {}
    for (const f of files) {
      const k = fileKind(f.mime, f.originalName)
      m[k] = (m[k] ?? 0) + 1
    }
    return KIND_ORDER.filter((k) => m[k]).map((k) => [k, m[k]] as const)
  }, [files])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return files.filter((f) =>
      (kind === 'all' || fileKind(f.mime, f.originalName) === kind)
      && (!needle || f.originalName.toLowerCase().includes(needle)),
    )
  }, [files, kind, q])

  async function del(f: FileRow) {
    const mine = readKeys()[f.id]
    if (!authed && !mine) return
    if (!confirm(`删除「${f.originalName}」？`)) return
    setBusy(true)
    await fetch(`/api/files/${f.id}${mine ? `?key=${encodeURIComponent(mine)}` : ''}`, { method: 'DELETE' })
    setBusy(false)
    location.reload()
  }

  async function purge() {
    if (!confirm('清理过期？')) return
    setBusy(true)
    const r = await fetch('/api/files/purge', { method: 'POST' })
    setBusy(false)
    const j = await r.json().catch(() => ({}))
    alert(`✓ ${j.removed ?? 0}`)
    location.reload()
  }

  const pick = () => inputRef.current?.click()
  const running = tasks.filter((t) => t.state !== 'done').length

  return (
    <div className="split split-wide items-start">
      {/* 左栏：投放区 + 队列 */}
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-24">
        <motion.div
          role="button"
          tabIndex={0}
          aria-label="上传"
          title="上传"
          data-active={dragging}
          onClick={pick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick() } }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.985 }}
          transition={{ duration: 0.55, ease: EASE }}
          className="liquid grad-border spotlight group relative flex min-h-[200px] cursor-pointer select-none flex-col items-center justify-center gap-6 rounded-3xl p-8 lg:min-h-[300px]"
        >
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-0 rounded-[inherit] opacity-50 transition-opacity duration-500 group-hover:opacity-100',
              'bg-[radial-gradient(70%_60%_at_50%_45%,rgba(129,140,248,0.18),rgba(125,211,252,0.06)_45%,transparent_75%)]',
              dragging && 'opacity-100',
            )}
          />
          <span aria-hidden className="pointer-events-none absolute inset-3 rounded-[1.25rem] border border-dashed border-indigo-200/15 transition-colors duration-500 group-hover:border-indigo-200/30" />

          <motion.div
            animate={dragging ? { scale: 1.14, y: -6 } : { scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            className={cn('liquid relative flex h-20 w-20 items-center justify-center rounded-3xl', dragging && 'pulse-ring')}
          >
            <span aria-hidden className="absolute -inset-5 -z-10 rounded-full bg-[radial-gradient(circle,rgba(129,140,248,0.45),transparent_70%)] blur-2xl" />
            <UploadCloud size={32} strokeWidth={1.6} className="text-sky-100 transition-transform duration-500 group-hover:-translate-y-0.5" />
          </motion.div>

          <div className="relative flex flex-wrap items-center justify-center gap-2 text-[11px] text-indigo-100/50">
            <span className="num rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">≤ 4GB</span>
            <span className="flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1" title="断点续传" aria-label="断点续传">
              <RotateCw size={11} />
            </span>
            {!authed && (
              <span className="num flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-amber-100/80" title="24 小时后清理">
                <Clock size={11} /> 24h
              </span>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? [])
              if (picked.length) void start(picked)
              e.target.value = ''
            }}
          />
        </motion.div>

        {/* 上传队列 */}
        <AnimatePresence initial={false}>
          {tasks.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="liquid rounded-3xl p-2.5">
                <div className="flex items-center justify-between pb-1 pl-2.5">
                  <span className="flex items-center gap-2 text-[12px] text-indigo-100/55">
                    {running > 0 ? <Loader2 size={13} className="animate-spin text-sky-300" /> : <CheckCheck size={13} className="text-emerald-300" />}
                    <span className="num">{running || tasks.length}</span>
                  </span>
                  <button onClick={clearFinished} className="btn btn-ghost h-10 w-10 p-0" aria-label="清除已完成" title="清除已完成">
                    <CheckCheck size={14} />
                  </button>
                </div>
                <AnimatePresence initial={false}>
                  {tasks.map((t) => (
                    <UploadRow key={t.id} task={t} onPause={pause} onResume={resume} onCancel={cancel} />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* 右栏：文件 */}
      <section className="min-w-0 space-y-4">
        {files.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="liquid flex max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl p-1 [scrollbar-width:none]">
              {([['all', files.length] as const, ...kinds]).map(([k, n]) => {
                const Icon = k === 'all' ? LayoutGrid : ICONS[k] ?? FileIcon
                const on = kind === k
                const label = k === 'all' ? '全部' : KIND_LABEL[k]
                return (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    aria-pressed={on}
                    aria-label={label}
                    title={label}
                    className={cn(
                      'relative flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12px] transition-colors duration-300',
                      on ? 'text-white' : 'text-indigo-100/50 hover:text-white',
                    )}
                  >
                    {on && (
                      <motion.span
                        layoutId="fs-kind"
                        className="absolute inset-0 rounded-xl border border-indigo-300/35 shadow-[0_0_20px_-6px_rgba(129,140,248,0.7)]"
                        style={{ background: 'var(--grad-soft)' }}
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <Icon size={14} className="relative" />
                    <span className="num relative">{n}</span>
                  </button>
                )
              })}
            </div>

            <label className="relative min-w-[140px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-indigo-100/35" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索"
                aria-label="搜索"
                className="field h-10 pl-9"
              />
            </label>

            {authed && tempCount > 0 && (
              <button
                onClick={purge}
                disabled={busy}
                className="btn h-10 gap-1.5 px-3 text-amber-100/80"
                aria-label="清理过期"
                title="清理过期"
              >
                <RefreshCw size={13} className={cn(busy && 'animate-spin')} />
                <span className="num text-[12px]">{tempCount}</span>
              </button>
            )}
          </div>
        )}

        {files.length === 0 ? (
          <EmptyState icon={<UploadCloud size={30} />} />
        ) : shown.length === 0 ? (
          <EmptyState icon={<SearchX size={28} />} title="∅" />
        ) : (
          <motion.div variants={stagger} initial="hidden" animate="show" className="masonry">
            <AnimatePresence>
              {shown.map((f) => (
                <FileCard
                  key={f.id}
                  file={f}
                  canDelete={authed || !!myKeys[f.id]}
                  onShare={() => setShareFor(f)}
                  onPreview={() => setPreview(f)}
                  onDelete={() => del(f)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </section>

      {/* 拖拽全屏遮罩：挂到 body，避免被祖先的 backdrop-filter / transform 困住 */}
      {mounted && createPortal(
        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-[#05061a]/65 p-6 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.88, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                data-active="true"
                className="liquid-strong grad-border flex h-56 w-56 items-center justify-center rounded-[2.25rem]"
              >
                <span className="pulse-ring flex h-20 w-20 items-center justify-center rounded-full" style={{ background: 'var(--grad-soft)' }}>
                  <ArrowDownToLine size={34} className="text-sky-100" />
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <ShareModal file={shareFor} onClose={() => setShareFor(null)} />
      <PreviewModal file={preview} onClose={() => setPreview(null)} />
    </div>
  )
}

function UploadRow({ task, onPause, onResume, onCancel }: {
  task: Task; onPause: (id: string) => void; onResume: (id: string) => void; onCancel: (id: string) => void
}) {
  const done = task.state === 'done'
  const err = task.state === 'error'
  const paused = task.state === 'paused'
  const uploading = task.state === 'uploading'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="rounded-2xl px-2.5 py-2 transition-colors hover:bg-white/[0.03]"
    >
      <div className="flex items-center gap-2.5">
        <span className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border',
          done ? 'border-emerald-400/30 bg-emerald-400/12 text-emerald-300'
            : err ? 'border-rose-400/30 bg-rose-400/12 text-rose-300'
            : paused ? 'border-amber-300/30 bg-amber-300/10 text-amber-200'
            : 'border-white/10 bg-white/[0.04] text-sky-200/70',
        )}>
          {done ? <Check size={14} />
            : err ? <X size={14} />
            : paused ? <Pause size={13} />
            : task.state === 'hashing' ? <Fingerprint size={14} className="animate-pulse" />
            : <FileIcon size={14} />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] text-white/85" title={task.file.name}>{task.file.name}</span>
            {task.instant && (
              <span className="flex shrink-0 items-center gap-0.5 rounded-md border border-sky-300/30 bg-sky-400/12 px-1.5 py-0.5 text-[10px] text-sky-100" title="秒传">
                <Zap size={9} /> ✓
              </span>
            )}
          </div>
          <div className="num mt-0.5 flex items-center gap-1.5 text-[10.5px] text-indigo-100/35">
            <span>{formatBytes(task.file.size)}</span>
            {uploading && task.speed > 0 && <span>· {formatBytes(task.speed)}/s</span>}
            {err && <span className="truncate text-rose-300/90" title={task.error}>· {task.error}</span>}
            {!done && !err && <span className="ml-auto">{Math.round(task.progress)}%</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center">
          {uploading && (
            <button onClick={() => onPause(task.id)} className="btn btn-ghost h-10 w-10 p-0" aria-label="暂停" title="暂停"><Pause size={13} /></button>
          )}
          {paused && (
            <button onClick={() => onResume(task.id)} className="btn btn-ghost h-10 w-10 p-0" aria-label="继续" title="继续"><Play size={13} /></button>
          )}
          {!done && (
            <button onClick={() => onCancel(task.id)} className="btn btn-ghost btn-danger h-10 w-10 p-0" aria-label="取消" title="取消"><X size={13} /></button>
          )}
        </div>
      </div>

      {!done && !err && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className={cn('h-full rounded-full', uploading && 'shimmer')}
            style={{ background: 'var(--grad)', opacity: paused ? 0.45 : 1 }}
            initial={false}
            animate={{ width: `${Math.max(2, task.progress)}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      )}
    </motion.div>
  )
}

function FileCard({ file, canDelete, onShare, onPreview, onDelete }: {
  file: FileRow; canDelete: boolean; onShare: () => void; onPreview: () => void; onDelete: () => void
}) {
  const kind = fileKind(file.mime, file.originalName)
  const Icon = ICONS[kind] ?? FileIcon
  const [broken, setBroken] = useState(false)
  const showThumb = kind === 'image' && !file.locked && !broken
  const canPreview = !file.locked && PREVIEWABLE.has(kind)
  const left = file.expiresAt ? new Date(file.expiresAt).getTime() - Date.now() : null
  const expiring = left !== null && left < 6 * 3600 * 1000

  return (
    <motion.div
      layout="position"
      variants={cardItem}
      exit={{ opacity: 0, scale: 0.94, filter: 'blur(6px)', transition: { duration: 0.22 } }}
    >
      <motion.article
        whileHover={{ y: -3 }}
        transition={{ type: 'spring', stiffness: 360, damping: 26 }}
        className="liquid liquid-hover spotlight group rounded-2xl p-2"
      >
        {showThumb ? (
          <button
            onClick={onPreview}
            className="relative block w-full cursor-zoom-in overflow-hidden rounded-xl bg-white/[0.03]"
            aria-label="预览"
          >
            <img
              src={fileUrl(file, true)}
              alt=""
              loading="lazy"
              onError={() => setBroken(true)}
              className="block max-h-72 min-h-24 w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            />
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05061a]/50 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          </button>
        ) : (
          <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-[radial-gradient(90%_90%_at_30%_10%,rgba(125,211,252,0.12),rgba(192,132,252,0.08)_55%,transparent)]">
            <Icon size={28} strokeWidth={1.5} className="text-indigo-100/60 transition-transform duration-500 group-hover:scale-110" />
            {file.locked && (
              <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-300/12 text-amber-200" title="口令" aria-label="口令">
                <Lock size={11} />
              </span>
            )}
          </div>
        )}

        <div className="px-1.5 pb-0.5 pt-2.5">
          <p className="truncate text-[13px] text-white/90" title={file.originalName}>{file.originalName}</p>
          <div className="num mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-indigo-100/40">
            <span>{formatBytes(file.size)}</span>
            {file.downloads > 0 && <span className="flex items-center gap-0.5" title="下载"><ArrowDownToLine size={10} />{file.downloads}</span>}
            {left !== null && (
              <span
                className={cn(
                  'flex items-center gap-0.5 rounded-md border px-1.5 py-0.5',
                  expiring ? 'border-amber-300/30 bg-amber-300/10 text-amber-200/90' : 'border-white/10 bg-white/[0.04]',
                )}
                title="剩余"
                suppressHydrationWarning
              >
                <Clock size={9} /> {formatLeft(left)}
              </span>
            )}
          </div>
        </div>

        <div className="mt-1 flex items-center justify-end gap-0.5 transition-opacity duration-300 [@media(hover:hover)]:opacity-60 group-hover:opacity-100 group-focus-within:opacity-100">
          {canPreview && !showThumb && (
            <button onClick={onPreview} className="btn btn-ghost h-10 w-10 p-0" aria-label="预览" title="预览"><Eye size={14} /></button>
          )}
          {file.shareCode && (
            <button onClick={onShare} className="btn btn-ghost h-10 w-10 p-0" aria-label="分享" title="分享"><Link2 size={14} /></button>
          )}
          <a href={downloadHref(file)} className="btn btn-ghost h-10 w-10 p-0" aria-label="下载" title="下载">
            {file.locked ? <Lock size={14} /> : <Download size={14} />}
          </a>
          {canDelete && (
            <button onClick={onDelete} className="btn btn-ghost btn-danger h-10 w-10 p-0" aria-label="删除" title="删除"><Trash2 size={14} /></button>
          )}
        </div>
      </motion.article>
    </motion.div>
  )
}

function formatLeft(ms: number) {
  if (ms <= 0) return '0'
  const h = Math.floor(ms / 3600000)
  if (h >= 48) return `${Math.floor(h / 24)}d`
  if (h >= 1) return `${h}h`
  return `${Math.max(1, Math.floor(ms / 60000))}m`
}

function ShareModal({ file, onClose }: { file: FileRow | null; onClose: () => void }) {
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const link = useMemo(() => {
    if (!file?.shareCode) return ''
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/s/${file.shareCode}`
  }, [file])

  useEffect(() => {
    if (!link) { setQr(''); return }
    import('qrcode').then((m) => m.toDataURL(link, {
      width: 320, margin: 1,
      color: { dark: '#e0e7ffff', light: '#0b0d24ff' },
    })).then(setQr).catch(() => setQr(''))
  }, [link])

  const left = file?.expiresAt ? new Date(file.expiresAt).getTime() - Date.now() : null

  return (
    <Modal
      open={!!file}
      onClose={onClose}
      className="max-w-sm"
      title={file && (
        <span className="flex min-w-0 items-center gap-2">
          <Link2 size={15} className="shrink-0 text-sky-300" />
          <span className="truncate text-[13.5px] text-white/85">{file.originalName}</span>
        </span>
      )}
    >
      {file && (
        link ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div data-active="true" className="liquid grad-border rounded-3xl p-3">
                {qr ? (
                  <motion.img
                    initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, ease: EASE }}
                    src={qr} alt="QR" width={176} height={176}
                    className="h-[176px] w-[176px] rounded-xl"
                  />
                ) : (
                  <div className="shimmer h-[176px] w-[176px] rounded-xl bg-white/[0.04]" />
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <input readOnly value={link} aria-label="链接" className="field h-10 min-w-0 font-mono text-[12px]" onFocus={(e) => e.target.select()} />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={async () => {
                  await navigator.clipboard.writeText(link)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                }}
                className="btn btn-primary shine h-10 w-10 shrink-0 p-0"
                aria-label="复制"
                title="复制"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={copied ? 'y' : 'n'}
                    initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.18 }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
              <a href={link} target="_blank" rel="noreferrer" className="btn h-10 w-10 shrink-0 p-0" aria-label="打开" title="打开">
                <ExternalLink size={14} />
              </a>
            </div>

            <div className="num flex items-center justify-center gap-3 text-[11px] text-indigo-100/40">
              <span>{formatBytes(file.size)}</span>
              <span className="flex items-center gap-1" title={left !== null ? '剩余' : '长期'}>
                <Clock size={11} />
                {left !== null ? formatLeft(left) : <InfinityIcon size={12} />}
              </span>
              {file.locked && <span className="flex items-center text-amber-200/80" title="口令"><Lock size={11} /></span>}
            </div>
          </div>
        ) : (
          <EmptyState icon={<Link2Off size={26} />} />
        )
      )}
    </Modal>
  )
}

function PreviewModal({ file, onClose }: { file: FileRow | null; onClose: () => void }) {
  if (!file) return null
  const kind = fileKind(file.mime, file.originalName)
  const src = fileUrl(file, true)
  const Icon = ICONS[kind] ?? FileIcon

  return (
    <Modal open onClose={onClose} className="max-w-5xl" title={
      <span className="flex min-w-0 items-center gap-2">
        <Icon size={15} className="shrink-0 text-sky-300" />
        <span className="truncate text-[13px] text-white/75">{file.originalName}</span>
      </span>
    }>
      <div className="max-h-[76vh] overflow-auto">
        {file.locked ? (
          <EmptyState icon={<Lock size={26} />} />
        ) : kind === 'image' ? (
          <img src={src} alt={file.originalName} className="mx-auto max-h-[68vh] rounded-xl" />
        ) : kind === 'pdf' ? (
          <iframe src={src} className="h-[68vh] w-full rounded-xl border border-white/10 bg-white" title={file.originalName} />
        ) : kind === 'video' ? (
          <video src={src} controls className="mx-auto max-h-[68vh] w-full rounded-xl" />
        ) : kind === 'audio' ? (
          <audio src={src} controls className="w-full" />
        ) : (
          <EmptyState icon={<Icon size={26} />} title="∅" />
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <a href={downloadHref(file)} className="btn btn-primary shine h-10" aria-label="下载" title="下载">
          <Download size={14} />
          <span className="num">{formatBytes(file.size)}</span>
        </a>
      </div>
    </Modal>
  )
}
