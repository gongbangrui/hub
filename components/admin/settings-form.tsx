'use client'
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Type, KeyRound, HardDrive, DatabaseBackup, Download, Eraser, Save, Undo2, FolderTree, Heading1, Heading2,
  Quote, PanelBottom, Lock, LockKeyhole, ShieldCheck, Database, Upload, Puzzle, Files, Ban, Check, Loader2,
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { AdminTitle, api, toast, useMutate } from '@/components/admin/ui'

const EASE = [0.22, 1, 0.36, 1] as const

type Copy = { site_title: string; site_subtitle: string; hero_line: string; footer_note: string }
type Storage = { root: string; db: number; uploads: number; chunks: number; files: number; expired: number }

export function SettingsForm({ copy, storage }: { copy: Copy; storage: Storage }) {
  return (
    <div>
      <AdminTitle title="设置" />
      <div className="split split-r items-start">
        <div className="min-w-0 space-y-4">
          <CopySection initial={copy} />
        </div>
        <div className="min-w-0 space-y-4">
          <PasswordSection />
          <StorageSection s={storage} />
          <BackupSection size={storage.db} />
        </div>
      </div>
    </div>
  )
}

/* ---------- 卡片外壳 ---------- */

function Card({ icon, title, i, children, className, extra }: {
  icon: React.ReactNode; title: string; i: number; children: React.ReactNode; className?: string; extra?: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.05 + i * 0.07 }}
      className={cn('liquid spotlight relative overflow-hidden rounded-3xl', className)}
    >
      <header className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3 sm:px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-indigo-200/15 bg-[image:var(--grad-soft)] text-sky-100">
          {icon}
        </span>
        <h2 className="text-[14px] font-medium text-white/90">{title}</h2>
        {extra && <div className="ml-auto flex items-center gap-1.5">{extra}</div>}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </motion.section>
  )
}

function Label({ icon, text, children }: { icon: React.ReactNode; text: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[12px] text-indigo-100/50">
        <span className="text-indigo-200/60">{icon}</span>
        {text}
      </span>
      {children}
    </label>
  )
}

/* ---------- ① 站点文案 ---------- */

const COPY_FIELDS: { key: keyof Copy; label: string; icon: React.ReactNode; long?: boolean }[] = [
  { key: 'site_title', label: '名称', icon: <Heading1 size={12} /> },
  { key: 'site_subtitle', label: '副标题', icon: <Heading2 size={12} /> },
  { key: 'hero_line', label: '主句', icon: <Quote size={12} />, long: true },
  { key: 'footer_note', label: '页脚', icon: <PanelBottom size={12} /> },
]

