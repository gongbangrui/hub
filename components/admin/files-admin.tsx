'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { m as motion, AnimatePresence } from 'framer-motion'
import {
  UploadCloud, File as FileIcon, ImageIcon, FileArchive, FileText, Film, Music, Code2, Table2,
  Link2, Download, Trash2, Infinity as InfinityIcon, Lock, Pause, Play, X, Check, Plus,
  Eraser, ArrowDown, ArrowUp, Loader2, FolderOpen, SearchX, HardDrive, Hourglass, TimerOff,
  Paperclip, Clock, Layers, Zap, Hash,
} from 'lucide-react'
import { cn, formatBytes, fileKind } from '@/lib/utils'
import { fileUrl } from '@/lib/file-url'
import { useUploader } from '@/hooks/use-uploader'
import type { Task } from '@/lib/upload-client'
import { EmptyState, Modal } from '@/components/ui/primitives'
import {
  AdminTitle, Toolbar, SearchInput, Checkbox, useSelection, BulkBar,
  AdminTable, Th, Td, Tr, toast, api, useMutate,
} from '@/components/admin/ui'

const EASE = [0.22, 1, 0.36, 1] as const

/** 行内图标按钮：移动端 40px 触控，桌面收紧 */
const ICON_BTN = 'btn btn-ghost btn-sm h-10 w-10 p-0 md:h-8 md:w-8'

export type AdminFile = {
  id: number
  /** 随机下载令牌；缺省时回退数字 id（仅登录可用） */
  token?: string
  name: string
  mime: string
  size: number
  owner: 'guest' | 'admin'
  shareCode: string | null
  locked: boolean
  downloads: number
  expiresAt: number | null
  createdAt: number
  refs: number
}

type Scope = 'all' | 'mine' | 'guest' | 'expired'
type KindFilter = 'all' | 'image' | 'doc' | 'archive' | 'other'
type SortKey = 'time' | 'size' | 'downloads'
type Ask = { kind: 'delete'; ids: number[] } | { kind: 'purge' } | null

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'mine', label: '我的' },
  { key: 'guest', label: '访客' },
  { key: 'expired', label: '过期' },
]

const KINDS: { key: KindFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: '全部类型', icon: <Layers size={14} /> },
  { key: 'image', label: '图片', icon: <ImageIcon size={14} /> },
  { key: 'doc', label: '文档', icon: <FileText size={14} /> },
  { key: 'archive', label: '压缩包', icon: <FileArchive size={14} /> },
  { key: 'other', label: '其他', icon: <FileIcon size={14} /> },
]

const ICONS: Record<string, { icon: React.ElementType; cls: string }> = {
  image: { icon: ImageIcon, cls: 'text-violet-600' },
  pdf: { icon: FileText, cls: 'text-rose-600' },
  doc: { icon: FileText, cls: 'text-sky-600' },
  sheet: { icon: Table2, cls: 'text-emerald-600' },
  archive: { icon: FileArchive, cls: 'text-amber-700' },
  code: { icon: Code2, cls: 'text-indigo-500' },
  video: { icon: Film, cls: 'text-blue-300' },
  audio: { icon: Music, cls: 'text-violet-600' },
  other: { icon: FileIcon, cls: 'text-slate-900/45' },
}

const kindGroup = (k: string): KindFilter =>
  k === 'image' ? 'image' : k === 'pdf' || k === 'doc' || k === 'sheet' ? 'doc' : k === 'archive' ? 'archive' : 'other'

const isExpired = (f: AdminFile, now: number) => f.expiresAt !== null && f.expiresAt <= now

function scopeOf(f: AdminFile, now: number): Exclude<Scope, 'all'> {
  if (isExpired(f, now)) return 'expired'
  return f.owner === 'guest' ? 'guest' : 'mine'
}

/** 剩余时间：3d / 5h / 12m */
function left(ms: number) {
  if (ms >= 86400000) return `${Math.floor(ms / 86400000)}d`
  if (ms >= 3600000) return `${Math.floor(ms / 3600000)}h`
  return `${Math.max(1, Math.floor(ms / 60000))}m`
}

