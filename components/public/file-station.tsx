'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { m as motion, AnimatePresence } from 'framer-motion'
import {
  UploadCloud, File as FileIcon, ImageIcon, FileArchive, FileText, Film, Music,
  Code2, Table2, Download, Trash2, Link2, Link2Off, Loader2, Check, X, Pause, Play,
  Copy, RefreshCw, Eye, Lock, Clock, Zap, Fingerprint, CheckCheck, LayoutGrid,
  Search, SearchX, ArrowDownToLine, RotateCw, ExternalLink, Infinity as InfinityIcon,
  Hash, ArrowRight, TimerReset, ListChecks, QrCode, Info,
} from 'lucide-react'
import type { PublicFile as FileRow } from '@/lib/file-access'
import type { Task } from '@/lib/upload-client'
import { fileUrl, thumbUrl } from '@/lib/file-url'
import { cn, formatBytes, fileKind } from '@/lib/utils'
import { useUploader } from '@/hooks/use-uploader'
import { EmptyState, Modal } from '@/components/ui/primitives'
import { Masonry } from '@/components/ui/masonry'
import { QuickText } from '@/components/public/home/quick-text'
import { EASE } from '@/lib/motion'

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
const HINT_KEY = 'hub.files.hint'
const DAY = 24 * 3600 * 1000

/** 加锁文件不能直接请求（访客会 401），统一走分享页 */
function downloadHref(f: FileRow) {
  return f.locked && f.shareCode ? `/s/${f.shareCode}` : fileUrl(f)
}

/** 挂载后才有值：避免服务端与客户端的 Date.now() 不一致导致水合告警 */
function useNow(ms = 30_000) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

function formatLeft(ms: number) {
  if (ms <= 0) return '已过期'
  const h = Math.floor(ms / 3600000)
  if (h >= 48) return `${Math.floor(h / 24)} 天`
  if (h >= 1) return `${h} 小时 ${Math.floor((ms % 3600000) / 60000)} 分`
  return `${Math.max(1, Math.floor(ms / 60000))} 分钟`
}

async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t); return true } catch { return false }
}