function CopySection({ initial }: { initial: Copy }) {
  const [base, setBase] = useState(initial)
  const [v, setV] = useState(initial)
  const { run, pending } = useMutate()
  const dirty = useMemo(() => COPY_FIELDS.some(({ key }) => v[key] !== base[key]), [v, base])

  const save = async () => {
    const ok = await run(() => api('/api/settings', { method: 'POST', body: v }), '已保存')
    if (ok) setBase(v)
  }

  return (
    <Card
      icon={<Type size={15} />}
      title="文案"
      i={0}
      extra={
        <>
          <AnimatePresence>
            {dirty && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.22, ease: EASE }}
                onClick={() => setV(base)}
                className="btn btn-ghost btn-icon h-10 w-10 p-0"
                aria-label="还原"
                title="还原"
              >
                <Undo2 size={15} />
              </motion.button>
            )}
          </AnimatePresence>
          <button
            onClick={save}
            disabled={!dirty || pending}
            className="btn btn-primary shine btn-icon h-10 w-10 p-0"
            aria-label="保存"
            title="保存"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          </button>
        </>
      }
    >
      <Preview v={v} />

      <div className="mt-5 grid gap-3.5 sm:grid-cols-2">
        {COPY_FIELDS.map(({ key, label, icon, long }) => (
          <div key={key} className={cn(long && 'sm:col-span-2')}>
            <Label icon={icon} text={label}>
              {long ? (
                <textarea
                  value={v[key]}
                  onChange={(e) => setV({ ...v, [key]: e.target.value })}
                  rows={2}
                  maxLength={300}
                  className="field resize-none"
                />
              ) : (
                <input
                  value={v[key]}
                  onChange={(e) => setV({ ...v, [key]: e.target.value })}
                  maxLength={300}
                  className="field h-10"
                />
              )}
            </Label>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Preview({ v }: { v: Copy }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#060818]/70 px-5 py-6">
      <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-0 h-48 w-56 rounded-full bg-purple-500/15 blur-3xl" />
      <div className="relative">
        <p className="label flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-sky-300 to-purple-400" />
          {v.site_title || 'Foliage'}
        </p>
        <p className="title-xl mt-3 break-words text-[clamp(1.4rem,3vw,2.1rem)]">{v.hero_line || '—'}</p>
        {v.site_subtitle && <p className="mt-3 text-[13px] text-indigo-100/55">{v.site_subtitle}</p>}
        {v.footer_note && (
          <p className="mt-6 border-t border-white/[0.06] pt-3 text-[11.5px] text-white/30">{v.footer_note}</p>
        )}
      </div>
    </div>
  )
}

/* ---------- ② 口令 ---------- */

function PwInput({ icon, invalid, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode; invalid?: boolean }) {
  return (
    <div className="relative">
      <span className={cn('pointer-events-none absolute left-3 top-1/2 -translate-y-1/2', invalid ? 'text-rose-300/80' : 'text-indigo-200/45')}>{icon}</span>
      <input type="password" placeholder="••••" {...rest} className={cn('field h-10 pl-9', invalid && 'border-rose-400/45')} />
    </div>
  )
}

function PasswordSection() {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const { run, pending } = useMutate()

  const short = next.length > 0 && next.length < 6
  const mismatch = again.length > 0 && again !== next
  const ready = cur && next.length >= 6 && next === again

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    const ok = await run(
      () => api('/api/settings', { method: 'POST', body: { currentPassword: cur, newPassword: next } }),
      '✓',
    )
    if (ok) { setCur(''); setNext(''); setAgain('') }
  }

  return (
    <Card icon={<KeyRound size={15} />} title="口令" i={1}>
      <form onSubmit={submit} className="space-y-2.5">
        <PwInput
          icon={<Lock size={14} />} autoComplete="current-password" aria-label="当前口令" title="当前口令"
          value={cur} onChange={(e) => setCur(e.target.value)}
        />
        <PwInput
          icon={<LockKeyhole size={14} />} autoComplete="new-password" aria-label="新口令" title="新口令 ≥6"
          value={next} onChange={(e) => setNext(e.target.value)} invalid={short}
        />
        <PwInput
          icon={<ShieldCheck size={14} />} autoComplete="new-password" aria-label="确认新口令" title="确认"
          value={again} onChange={(e) => setAgain(e.target.value)} invalid={mismatch}
        />
        <div className="flex items-center justify-between gap-3 pt-1">
          <AnimatePresence mode="wait">
            {(short || mismatch) && (
              <motion.span
                key={short ? 's' : 'm'}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="num text-[12px] text-rose-300/85"
                role="alert"
              >
                {short ? '≥ 6' : '≠'}
              </motion.span>
            )}
          </AnimatePresence>
          <button
            type="submit"
            disabled={!ready || pending}
            className="btn btn-icon ml-auto h-10 w-10 p-0"
            aria-label="更新口令"
            title="更新口令"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          </button>
        </div>
      </form>
    </Card>
  )
}

/* ---------- ③ 存储 ---------- */

function StorageSection({ s }: { s: Storage }) {
  const { run, pending } = useMutate()
  const total = s.db + s.uploads + s.chunks
  const parts = [
    { label: '数据库', icon: <Database size={13} />, bytes: s.db, cls: 'from-sky-300 to-sky-400' },
    { label: '上传', icon: <Upload size={13} />, bytes: s.uploads, cls: 'from-indigo-300 to-violet-400' },
    { label: '分片', icon: <Puzzle size={13} />, bytes: s.chunks, cls: 'from-violet-400 to-purple-400' },
  ]

  const purge = () => run(async () => {
    const r = await api<{ removed: number; bytes: number; orphaned: number }>('/api/files/purge', { method: 'POST' })
    if (!r.removed && !r.orphaned) toast('∅', 'info')
    else toast(`✕ ${r.removed} · ${formatBytes(r.bytes)}${r.orphaned ? ` · ⧉ ${r.orphaned}` : ''}`)
    return r
  })

  return (
    <Card
      icon={<HardDrive size={15} />}
      title="存储"
      i={2}
      extra={
        <button
          onClick={purge}
          disabled={pending}
          className={cn('btn btn-icon h-10 w-10 p-0', s.expired > 0 ? 'btn-danger' : 'btn-ghost')}
          aria-label="清理过期"
          title="清理过期"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Eraser size={15} />}
        </button>
      }
    >
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2" title={s.root}>
        <FolderTree size={13} className="shrink-0 text-indigo-200/40" />
        <code className="num min-w-0 flex-1 truncate text-[12px] text-white/60">{s.root}</code>
      </div>

      <div className="mt-4 flex h-2 gap-[2px] overflow-hidden rounded-full bg-white/[0.05]">
        {total > 0 && parts.map((p, i) => (
          <motion.span
            key={p.label}
            className={cn('h-full bg-gradient-to-r first:rounded-l-full last:rounded-r-full', p.cls)}
            initial={{ width: 0 }}
            animate={{ width: `${(p.bytes / total) * 100}%` }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.2 + i * 0.06 }}
          />
        ))}
      </div>

      <dl className="mt-3 divide-y divide-white/[0.05] text-[13px]">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center justify-between py-2">
            <dt className="flex items-center gap-2 text-indigo-100/55">
              <span className={cn('h-2 w-2 rounded-full bg-gradient-to-br', p.cls)} />
              {p.icon}
              {p.label}
            </dt>
            <dd className="num text-white/85">{formatBytes(p.bytes)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between py-2">
          <dt className="flex items-center gap-3 text-indigo-100/55">
            <span className="inline-flex items-center gap-1.5" title="文件"><Files size={13} />{s.files}</span>
            <span className={cn('inline-flex items-center gap-1.5', s.expired ? 'text-amber-300' : 'text-white/35')} title="已过期">
              <Ban size={13} />{s.expired}
            </span>
          </dt>
          <dd className="num text-white/40">Σ {formatBytes(total)}</dd>
        </div>
      </dl>
    </Card>
  )
}

/* ---------- ④ 备份 ---------- */

function BackupSection({ size }: { size: number }) {
  return (
    <Card icon={<DatabaseBackup size={15} />} title="备份" i={3}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="num truncate text-[13px] text-white/80" suppressHydrationWarning>app-{today()}.db</p>
          <p className="num mt-0.5 text-[11.5px] text-indigo-100/40">≈ {formatBytes(size)}</p>
        </div>
        <a
          href="/api/admin/backup"
          download
          className="btn btn-primary shine btn-icon h-10 w-10 shrink-0 p-0"
          aria-label="下载备份"
          title="下载备份"
        >
          <Download size={15} />
        </a>
      </div>
    </Card>
  )
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