const pad = (n: number) => String(n).padStart(2, '0')
function fmtTime(ms: number, now: number) {
  const d = new Date(ms)
  if (d.getFullYear() !== new Date(now).getFullYear()) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 非 https 环境下 clipboard 不可用
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

export function FilesAdmin({ files, used, disk, now: serverNow, autoPick }: {
  files: AdminFile[]
  used: number
  disk: { total: number; free: number } | null
  now: number
  autoPick?: boolean
}) {
  const router = useRouter()
  const { run, pending } = useMutate()
  const [now, setNow] = useState(serverNow)
  const [scope, setScope] = useState<Scope>('all')
  const [kind, setKind] = useState<KindFilter>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'time', asc: false })
  const [ask, setAsk] = useState<Ask>(null)
  const [preview, setPreview] = useState<AdminFile | null>(null)
  const [flash, setFlash] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [serverNow])

  /* ---------- 上传 ---------- */

  const { tasks, start, pause, resume, cancel, clearFinished } = useUploader(() => router.refresh())
  const busyTasks = tasks.filter((t) => t.state !== 'done').length

  // 全部完成后稍等片刻收起队列
  useEffect(() => {
    if (!tasks.length || busyTasks) return
    const t = setTimeout(clearFinished, 2400)
    return () => clearTimeout(t)
  }, [tasks.length, busyTasks, clearFinished])

  const pick = useCallback(() => inputRef.current?.click(), [])
  const dragging = useWindowDrop((fs) => void start(fs))

  // ?new=1：自动打开选择器并去掉参数
  useEffect(() => {
    if (!autoPick) return
    setFlash(true)
    pick()
    window.history.replaceState(null, '', '/admin/files')
    const t = setTimeout(() => setFlash(false), 1800)
    return () => clearTimeout(t)
  }, [autoPick, pick])

  /* ---------- 统计 ---------- */

  const stats = useMemo(() => {
    const s = { mine: { n: 0, b: 0 }, guest: { n: 0, b: 0 }, expired: { n: 0, b: 0 } }
    for (const f of files) {
      const k = scopeOf(f, now)
      s[k].n++
      s[k].b += f.size
    }
    return s
  }, [files, now])

  /* ---------- 筛选 ---------- */

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const out = files.filter((f) => {
      if (scope !== 'all' && scopeOf(f, now) !== scope) return false
      if (kind !== 'all' && kindGroup(fileKind(f.mime, f.name)) !== kind) return false
      if (kw && !f.name.toLowerCase().includes(kw) && !(f.shareCode ?? '').includes(kw)) return false
      return true
    })
    const val = (f: AdminFile) => (sort.key === 'size' ? f.size : sort.key === 'downloads' ? f.downloads : f.createdAt)
    return out.sort((a, b) => (sort.asc ? val(a) - val(b) : val(b) - val(a)) || b.id - a.id)
  }, [files, scope, kind, q, sort, now])

  const sel = useSelection(list)
  const byId = useMemo(() => new Map(files.map((f) => [f.id, f])), [files])
  const picked = useMemo(() => [...sel.selected].map((id) => byId.get(id)).filter(Boolean) as AdminFile[], [sel.selected, byId])
  const keepable = picked.filter((f) => f.expiresAt !== null)

  /* ---------- 写操作 ---------- */

  const rename = (f: AdminFile, name: string) =>
    run(() => api(`/api/files/${f.id}`, { method: 'PATCH', body: { originalName: name } }), '已重命名')

  const keep = (ids: number[]) =>
    run(
      () => Promise.all(ids.map((id) => api(`/api/files/${id}`, { method: 'PATCH', body: { keep: true } }))),
      ids.length > 1 ? `∞ ${ids.length}` : '∞',
    )

  async function remove(ids: number[]) {
    const r = await run(
      () => Promise.all(ids.map((id) => api(`/api/files/${id}`, { method: 'DELETE' }))),
      ids.length > 1 ? `已删除 ${ids.length}` : '已删除',
    )
    if (r) sel.clear()
    setAsk(null)
  }

  async function purge() {
    const r = await run(() => api<{ removed: number; bytes: number }>('/api/files/purge', { method: 'POST' }))
    if (r) toast(r.removed ? `✓ ${r.removed} · ${formatBytes(r.bytes)}` : '∅', r.removed ? 'ok' : 'info')
    setAsk(null)
  }

  async function copyLink(f: AdminFile) {
    if (!f.shareCode) return toast('∅', 'err')
    await copyText(`${location.origin}/s/${f.shareCode}`)
    toast('已复制')
  }

  const counts: Record<Scope, number> = {
    all: files.length, mine: stats.mine.n, guest: stats.guest.n, expired: stats.expired.n,
  }

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: false }))

  return (
    <div>
      <AdminTitle
        title="文件"
        count={files.length}
        actions={
          <button onClick={pick} className="btn btn-primary shine h-10 w-10 p-0" aria-label="上传" title="上传">
            <Plus size={17} strokeWidth={2.4} />
          </button>
        }
      />

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? [])
          if (fs.length) void start(fs)
          e.target.value = ''
        }}
      />

      {/* 便当：存储 + 上传 */}
      <motion.div
        className="mb-4 grid gap-3 md:grid-cols-[1.4fr_1fr]"
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      >
        <motion.div variants={RISE}>
          <StorageCard used={used} disk={disk} stats={stats} onPurge={() => setAsk({ kind: 'purge' })} />
        </motion.div>
        <motion.div variants={RISE}>
          <DropZone onPick={pick} active={dragging || flash} />
        </motion.div>
      </motion.div>

      <UploadQueue tasks={tasks} onPause={pause} onResume={resume} onCancel={cancel} />

      {/* 工具条 */}
      <Toolbar>
        <Segmented
          id="files-scope"
          value={scope}
          onChange={setScope}
          items={SCOPES.map((s) => ({
            ...s,
            badge: counts[s.key],
            danger: s.key === 'expired' && counts.expired > 0,
          }))}
        />
        <Segmented id="files-kind" value={kind} onChange={setKind} items={KINDS} />
        <SearchInput value={q} onChange={setQ} placeholder="搜索" />
      </Toolbar>

      {/* 表格 */}
      <AdminTable
        className="liquid rounded-3xl"
        empty={
          files.length === 0 ? (
            <EmptyState
              icon={<FolderOpen size={30} />}
              action={
                <button onClick={pick} className="btn btn-primary shine h-10 w-10 p-0" aria-label="上传" title="上传">
                  <Plus size={17} strokeWidth={2.4} />
                </button>
              }
            />
          ) : list.length === 0 ? (
            <EmptyState icon={<SearchX size={28} />} />
          ) : undefined
        }
        head={
          <>
            <Th className="w-10">
              <Checkbox checked={sel.allChecked} indeterminate={sel.someChecked} onChange={sel.toggleAll} />
            </Th>
            <Th>文件</Th>
            <SortTh k="size" sort={sort} onSort={toggleSort} className="hidden sm:table-cell" label="大小">大小</SortTh>
            <Th className="hidden sm:table-cell">归属</Th>
            <SortTh k="downloads" sort={sort} onSort={toggleSort} className="hidden md:table-cell" label="下载">
              <Download size={12} />
            </SortTh>
            <Th className="hidden lg:table-cell" title="分享码"><Hash size={12} /></Th>
            <SortTh k="time" sort={sort} onSort={toggleSort} className="hidden md:table-cell" label="时间">
              <Clock size={12} />
            </SortTh>
            <Th className="w-[1%]" />
          </>
        }
      >
        {list.map((f) => (
          <FileTr
            key={f.id}
            file={f}
            now={now}
            selected={sel.selected.has(f.id)}
            pending={pending}
            onToggle={() => sel.toggle(f.id)}
            onRename={(name) => rename(f, name)}
            onPreview={() => setPreview(f)}
            onCopy={() => copyLink(f)}
            onKeep={() => keep([f.id])}
            onDelete={() => setAsk({ kind: 'delete', ids: [f.id] })}
          />
        ))}
      </AdminTable>

      <BulkBar count={sel.selected.size} onClear={sel.clear}>
        {keepable.length > 0 && (
          <button
            onClick={() => keep(keepable.map((f) => f.id))}
            disabled={pending}
            className="btn btn-sm h-9 px-2.5"
            aria-label="设为永久" title="设为永久"
          >
            <InfinityIcon size={14} /> <span className="num opacity-70">{keepable.length}</span>
          </button>
        )}
        <button
          onClick={() => setAsk({ kind: 'delete', ids: [...sel.selected] })}
          disabled={pending}
          className="btn btn-danger btn-sm h-9 w-9 p-0"
          aria-label="删除" title="删除"
        >
          <Trash2 size={14} />
        </button>
      </BulkBar>

      <ConfirmModal
        ask={ask}
        byId={byId}
        expired={stats.expired}
        pending={pending}
        onClose={() => setAsk(null)}
        onDelete={remove}
        onPurge={purge}
      />

      <Modal open={!!preview} onClose={() => setPreview(null)} className="max-w-3xl">
        {preview && (
          <div className="space-y-3">
            <img
              src={fileUrl(preview, true)}
              alt={preview.name}
              className="mx-auto max-h-[70vh] rounded-2xl object-contain"
            />
            <div className="flex items-center justify-center gap-2">
              <p className="min-w-0 truncate text-[12.5px] text-slate-900/50">{preview.name}</p>
              <a href={fileUrl(preview)} className={ICON_BTN} aria-label="下载" title="下载">
                <Download size={14} />
              </a>
            </div>
          </div>
        )}
      </Modal>

      <DragOverlay on={dragging} />
    </div>
  )
}