export function FileStation({ files, authed, tempCount }: { files: FileRow[]; authed: boolean; tempCount: number }) {
  const router = useRouter()
  const params = useSearchParams()
  const now = useNow()
  const [dragging, setDragging] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [shareFor, setShareFor] = useState<FileRow | null>(null)
  const [preview, setPreview] = useState<FileRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState('all')
  const [q, setQ] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [pulse, setPulse] = useState(false)
  const [hint, setHint] = useState(false)
  const dragDepth = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // 全部传完后只刷新服务端数据:不整页重载,队列里的分享码与进度都还在
  const { tasks, start, pause, resume, cancel, clearFinished } = useUploader(() => router.refresh())

  useEffect(() => {
    setMounted(true)
    try { setHint(!authed && !localStorage.getItem(HINT_KEY)) } catch { /* ignore */ }
  }, [authed])

  // ⌘K「上传文件」带 ?upload=1 过来:让投放区亮一下(浏览器不允许无手势弹出文件选择)
  useEffect(() => {
    if (params.get('upload') !== '1') return
    setPulse(true)
    router.replace('/files', { scroll: false })
    const t = setTimeout(() => setPulse(false), 2600)
    return () => clearTimeout(t)
  }, [params, router])

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

  // 粘贴图片/文件直接上传(截图后 ⌘V)
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const fs = Array.from(e.clipboardData?.files ?? [])
      if (fs.length) { e.preventDefault(); void start(fs) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [start])

  const mine = useMemo(() => files.filter((f) => f.mine), [files])
  const rest = useMemo(() => files.filter((f) => !f.mine), [files])

  const kinds = useMemo(() => {
    const m: Record<string, number> = {}
    for (const f of rest) {
      const k = fileKind(f.mime, f.originalName)
      m[k] = (m[k] ?? 0) + 1
    }
    return KIND_ORDER.filter((k) => m[k]).map((k) => [k, m[k]] as const)
  }, [rest])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rest.filter((f) =>
      (kind === 'all' || fileKind(f.mime, f.originalName) === kind)
      && (!needle || f.originalName.toLowerCase().includes(needle)),
    )
  }, [rest, kind, q])

  const del = useCallback(async (f: FileRow) => {
    if (!f.canDelete) return
    if (!confirm(`删除「${f.originalName}」？`)) return
    setBusy(true)
    // 必须看返回码：管理员把这份文件转为永久后会清掉 uploaderId，
    // 访客这边列表里还看得见，但 DELETE 已经被拒，不看就会静默失败
    const r = await fetch(`/api/files/${f.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!r.ok) { alert((await r.json().catch(() => ({}))).error ?? '删除失败'); return }
    router.refresh()
  }, [router])

  async function delSelected() {
    const list = files.filter((f) => selected.has(f.id) && f.canDelete)
    if (!list.length || !confirm(`删除选中的 ${list.length} 个文件？`)) return
    setBusy(true)
    const results = await Promise.all(
      list.map(async (f) => {
        try { return (await fetch(`/api/files/${f.id}`, { method: 'DELETE' })).ok } catch { return false }
      }),
    )
    setBusy(false)
    const failed = results.filter((ok) => !ok).length
    if (failed) alert(`有 ${failed} 个文件删除失败`)
    setSelected(new Set()); setSelecting(false)
    router.refresh()
  }

  async function extend(f: FileRow) {
    setBusy(true)
    const r = await fetch(`/api/files/${f.id}/extend`, { method: 'POST' })
    setBusy(false)
    if (!r.ok) alert((await r.json().catch(() => ({}))).error ?? '续期失败')
    else router.refresh()
  }

  async function purge() {
    if (!confirm('清理过期？')) return
    setBusy(true)
    const r = await fetch('/api/files/purge', { method: 'POST' })
    setBusy(false)
    const j = await r.json().catch(() => ({}))
    alert(`✓ ${j.removed ?? 0}`)
    router.refresh()
  }

  const toggle = (f: FileRow) => {
    if (!f.canDelete) return
    setSelected((s) => { const n = new Set(s); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n })
  }

  const pick = () => inputRef.current?.click()
  const running = tasks.filter((t) => t.state !== 'done').length
  const canSelect = rest.some((f) => f.canDelete)

  return (
    <div className="split split-wide items-start">
      {/* 左栏：投放区 + 队列 + 取件码 + 文本快传 */}
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-6">
        <div
          role="button"
          tabIndex={0}
          aria-label="上传"
          title="上传"
          data-active={dragging || pulse}
          onClick={pick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick() } }}
          className={cn(
            'enter liquid liquid-blur grad-border spotlight group relative flex min-h-[200px] cursor-pointer select-none flex-col items-center justify-center gap-6 rounded-3xl p-8 transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.99] lg:min-h-[280px]',
            pulse && 'pulse-ring',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-0 rounded-[inherit] opacity-60 transition-opacity duration-500 group-hover:opacity-100',
              'bg-[radial-gradient(70%_60%_at_50%_45%,rgba(99,102,241,0.14),rgba(56,189,248,0.06)_45%,transparent_75%)]',
              (dragging || pulse) && 'opacity-100',
            )}
          />
          <span aria-hidden className="pointer-events-none absolute inset-3 rounded-[1.25rem] border border-dashed border-indigo-300/50 transition-colors duration-500 group-hover:border-indigo-400/70" />

          <motion.div
            animate={dragging ? { scale: 1.14, y: -6 } : { scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            className={cn('float relative flex h-20 w-20 items-center justify-center rounded-3xl bg-white/80 shadow-[0_14px_34px_-10px_rgba(79,70,229,0.5)]', dragging && 'pulse-ring')}
          >
            <UploadCloud size={32} strokeWidth={1.6} className="text-indigo-600 transition-transform duration-500 group-hover:-translate-y-0.5" />
          </motion.div>

          <div className="relative flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
            <span className="num rounded-full border border-white bg-white/70 px-2.5 py-1">≤ 4GB</span>
            <span className="flex items-center rounded-full border border-white bg-white/70 px-2.5 py-1" title="断点续传" aria-label="断点续传">
              <RotateCw size={11} />
            </span>
            <span className="rounded-full border border-white bg-white/70 px-2.5 py-1" title="可直接粘贴截图">⌘V</span>
            {!authed && (
              <span className="num flex items-center gap-1 rounded-full border border-amber-300/50 bg-amber-100/70 px-2.5 py-1 text-amber-700" title="24 小时后清理">
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
        </div>

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
                  <span className="flex items-center gap-2 text-[12px] text-slate-500">
                    {running > 0 ? <Loader2 size={13} className="animate-spin text-sky-500" /> : <CheckCheck size={13} className="text-emerald-500" />}
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

        <Pickup />
        <QuickText compact className="enter" />
      </aside>

      {/* 右栏：我的临时文件 + 文件 */}
      <section className="min-w-0 space-y-6">
        {!authed && hint && (
          <div className="enter liquid flex items-start gap-3 rounded-2xl px-4 py-3 text-[13px] text-slate-600">
            <Info size={16} className="mt-0.5 shrink-0 text-sky-500" />
            <p className="flex-1 leading-relaxed">
              访客上传的文件保留 <b className="text-slate-800">24 小时</b>,只有你自己能在这里看到(靠浏览器里的标识识别)。
              拿到分享链接或取件码的人也能下载,你可以随时续期或删除。
            </p>
            <button
              onClick={() => { setHint(false); try { localStorage.setItem(HINT_KEY, '1') } catch { /* ignore */ } }}
              className="btn btn-ghost h-8 w-8 shrink-0 p-0" aria-label="知道了" title="知道了"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {mine.length > 0 && (
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-slate-800">
              <Clock size={15} className="text-sky-500" /> 我的临时文件
              <span className="num rounded-full bg-sky-400/15 px-2 py-0.5 text-[11.5px] font-medium text-sky-700">{mine.length}</span>
            </h2>
            <div className="space-y-2.5">
              <AnimatePresence initial={false}>
                {mine.map((f) => (
                  <MineRow
                    key={f.id} file={f} now={now} busy={busy}
                    onShare={() => setShareFor(f)} onPreview={() => setPreview(f)}
                    onExtend={() => extend(f)} onDelete={() => del(f)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {rest.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="liquid flex max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl p-1 [scrollbar-width:none]">
              {([['all', rest.length] as const, ...kinds]).map(([k, n]) => {
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
                      on ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800',
                    )}
                  >
                    {on && (
                      <motion.span
                        layoutId="fs-kind"
                        className="absolute inset-0 rounded-xl border border-white bg-white/90 shadow-[0_4px_12px_-4px_rgba(79,70,229,0.4)]"
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
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索"
                aria-label="搜索"
                className="field h-10 pl-9"
              />
            </label>

            {canSelect && (
              <button
                onClick={() => { setSelecting((v) => !v); setSelected(new Set()) }}
                aria-pressed={selecting}
                className={cn('btn h-10 gap-1.5 px-3', selecting && 'border-indigo-300 text-indigo-700')}
                title="多选"
                aria-label="多选"
              >
                <ListChecks size={14} />
              </button>
            )}

            {authed && tempCount > 0 && (
              <button
                onClick={purge}
                disabled={busy}
                className="btn h-10 gap-1.5 px-3 text-amber-700"
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
          <EmptyState icon={<UploadCloud size={30} />} title="拖拽文件到左侧,或直接粘贴截图" />
        ) : rest.length === 0 ? null : shown.length === 0 ? (
          <EmptyState icon={<SearchX size={28} />} title="∅" />
        ) : (
          <Masonry minCol={230} maxCols={3}>
            {shown.map((f, i) => (
              <FileCard
                key={f.id}
                file={f}
                idx={i}
                now={now}
                selecting={selecting}
                selected={selected.has(f.id)}
                onToggle={() => toggle(f)}
                onShare={() => setShareFor(f)}
                onPreview={() => setPreview(f)}
                onDelete={() => del(f)}
              />
            ))}
          </Masonry>
        )}
      </section>

      {/* 多选操作条 */}
      {mounted && createPortal(
        <AnimatePresence>
          {selecting && (
            <motion.div
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="liquid-strong fixed bottom-24 left-1/2 z-[65] flex -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-2.5 lg:bottom-8"
            >
              <span className="num text-[13px] text-slate-600">已选 <b className="text-slate-900">{selected.size}</b></span>
              <button
                onClick={() => setSelected(new Set(shown.filter((f) => f.canDelete).map((f) => f.id)))}
                className="btn btn-ghost btn-sm"
              >全选</button>
              <button onClick={delSelected} disabled={!selected.size || busy} className="btn btn-danger btn-sm border-rose-300/50">
                <Trash2 size={13} /> 删除
              </button>
              <button onClick={() => { setSelecting(false); setSelected(new Set()) }} className="btn btn-sm">取消</button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* 拖拽全屏遮罩：挂到 body，避免被祖先的 backdrop-filter / transform 困住 */}
      {mounted && createPortal(
        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-sky-50/70 p-6 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.88, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                data-active="true"
                className="liquid-strong grad-border flex h-56 w-56 items-center justify-center rounded-[2.25rem]"
              >
                <span className="pulse-ring flex h-20 w-20 items-center justify-center rounded-full" style={{ background: 'var(--grad-soft)' }}>
                  <ArrowDownToLine size={34} className="text-indigo-600" />
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

/** 取件码:输入对方给的 7 位码,直达分享页 */
function Pickup() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const go = (e: React.FormEvent) => {
    e.preventDefault()
    const c = code.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (c) router.push(`/s/${c}`)
  }
  return (
    <form onSubmit={go} className="enter liquid rounded-3xl p-4" style={{ ['--i' as string]: 1 }}>
      <label className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-medium text-slate-700" htmlFor="pickup">
        <Hash size={14} className="text-indigo-500" /> 取件码
      </label>
      <div className="flex gap-2">
        <input
          id="pickup"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="输入 7 位取件码"
          maxLength={32}
          autoComplete="off"
          className="field h-10 font-mono tracking-widest"
        />
        <button className="btn btn-primary shine h-10 w-10 shrink-0 p-0" disabled={!code.trim()} aria-label="取件" title="取件">
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  )
}

/** 我的临时文件:带倒计时进度条与续期 */
function MineRow({ file, now, busy, onShare, onPreview, onExtend, onDelete }: {
  file: FileRow; now: number | null; busy: boolean
  onShare: () => void; onPreview: () => void; onExtend: () => void; onDelete: () => void
}) {
  const kind = fileKind(file.mime, file.originalName)
  const Icon = ICONS[kind] ?? FileIcon
  const [copied, setCopied] = useState(false)
  const [broken, setBroken] = useState(false)
  const exp = file.expiresAt ? new Date(file.expiresAt).getTime() : null
  const total = exp ? Math.max(DAY, exp - new Date(file.createdAt).getTime()) : DAY
  const left = exp && now ? exp - now : null
  const pct = left === null ? 100 : Math.max(0, Math.min(100, (left / total) * 100))
  const urgent = left !== null && left < 3 * 3600 * 1000
  const thumb = kind === 'image' && !file.locked && !broken

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}
      transition={{ duration: 0.4, ease: EASE }}
      className="liquid liquid-hover rounded-2xl p-3"
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onPreview}
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white bg-white/70 shadow-sm"
          aria-label="预览"
        >
          {thumb ? (
            <img src={thumbUrl(file, 240)} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
          ) : (
            <Icon size={22} strokeWidth={1.5} className="text-indigo-500" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-slate-800" title={file.originalName}>{file.originalName}</p>
          <div className="num mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-slate-500">
            <span>{formatBytes(file.size)}</span>
            {file.shareCode && <span className="font-mono tracking-wider text-indigo-600" title="取件码">{file.shareCode}</span>}
            {left !== null && (
              <span className={cn('flex items-center gap-1', urgent && 'text-amber-600')}>
                <Clock size={11} /> {formatLeft(left)}
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-900/[0.07]">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${pct}%`, background: urgent ? 'linear-gradient(90deg,#fbbf24,#f97316)' : 'var(--grad)' }}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center">
          {file.shareCode && (
            <>
              <button
                onClick={async () => { if (await copyText(`${location.origin}/s/${file.shareCode}`)) { setCopied(true); setTimeout(() => setCopied(false), 1500) } }}
                className="btn btn-ghost h-10 w-10 p-0" aria-label="复制链接" title="复制链接"
              >
                {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
              </button>
              <button onClick={onShare} className="btn btn-ghost hidden h-10 w-10 p-0 sm:flex" aria-label="二维码" title="二维码"><QrCode size={15} /></button>
            </>
          )}
          <button onClick={onExtend} disabled={busy} className="btn btn-ghost h-10 w-10 p-0" aria-label="续期 24 小时" title="续期 24 小时"><TimerReset size={15} /></button>
          <a href={downloadHref(file)} className="btn btn-ghost hidden h-10 w-10 p-0 sm:flex" aria-label="下载" title="下载"><Download size={15} /></a>
          <button onClick={onDelete} disabled={busy} className="btn btn-ghost btn-danger h-10 w-10 p-0" aria-label="删除" title="删除"><Trash2 size={15} /></button>
        </div>
      </div>
    </motion.div>
  )
}

