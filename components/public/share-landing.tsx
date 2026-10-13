'use client'
import { m as motion, useAnimationControls } from 'framer-motion'
import {
  Download, FileText, Image as ImageIcon, FileArchive, Film, Music, Code2,
  Table2, File as FileIcon, Clock, Loader2, Lock, ArrowRight, Hourglass, CalendarDays, TimerOff,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fileUrl } from '@/lib/file-url'
import { useEffect, useState } from 'react'
import { cn, formatBytes, fileKind } from '@/lib/utils'
import { EASE } from '@/lib/motion'

const ICONS: Record<string, React.ElementType> = {
  image: ImageIcon, pdf: FileText, archive: FileArchive, video: Film,
  audio: Music, code: Code2, doc: FileText, sheet: Table2, other: FileIcon,
}

type FileInfo = {
  id: number; token: string; code: string; name: string; size: number; mime: string
  downloads: number; expiresAt: string | null; createdAt: string
}

const enter = {
  initial: { opacity: 0, y: 18, scale: 0.98, filter: 'blur(12px)' },
  animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
  transition: { duration: 0.75, ease: EASE },
}

export function ShareLanding({ file, expired, locked }: { file: FileInfo; expired: boolean; locked: boolean }) {
  const [downloading, setDownloading] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!file.expiresAt || expired) return
    const t = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [file.expiresAt, expired])

  if (locked && !expired) return <Unlock code={file.code} />
  const kind = fileKind(file.mime, file.name)
  const Icon = ICONS[kind] ?? FileIcon
  const previewable = ['image', 'pdf', 'video', 'audio'].includes(kind)
  const wide = previewable && kind !== 'audio'

  function download() {
    setDownloading(true)
    window.location.href = fileUrl(file)
    setTimeout(() => setDownloading(false), 2500)
  }

  if (expired) {
    return (
      <motion.div {...enter} className="liquid flex w-full max-w-xs flex-col items-center gap-4 rounded-3xl px-8 py-10">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300/10">
          <TimerOff size={22} className="text-amber-700" />
        </span>
        <h1 className="text-[15px] font-medium text-slate-700">已过期</h1>
      </motion.div>
    )
  }

  const info = (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-900/10 bg-gradient-to-br from-sky-300/15 via-indigo-400/10 to-purple-400/15">
          <Icon size={20} className="text-slate-700" />
        </span>
        <h1 className="min-w-0 flex-1 break-words pt-1 text-[16px] font-medium leading-snug text-slate-900/90">{file.name}</h1>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-2 text-[12px]">
        <Meta icon={<FileIcon size={12} />} label="大小">{formatBytes(file.size)}</Meta>
        <Meta icon={<Download size={12} />} label="下载次数">{file.downloads}</Meta>
        <Meta icon={<CalendarDays size={12} />} label="上传">
          {/* 固定格式并显式指定时区：toLocaleDateString 会按服务器/浏览器时区各算各的，
              跨时区时水合前后的日期可能差一天 */}
          {fmtDate(file.createdAt)}
        </Meta>
        {file.expiresAt && (
          <Meta icon={<Clock size={12} />} label="剩余" tone="amber">
            <span suppressHydrationWarning>{left(file.expiresAt)}</span>
          </Meta>
        )}
      </dl>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={download}
        disabled={downloading}
        className="btn btn-primary shine mt-6 h-12 w-full lg:mt-auto"
        aria-label="下载"
      >
        {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        <span className="num text-[13px] opacity-70">{formatBytes(file.size)}</span>
      </motion.button>
    </div>
  )

  return (
    <motion.div
      {...enter}
      className={cn('liquid relative w-full rounded-3xl p-5 sm:p-7', wide ? 'max-w-5xl' : 'max-w-md')}
    >
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/60 to-transparent" />
      {wide ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
            className="overflow-hidden rounded-2xl border border-slate-900/7 bg-slate-900/20"
          >
            <Preview file={file} kind={kind} />
          </motion.div>
          {info}
        </div>
      ) : (
        <>
          {info}
          {kind === 'audio' && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-900/7">
              <Preview file={file} kind={kind} />
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}

function Preview({ file, kind }: { file: FileInfo; kind: string }) {
  const src = fileUrl(file, true)
  if (kind === 'image') return <img src={src} alt={file.name} className="max-h-[70vh] w-full object-contain" />
  if (kind === 'pdf') return <iframe src={src} className="h-[60vh] w-full bg-white lg:h-[70vh]" title={file.name} />
  if (kind === 'video') return <video src={src} controls className="max-h-[70vh] w-full" />
  return <audio src={src} controls className="w-full p-3" />
}

function Meta({ icon, label, children, tone }: { icon: React.ReactNode; label: string; children: React.ReactNode; tone?: 'amber' }) {
  return (
    <div
      title={label}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-xl border border-slate-900/6 bg-slate-900/3 px-3 py-2.5',
        tone === 'amber' ? 'text-amber-700' : 'text-slate-600',
      )}
    >
      <dt className="shrink-0 opacity-70" aria-label={label}>{icon}</dt>
      <dd className="num truncate">{children}</dd>
    </div>
  )
}

/** YYYY/MM/DD，用 UTC 计算，保证服务端与各时区浏览器算出来一致 */
function fmtDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}`
}

function left(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return '0m'
  const h = Math.floor(ms / 3600000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h >= 1) return `${h}h ${Math.floor((ms % 3600000) / 60000)}m`
  return `${Math.max(1, Math.floor(ms / 60000))}m`
}

function Unlock({ code }: { code: string }) {
  const router = useRouter()
  const shake = useAnimationControls()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const [wait, setWait] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pw || busy) return
    setBusy(true); setErr(false); setWait('')
    const r = await fetch('/api/share/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, password: pw }),
    }).catch(() => null)
    setBusy(false)
    if (r?.ok) { router.refresh(); return }
    if (r?.status === 429) {
      const j = await r.json().catch(() => ({}))
      setWait(String(j.error ?? '').match(/\d+/)?.[0] ?? '')
    }
    setErr(true)
    shake.start({ x: [0, -9, 9, -6, 6, 0], transition: { duration: 0.4 } })
  }

  return (
    <motion.form
      onSubmit={submit}
      {...enter}
      className="liquid flex w-full max-w-xs flex-col items-center rounded-3xl px-7 py-9"
    >
      <span className="pulse-ring flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-300/35 bg-gradient-to-br from-sky-300/20 via-indigo-400/15 to-purple-400/20">
        <Lock size={22} className="text-slate-800" />
      </span>
      <motion.div animate={shake} className="mt-7 flex w-full gap-2">
        <input
          autoFocus type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(false) }}
          placeholder="••••" aria-label="提取码" aria-invalid={err}
          className={cn('field h-12 text-center tracking-[0.3em]', err && 'border-rose-400/60')}
        />
        <button disabled={busy || !pw} className="btn btn-primary shine h-12 w-12 shrink-0 p-0" aria-label="解锁" title="解锁">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
        </button>
      </motion.div>
      <div className="mt-3 h-4 text-[12px] text-rose-600" aria-live="polite">
        {err && wait && <span className="flex items-center gap-1"><Hourglass size={12} /><span className="num">{wait}s</span></span>}
      </div>
    </motion.form>
  )
}