const RISE = {
  hidden: { opacity: 0, y: 14, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: EASE } },
}

/* ---------- 存储占用 ---------- */

function StorageCard({ used, disk, stats, onPurge }: {
  used: number
  disk: { total: number; free: number } | null
  stats: Record<'mine' | 'guest' | 'expired', { n: number; b: number }>
  onPurge: () => void
}) {
  const sum = stats.mine.b + stats.guest.b + stats.expired.b || 1
  const segs = [
    { key: 'mine', label: '永久', icon: InfinityIcon, cls: 'from-sky-300 to-indigo-400', dot: 'text-sky-600', ...stats.mine },
    { key: 'guest', label: '临时', icon: Hourglass, cls: 'from-indigo-400 to-purple-400', dot: 'text-violet-600', ...stats.guest },
    { key: 'expired', label: '已过期', icon: TimerOff, cls: 'from-rose-400 to-rose-500', dot: 'text-rose-600', ...stats.expired },
  ]
  const diskPct = disk && disk.total ? Math.round(((disk.total - disk.free) / disk.total) * 100) : null

  return (
    <div className="liquid spotlight relative h-full overflow-hidden rounded-3xl p-5">
      <div className="pointer-events-none absolute -left-14 -top-14 h-40 w-40 rounded-full bg-gradient-to-br from-sky-400/25 via-indigo-400/10 to-transparent blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-gradient-to-tl from-purple-400/20 to-transparent blur-2xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-900/10 bg-slate-900/5 text-indigo-500" title="存储">
            <HardDrive size={17} />
          </span>
          <div>
            <p className="num text-grad text-[28px] font-semibold leading-none tracking-tight">{formatBytes(used)}</p>
            {disk && (
              <p className="num mt-1.5 text-[11.5px] text-slate-900/40" title="磁盘剩余">
                <span className="text-slate-900/60">{formatBytes(disk.free)}</span> / {formatBytes(disk.total)}
                {diskPct !== null && <span className="ml-1.5 text-slate-900/40">· {diskPct}%</span>}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onPurge}
          className={cn('btn btn-sm h-10 min-w-10 px-2.5', stats.expired.n > 0 ? 'btn-danger' : 'btn-ghost')}
          aria-label="清理过期"
          title="清理过期"
        >
          <Eraser size={14} />
          {stats.expired.n > 0 && <span className="num opacity-80">{stats.expired.n}</span>}
        </button>
      </div>

      <div className="relative mt-5 flex h-2 gap-[2px] overflow-hidden rounded-full bg-slate-900/6">
        {segs.map((s, i) => (
          <motion.div
            key={s.key}
            className={cn('h-full bg-gradient-to-r first:rounded-l-full last:rounded-r-full', s.cls)}
            initial={{ width: 0 }}
            animate={{ width: `${(s.b / sum) * 100}%` }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.1 + 0.06 * i }}
          />
        ))}
      </div>

      <div className="relative mt-3.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[11.5px]">
        {segs.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-slate-900/45" title={s.label}>
            <s.icon size={12} className={s.dot} aria-label={s.label} />
            <span className="num text-slate-900/80">{s.n}</span>
            <span className="num text-slate-900/40">{formatBytes(s.b)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------- 上传区 ---------- */

function DropZone({ onPick, active }: { onPick: () => void; active: boolean }) {
  return (
    <motion.button
      type="button"
      onClick={onPick}
      whileTap={{ scale: 0.98 }}
      aria-label="上传"
      title="上传"
      data-active={active}
      className={cn(
        'liquid liquid-hover grad-border spotlight group relative flex h-full min-h-[148px] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-dashed px-5',
        active && 'bg-indigo-400/[0.08]',
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_100%,rgb(129_140_248/0.16),transparent_70%)] opacity-60 transition-opacity duration-500 group-hover:opacity-100" />
      <motion.span
        animate={active ? { scale: 1.12, y: -3 } : { scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        className={cn(
          'relative flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-900/10 bg-slate-900/5 transition-colors',
          active ? 'pulse-ring border-indigo-300/50' : 'group-hover:border-indigo-300/35',
        )}
      >
        <UploadCloud size={24} className={cn('text-slate-600 transition-colors group-hover:text-slate-900', active && 'text-sky-600')} />
      </motion.span>
    </motion.button>
  )
}

/** 整页接收拖拽；用计数器避免子元素冒泡导致闪烁 */
function useWindowDrop(onFiles: (f: File[]) => void) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const cb = useRef(onFiles)
  cb.current = onFiles

  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      depth.current++
      setDragging(true)
    }
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1)
      if (!depth.current) setDragging(false)
    }
    const over = (e: DragEvent) => e.preventDefault()
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      const fs = Array.from(e.dataTransfer?.files ?? [])
      if (fs.length) cb.current(fs)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return dragging
}

function DragOverlay({ on }: { on: boolean }) {
  return (
    <AnimatePresence>
      {on && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: EASE }}
          className="pointer-events-none fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/[0.04] backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="liquid-strong grad-border flex h-40 w-40 items-center justify-center rounded-[2rem]"
            data-active="true"
          >
            <span className="pulse-ring flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900/5">
              <ArrowDown size={30} className="text-sky-600" />
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- 上传队列 ---------- */

const TASK_TEXT: Record<Task['state'], string> = {
  queued: '…', hashing: '#', uploading: '', paused: '‖', done: '✓', error: '✕',
}

function UploadQueue({ tasks, onPause, onResume, onCancel }: {
  tasks: Task[]
  onPause: (id: string) => void
  onResume: (id: string) => void
  onCancel: (id: string) => void
}) {
  return (
    <AnimatePresence initial={false}>
      {tasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.32, ease: EASE }}
          className="overflow-hidden"
        >
          <div className="liquid mb-4 divide-y divide-slate-900/5 rounded-3xl px-1.5 py-1">
            <AnimatePresence initial={false}>
              {tasks.map((t) => {
                const done = t.state === 'done'
                const err = t.state === 'error'
                return (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.28, ease: EASE }}
                    className="relative flex items-center gap-3 px-2.5 py-2"
                  >
                    <span className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      done ? 'bg-emerald-400/15 text-emerald-600' : err ? 'bg-rose-400/15 text-rose-600' : 'bg-indigo-400/10 text-indigo-500',
                    )}>
                      {done ? <Check size={13} /> : err ? <X size={13} /> : t.state === 'paused' ? <Pause size={12} /> : <Loader2 size={13} className="animate-spin" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-900/75">{t.file.name}</span>
                    <span className={cn('hidden shrink-0 items-center gap-1 text-[11px] sm:flex', err ? 'text-rose-600' : 'text-slate-900/40')}>
                      {err ? t.error : t.instant && done ? <Zap size={11} className="text-amber-700" aria-label="秒传" /> : TASK_TEXT[t.state]}
                      {t.state === 'uploading' && t.speed > 0 && <span className="num">{formatBytes(t.speed)}/s</span>}
                    </span>
                    <span className="num w-10 shrink-0 text-right text-[11px] text-slate-900/55">{Math.round(t.progress)}%</span>
                    <span className="flex shrink-0 justify-end gap-0.5">
                      {t.state === 'uploading' && (
                        <button onClick={() => onPause(t.id)} className={ICON_BTN} aria-label="暂停" title="暂停"><Pause size={12} /></button>
                      )}
                      {(t.state === 'paused' || err) && (
                        <button onClick={() => onResume(t.id)} className={ICON_BTN} aria-label="继续" title="继续"><Play size={12} /></button>
                      )}
                      {!done && (
                        <button onClick={() => onCancel(t.id)} className={ICON_BTN} aria-label="取消" title="取消"><X size={12} /></button>
                      )}
                    </span>
                    {!done && !err && (
                      <div className="absolute inset-x-2.5 bottom-0 h-[2px] overflow-hidden rounded-full bg-slate-900/5">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-sky-300 via-indigo-400 to-purple-400"
                          animate={{ width: `${t.progress}%` }}
                          transition={{ duration: 0.3, ease: EASE }}
                        />
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- 工具条控件 ---------- */

function Segmented<T extends string>({ id, value, onChange, items }: {
  id: string
  value: T
  onChange: (v: T) => void
  items: { key: T; label: string; icon?: React.ReactNode; badge?: number; danger?: boolean }[]
}) {
  return (
    <div className="flex max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-2xl border border-slate-900/7 bg-slate-900/2 p-0.5 [scrollbar-width:none]">
      {items.map((it) => {
        const active = it.key === value
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            aria-pressed={active}
            aria-label={it.icon ? it.label : undefined}
            title={it.icon ? it.label : undefined}
            className={cn(
              'relative flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-[14px] text-[12.5px] transition-colors duration-200',
              it.icon ? 'w-9' : 'px-3',
              active ? 'text-slate-900' : 'text-slate-900/45 hover:text-slate-900/80',
            )}
          >
            {active && (
              <motion.span
                layoutId={id}
                className="absolute inset-0 rounded-[14px] border border-indigo-300/30 shadow-[0_0_18px_-6px_rgb(129_140_248/0.7)]"
                style={{ background: 'var(--grad-soft)' }}
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {it.icon ?? it.label}
              {it.badge !== undefined && (
                <span className={cn('num text-[10.5px]', it.danger ? 'text-rose-600' : 'opacity-45')}>{it.badge}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function SortTh({ k, sort, onSort, className, label, children }: {
  k: SortKey
  sort: { key: SortKey; asc: boolean }
  onSort: (k: SortKey) => void
  className?: string
  label: string
  children: React.ReactNode
}) {
  const active = sort.key === k
  const Arrow = sort.asc ? ArrowUp : ArrowDown
  return (
    <Th className={className} aria-sort={active ? (sort.asc ? 'ascending' : 'descending') : undefined}>
      <button
        onClick={() => onSort(k)}
        title={label}
        aria-label={label}
        className={cn('label inline-flex items-center gap-1 hover:text-slate-900/80', active && 'text-slate-700')}
      >
        {children}
        <Arrow size={10} className={cn('transition-opacity', active ? 'opacity-80' : 'opacity-0')} />
      </button>
    </Th>
  )
}

/* ---------- 行 ---------- */

function FileTr({ file: f, now, selected, pending, onToggle, onRename, onPreview, onCopy, onKeep, onDelete }: {
  file: AdminFile
  now: number
  selected: boolean
  pending: boolean
  onToggle: () => void
  onRename: (name: string) => Promise<unknown>
  onPreview: () => void
  onCopy: () => void
  onKeep: () => void
  onDelete: () => void
}) {
  const expired = isExpired(f, now)

  return (
    <Tr selected={selected}>
      <Td className="w-10">
        <Checkbox checked={selected} onChange={onToggle} />
      </Td>

      <Td className="w-full min-w-[140px] max-w-0">
        <div className="flex min-w-0 items-center gap-3">
          <Thumb file={f} expired={expired} onPreview={onPreview} />
          <div className="min-w-0 flex-1">
            <NameCell name={f.name} onSave={onRename} />
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 sm:hidden">
              <span className="num text-[11px] text-slate-900/40">{formatBytes(f.size)}</span>
              <Owner file={f} now={now} expired={expired} />
              {f.shareCode && (
                <button
                  type="button"
                  onClick={onCopy}
                  className="inline-flex min-h-8 items-center gap-0.5 font-mono text-[11px] text-indigo-500"
                  aria-label="复制链接"
                >
                  <Link2 size={10} />{f.shareCode}
                </button>
              )}
            </div>
          </div>
          {f.refs > 0 && (
            <span
              title="引用"
              className="num inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-400/25 bg-indigo-400/10 px-1.5 py-0.5 text-[10.5px] text-indigo-500"
            >
              <Paperclip size={10} /> {f.refs}
            </span>
          )}
        </div>
      </Td>

      <Td className="num hidden whitespace-nowrap text-slate-900/60 sm:table-cell">{formatBytes(f.size)}</Td>

      <Td className="hidden whitespace-nowrap sm:table-cell">
        <Owner file={f} now={now} expired={expired} />
      </Td>

      <Td className="num hidden text-slate-900/60 md:table-cell">{f.downloads}</Td>

      <Td className="hidden whitespace-nowrap lg:table-cell">
        {f.shareCode ? (
          <span className="inline-flex items-center gap-1 font-mono text-[12px] text-slate-900/55">
            {f.shareCode}
            {f.locked && <Lock size={10} className="text-amber-700" aria-label="加密" />}
          </span>
        ) : <span className="text-slate-900/40">—</span>}
      </Td>

      <Td className="num hidden whitespace-nowrap text-[12.5px] text-slate-900/45 md:table-cell">
        <span suppressHydrationWarning>{fmtTime(f.createdAt, now)}</span>
      </Td>

      <Td>
        <div className="flex items-center justify-end gap-0.5 opacity-70 transition-opacity duration-200 group-hover:opacity-100">
          <IconBtn label="复制链接" onClick={onCopy} disabled={!f.shareCode} className="hidden sm:inline-flex">
            <Link2 size={13} />
          </IconBtn>
          {expired ? (
            <IconBtn label="已过期" disabled className="hidden sm:inline-flex"><Download size={13} /></IconBtn>
          ) : (
            <a href={fileUrl(f)} className={ICON_BTN} aria-label="下载" title="下载">
              <Download size={13} />
            </a>
          )}
          {f.expiresAt !== null && (
            <IconBtn label="设为永久" onClick={onKeep} disabled={pending} className="hover:text-sky-600">
              <InfinityIcon size={14} />
            </IconBtn>
          )}
          <IconBtn label="删除" onClick={onDelete} disabled={pending} className="btn-danger">
            <Trash2 size={13} />
          </IconBtn>
        </div>
      </Td>
    </Tr>
  )
}

function IconBtn({ label, onClick, disabled, className, children }: {
  label: string; onClick?: () => void; disabled?: boolean; className?: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(ICON_BTN, 'disabled:pointer-events-none disabled:opacity-30', className)}
    >
      {children}
    </button>
  )
}

function Thumb({ file: f, expired, onPreview }: { file: AdminFile; expired: boolean; onPreview: () => void }) {
  const [broken, setBroken] = useState(false)
  const kind = fileKind(f.mime, f.name)
  const { icon: Icon, cls } = ICONS[kind] ?? ICONS.other
  const img = kind === 'image' && !expired && !broken

  return (
    <span
      onClick={img ? onPreview : undefined}
      onKeyDown={img ? (e) => (e.key === 'Enter' || e.key === ' ') && onPreview() : undefined}
      role={img ? 'button' : undefined}
      tabIndex={img ? 0 : undefined}
      aria-label={img ? '预览' : undefined}
      className={cn(
        'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-900/8 bg-slate-900/4 transition-transform duration-300',
        img && 'cursor-zoom-in hover:scale-105',
        expired && 'opacity-50',
      )}
    >
      {img ? (
        <img
          src={fileUrl(f, true)}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Icon size={16} strokeWidth={1.8} className={cls} />
      )}
    </span>
  )
}

function NameCell({ name, onSave }: { name: string; onSave: (name: string) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false)
  const [shown, setShown] = useState(name)
  const [draft, setDraft] = useState(name)

  useEffect(() => { setShown(name) }, [name])

  async function commit() {
    const v = draft.trim()
    setEditing(false)
    if (!v || v === shown) return
    const prev = shown
    setShown(v)
    const r = await onSave(v)
    if (r === undefined) setShown(prev)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          // 默认只选中主文件名，不含扩展名
          const dot = e.target.value.lastIndexOf('.')
          e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setDraft(shown); setEditing(false) }
        }}
        aria-label="重命名"
        className="field h-8 px-2 py-0 text-[13px]"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(shown); setEditing(true) }}
      title={shown}
      className="block max-w-full truncate rounded-md text-left text-[13.5px] text-slate-900/85 decoration-indigo-300/40 underline-offset-4 hover:underline"
    >
      {shown}
    </button>
  )
}

function Owner({ file: f, now, expired }: { file: AdminFile; now: number; expired: boolean }) {
  const guest = f.owner === 'guest'
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn(
        'rounded-md border px-1.5 py-0.5 text-[11px]',
        guest ? 'border-amber-400/25 bg-amber-400/10 text-amber-700' : 'border-sky-400/25 bg-sky-400/10 text-sky-600',
      )}>
        {guest ? '访客' : '我'}
      </span>
      {expired ? (
        <span title="已过期" className="inline-flex text-rose-600"><TimerOff size={12} aria-label="已过期" /></span>
      ) : f.expiresAt !== null ? (
        <span
          title="剩余"
          className={cn('num inline-flex items-center gap-1 text-[11.5px]', f.expiresAt - now < 6 * 3600000 ? 'text-amber-700' : 'text-slate-900/40')}
        >
          <Hourglass size={10} /> {left(f.expiresAt - now)}
        </span>
      ) : null}
    </span>
  )
}

/* ---------- 确认 ---------- */

function ConfirmModal({ ask, byId, expired, pending, onClose, onDelete, onPurge }: {
  ask: Ask
  byId: Map<number, AdminFile>
  expired: { n: number; b: number }
  pending: boolean
  onClose: () => void
  onDelete: (ids: number[]) => void
  onPurge: () => void
}) {
  const del = ask?.kind === 'delete' ? ask.ids.map((id) => byId.get(id)).filter(Boolean) as AdminFile[] : []
  const refs = del.reduce((s, f) => s + f.refs, 0)
  const bytes = del.reduce((s, f) => s + f.size, 0)
  const purge = ask?.kind === 'purge'

  return (
    <Modal open={!!ask} onClose={onClose} className="max-w-sm">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/25 bg-rose-500/10 text-rose-600">
          {purge ? <Eraser size={20} /> : <Trash2 size={20} />}
        </span>
        <p className="text-[15px] font-medium text-slate-900/90">{purge ? '清理？' : '删除？'}</p>

        {purge ? (
          <p className="num text-[13px] text-slate-900/55">
            {expired.n ? <>{expired.n} · {formatBytes(expired.b)}</> : '∅'}
          </p>
        ) : del.length === 1 ? (
          <p className="max-w-full truncate text-[13px] text-slate-900/60">{del[0].name}</p>
        ) : (
          <p className="num text-[13px] text-slate-900/55">{del.length} · {formatBytes(bytes)}</p>
        )}

        {!purge && refs > 0 && (
          <p className="num flex items-center gap-1.5 text-[12.5px] text-rose-600" title="引用">
            <Paperclip size={12} /> {refs}
          </p>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <button onClick={onClose} className="btn btn-ghost h-10" aria-label="取消" title="取消">
          <X size={15} />
        </button>
        <button
          autoFocus
          disabled={pending}
          onClick={() => (purge ? onPurge() : onDelete(del.map((f) => f.id)))}
          className="btn btn-danger h-10"
          aria-label={purge ? '清理' : '删除'}
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}
        </button>
      </div>
    </Modal>
  )
}