function eta(task: Task) {
  if (task.state !== 'uploading' || task.speed <= 0) return ''
  const s = Math.ceil((task.file.size - task.sentBytes) / task.speed)
  if (!Number.isFinite(s) || s <= 0) return ''
  return s >= 3600 ? `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
}

function UploadRow({ task, onPause, onResume, onCancel }: {
  task: Task; onPause: (id: string) => void; onResume: (id: string) => void; onCancel: (id: string) => void
}) {
  const done = task.state === 'done'
  const err = task.state === 'error'
  const paused = task.state === 'paused'
  const uploading = task.state === 'uploading'
  const [copied, setCopied] = useState(false)
  const left = eta(task)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="rounded-2xl px-2.5 py-2 transition-colors hover:bg-white/60"
    >
      <div className="flex items-center gap-2.5">
        <span className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border',
          done ? 'border-emerald-300/60 bg-emerald-400/15 text-emerald-600'
            : err ? 'border-rose-300/60 bg-rose-400/15 text-rose-600'
            : paused ? 'border-amber-300/60 bg-amber-300/20 text-amber-700'
            : 'border-white bg-white/80 text-sky-600',
        )}>
          {done ? <Check size={14} />
            : err ? <X size={14} />
            : paused ? <Pause size={13} />
            : task.state === 'hashing' ? <Fingerprint size={14} className="animate-pulse" />
            : <FileIcon size={14} />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] text-slate-800" title={task.file.name}>{task.file.name}</span>
            {task.instant && (
              <span className="flex shrink-0 items-center gap-0.5 rounded-md border border-sky-300/50 bg-sky-400/15 px-1.5 py-0.5 text-[10px] text-sky-700" title="秒传">
                <Zap size={9} /> ✓
              </span>
            )}
          </div>
          <div className="num mt-0.5 flex items-center gap-1.5 text-[10.5px] text-slate-500">
            <span>{formatBytes(task.file.size)}</span>
            {uploading && task.speed > 0 && <span>· {formatBytes(task.speed)}/s</span>}
            {left && <span>· 剩 {left}</span>}
            {done && task.shareCode && <span className="font-mono tracking-wider text-indigo-600">· {task.shareCode}</span>}
            {err && <span className="truncate text-rose-600" title={task.error}>· {task.error}</span>}
            {!done && !err && <span className="ml-auto">{Math.round(task.progress)}%</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center">
          {done && task.shareCode && (
            <button
              onClick={async () => { if (await copyText(`${location.origin}/s/${task.shareCode}`)) { setCopied(true); setTimeout(() => setCopied(false), 1500) } }}
              className="btn btn-ghost h-10 w-10 p-0" aria-label="复制链接" title="复制链接"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            </button>
          )}
          {uploading && (
            <button onClick={() => onPause(task.id)} className="btn btn-ghost h-10 w-10 p-0" aria-label="暂停" title="暂停"><Pause size={13} /></button>
          )}
          {(paused || err) && (
            <button onClick={() => onResume(task.id)} className="btn btn-ghost h-10 w-10 p-0" aria-label="继续" title="继续"><Play size={13} /></button>
          )}
          {!done && (
            <button onClick={() => onCancel(task.id)} className="btn btn-ghost btn-danger h-10 w-10 p-0" aria-label="取消" title="取消"><X size={13} /></button>
          )}
        </div>
      </div>

      {!done && !err && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-900/[0.07]">
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

function FileCard({ file, idx, now, selecting, selected, onToggle, onShare, onPreview, onDelete }: {
  file: FileRow; idx: number; now: number | null
  selecting: boolean; selected: boolean; onToggle: () => void
  onShare: () => void; onPreview: () => void; onDelete: () => void
}) {
  const kind = fileKind(file.mime, file.originalName)
  const Icon = ICONS[kind] ?? FileIcon
  const [broken, setBroken] = useState(false)
  const showThumb = kind === 'image' && !file.locked && !broken
  const canPreview = !file.locked && PREVIEWABLE.has(kind)
  const left = file.expiresAt && now ? new Date(file.expiresAt).getTime() - now : null
  const expiring = left !== null && left < 6 * 3600 * 1000
  // 有像素尺寸就预留好高度,图片加载完不会把瀑布流顶得跳动
  const ratio = file.width && file.height ? Math.min(2.2, Math.max(0.6, file.width / file.height)) : null

  return (
    <div className="enter" style={{ ['--i' as string]: Math.min(idx, 10) }}>
      <article
        onClick={selecting ? onToggle : undefined}
        className={cn(
          'liquid liquid-hover spotlight group relative rounded-2xl p-2 transition-transform duration-300 hover:-translate-y-0.5',
          selecting && file.canDelete && 'cursor-pointer',
          selected && 'ring-2 ring-indigo-400/70 ring-offset-2 ring-offset-white',
        )}
      >
        {selecting && file.canDelete && (
          <span className={cn(
            'absolute left-4 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors',
            selected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-white bg-white/80 text-transparent shadow',
          )}>
            <Check size={13} strokeWidth={3} />
          </span>
        )}

        {showThumb ? (
          <button
            onClick={selecting ? undefined : onPreview}
            className="relative block w-full cursor-zoom-in overflow-hidden rounded-xl bg-slate-900/[0.04]"
            style={ratio ? { aspectRatio: String(ratio) } : { minHeight: 96 }}
            aria-label="预览"
          >
            <img
              src={thumbUrl(file, 480)}
              alt=""
              loading="lazy"
              decoding="async"
              width={file.width ?? undefined}
              height={file.height ?? undefined}
              onError={() => setBroken(true)}
              className={cn('block w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]', ratio ? 'h-full' : 'max-h-72')}
            />
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/35 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          </button>
        ) : (
          <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-xl border border-white/80 bg-[radial-gradient(90%_90%_at_30%_10%,rgba(56,189,248,0.18),rgba(167,139,250,0.14)_55%,transparent)]">
            <Icon size={28} strokeWidth={1.5} className="text-indigo-500 transition-transform duration-500 group-hover:scale-110" />
            {file.locked && (
              <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-lg border border-amber-300/60 bg-amber-100/80 text-amber-700" title="口令" aria-label="口令">
                <Lock size={11} />
              </span>
            )}
          </div>
        )}

        <div className="px-1.5 pb-0.5 pt-2.5">
          <p className="truncate text-[13px] text-slate-800" title={file.originalName}>{file.originalName}</p>
          <div className="num mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-slate-400">
            <span>{formatBytes(file.size)}</span>
            {file.downloads > 0 && <span className="flex items-center gap-0.5" title="下载"><ArrowDownToLine size={10} />{file.downloads}</span>}
            {left !== null && (
              <span
                className={cn(
                  'flex items-center gap-0.5 rounded-md border px-1.5 py-0.5',
                  expiring ? 'border-amber-300/60 bg-amber-100/70 text-amber-700' : 'border-slate-900/10 bg-white/60',
                )}
                title="剩余"
              >
                <Clock size={9} /> {formatLeft(left)}
              </span>
            )}
          </div>
        </div>

        {!selecting && (
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
            {file.canDelete && (
              <button onClick={onDelete} className="btn btn-ghost btn-danger h-10 w-10 p-0" aria-label="删除" title="删除"><Trash2 size={14} /></button>
            )}
          </div>
        )}
      </article>
    </div>
  )
}

function ShareModal({ file, onClose }: { file: FileRow | null; onClose: () => void }) {
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const now = useNow(60_000)
  const link = useMemo(() => {
    if (!file?.shareCode) return ''
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/s/${file.shareCode}`
  }, [file])

  useEffect(() => {
    // 先清空：弹窗是常驻挂载的，不清就会在生成新码期间继续显示上一个文件的二维码
    setQr('')
    setCopied(false)
    if (!link) return
    let cancelled = false
    import('qrcode').then((m) => m.toDataURL(link, {
      width: 320, margin: 1,
      color: { dark: '#312e81ff', light: '#ffffffff' },
    })).then((url) => { if (!cancelled) setQr(url) }).catch(() => { if (!cancelled) setQr('') })
    // 快速切换文件时，先发起的那个 promise 可能后回来，用标志位丢弃它的结果
    return () => { cancelled = true }
  }, [link])

  const left = file?.expiresAt && now ? new Date(file.expiresAt).getTime() - now : null

  return (
    <Modal
      open={!!file}
      onClose={onClose}
      className="max-w-sm"
      title={file && (
        <span className="flex min-w-0 items-center gap-2">
          <Link2 size={15} className="shrink-0 text-sky-600" />
          <span className="truncate text-[13.5px] text-slate-800">{file.originalName}</span>
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
                  <div className="shimmer h-[176px] w-[176px] rounded-xl bg-slate-900/[0.05]" />
                )}
              </div>
            </div>

            <div className="text-center">
              <div className="text-[11.5px] text-slate-500">取件码</div>
              <div className="num select-all font-mono text-2xl font-semibold tracking-[0.2em] text-grad">{file.shareCode}</div>
            </div>

            <div className="flex items-center gap-1.5">
              <input readOnly value={link} aria-label="链接" className="field h-10 min-w-0 font-mono text-[12px]" onFocus={(e) => e.target.select()} />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={async () => {
                  if (await copyText(link)) { setCopied(true); setTimeout(() => setCopied(false), 1600) }
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

            <div className="num flex items-center justify-center gap-3 text-[11px] text-slate-500">
              <span>{formatBytes(file.size)}</span>
              <span className="flex items-center gap-1" title={file.expiresAt ? '剩余' : '长期'}>
                <Clock size={11} />
                {file.expiresAt ? (left !== null ? formatLeft(left) : '…') : <InfinityIcon size={12} />}
              </span>
              {file.locked && <span className="flex items-center text-amber-700" title="口令"><Lock size={11} /></span>}
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
        <Icon size={15} className="shrink-0 text-sky-600" />
        <span className="truncate text-[13px] text-slate-700">{file.originalName}</span>
      </span>
    }>
      <div className="max-h-[76vh] overflow-auto">
        {file.locked ? (
          <EmptyState icon={<Lock size={26} />} />
        ) : kind === 'image' ? (
          <img src={src} alt={file.originalName} className="mx-auto max-h-[68vh] rounded-xl" />
        ) : kind === 'pdf' ? (
          <iframe src={src} className="h-[68vh] w-full rounded-xl border border-slate-900/10 bg-white" title={file.originalName} />
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
