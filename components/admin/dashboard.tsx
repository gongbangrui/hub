'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bookmark, FolderOpen, Trophy, FileText, Clock, Plus, Upload, Trash2, HardDrive, Flame, ArrowUpRight,
  Activity as ActivityIcon, BarChart3, Timer, MousePointerClick, Award, CheckCheck, Loader2, Ban, Hourglass,
} from 'lucide-react'
import { cn, formatBytes, faviconOf, toneOf } from '@/lib/utils'
import { LEVELS, STATUSES } from '@/components/ui/primitives'
import { Counter, Magnetic } from '@/components/ui/fx'
import { FadeList, FadeItem } from '@/components/motion/reveal'
import { AdminTitle, StatCard, api, toast, useMutate } from '@/components/admin/ui'

const EASE = [0.22, 1, 0.36, 1] as const
const DAY = 24 * 60 * 60 * 1000

/* ---------- 数据契约（由 app/admin/page.tsx 组装） ---------- */

export type ActivityKind = 'link' | 'file' | 'competition' | 'paper'
export type Activity = { kind: ActivityKind; id: number; title: string; sub: string; at: number }

export type DashboardData = {
  now: number
  links: { count: number; clicks: number }
  files: { count: number; bytes: number }
  temp: { count: number }
  expired: { count: number; bytes: number }
  expiring: { id: number; name: string; size: number; expiresAt: number }[]
  competitions: { count: number; levels: Record<string, number> }
  papers: { count: number; statuses: Record<string, number> }
  top: { id: number; title: string; url: string; iconUrl: string | null; clicks: number }[]
  recent: Activity[]
  storage: { used: number; total: number | null; free: number | null }
}

const KIND = {
  link: { label: '书签', href: '/admin/links', icon: Bookmark, cls: 'text-sky-200 bg-sky-400/12 border-sky-300/30', dot: '#7dd3fc' },
  file: { label: '文件', href: '/admin/files', icon: FolderOpen, cls: 'text-indigo-200 bg-indigo-400/12 border-indigo-300/30', dot: '#818cf8' },
  competition: { label: '竞赛', href: '/admin/competitions', icon: Trophy, cls: 'text-violet-200 bg-violet-400/12 border-violet-300/30', dot: '#a78bfa' },
  paper: { label: '论文', href: '/admin/papers', icon: FileText, cls: 'text-purple-200 bg-purple-400/12 border-purple-300/30', dot: '#c084fc' },
} as const

/** 分布条：浅蓝 → 紫 渐进 */
const RAMP = ['#7dd3fc', '#818cf8', '#a78bfa', '#c084fc'] as const

/* ---------- 时间 ---------- */

/** 首帧用服务端时间避免水合差异，之后每 30s 走客户端时钟 */
function useNow(server: number) {
  const [now, setNow] = useState(server)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return Math.max(now, server)
}

function ago(now: number, at: number) {
  const m = Math.floor((now - at) / 60_000)
  if (m < 1) return '•'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(at).toISOString().slice(0, 10)
}

function left(ms: number) {
  if (ms <= 0) return '✕'
  const m = Math.ceil(ms / 60_000)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

/* ---------- 外壳 ---------- */

function Panel({ title, icon, extra, className, children }: {
  title: string; icon?: React.ReactNode; extra?: React.ReactNode; className?: string; children: React.ReactNode
}) {
  return (
    <FadeItem className={cn('liquid spotlight relative overflow-hidden rounded-3xl p-4 sm:p-5', className)}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[14px] font-medium text-white/85">
          {icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-indigo-200/15 bg-[image:var(--grad-soft)] text-indigo-100">
              {icon}
            </span>
          )}
          {title}
        </h2>
        {extra}
      </header>
      {children}
    </FadeItem>
  )
}

function Empty({ icon }: { icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center py-8 text-indigo-200/25" aria-label="空">
      {icon ?? <span className="text-2xl">∅</span>}
    </div>
  )
}

function Bar({ pct, className, delay = 0 }: { pct: number; className?: string; delay?: number }) {
  return (
    <motion.div
      className={cn('h-full rounded-full', className)}
      initial={{ width: 0 }}
      animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    />
  )
}

/* ---------- 快捷操作 ---------- */

const QUICK = [
  { href: '/admin/links?new=1', label: '新书签', icon: Bookmark },
  { href: '/admin/files?new=1', label: '上传', icon: Upload },
  { href: '/admin/competitions?new=1', label: '新竞赛', icon: Trophy },
  { href: '/admin/papers?new=1', label: '新论文', icon: FileText, primary: true },
] as const

function QuickActions() {
  return (
    <>
      {QUICK.map((q) => (
        <Magnetic key={q.href} strength={0.2}>
          <Link
            href={q.href}
            title={q.label}
            aria-label={q.label}
            className={cn('btn btn-icon relative h-10 w-10 p-0', 'primary' in q && q.primary ? 'btn-primary shine' : 'liquid-hover')}
          >
            <q.icon size={16} />
            {q.icon !== Upload && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[image:var(--grad)] text-[#060818] shadow-[0_0_8px_rgb(129_140_248/0.8)]">
                <Plus size={10} strokeWidth={3.5} />
              </span>
            )}
          </Link>
        </Magnetic>
      ))}
    </>
  )
}

/* ---------- 主体 ---------- */

export function Dashboard({ data }: { data: DashboardData }) {
  const now = useNow(data.now)
  const lv = data.competitions.levels
  const st = data.papers.statuses

  return (
    <>
      <AdminTitle title="概览" actions={<QuickActions />} />

      {/* 便当网格：存储环 + 四个统计 */}
      <FadeList className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-12">
        <Storage storage={data.storage} className="col-span-2 lg:col-span-4 lg:row-span-2" />
        <FadeItem className="lg:col-span-4">
          <StatCard
            label="书签" value={data.links.count} tone="sky" href="/admin/links"
            icon={<Bookmark size={15} />}
            hint={<span className="inline-flex items-center gap-1" title="点击"><MousePointerClick size={12} /><span className="num text-white/65">{data.links.clicks}</span></span>}
          />
        </FadeItem>
        <FadeItem className="lg:col-span-4">
          <StatCard
            label="文件" value={data.files.count} tone="indigo" href="/admin/files"
            icon={<FolderOpen size={15} />}
            hint={
              <>
                <span className="num text-white/65">{formatBytes(data.files.bytes)}</span>
                <span className="text-white/20">·</span>
                <span className="inline-flex items-center gap-1" title="临时"><Timer size={12} /><span className="num text-white/65">{data.temp.count}</span></span>
              </>
            }
          />
        </FadeItem>
        <FadeItem className="lg:col-span-4">
          <StatCard
            label="竞赛" value={data.competitions.count} tone="violet" href="/admin/competitions"
            icon={<Trophy size={15} />}
            hint={
              <span className="inline-flex items-center gap-1" title={`${LEVELS.national.label} · ${LEVELS.international.label}`}>
                <Award size={12} />
                <span className="num text-amber-200/90">{lv.national ?? 0}</span>
                <span className="text-white/20">·</span>
                <span className="num text-purple-200/90">{lv.international ?? 0}</span>
              </span>
            }
          />
        </FadeItem>
        <FadeItem className="lg:col-span-4">
          <StatCard
            label="论文" value={data.papers.count} tone="purple" href="/admin/papers"
            icon={<FileText size={15} />}
            hint={
              <span className="inline-flex items-center gap-1" title={STATUSES.published.label}>
                <CheckCheck size={12} /><span className="num text-white/65">{st.published ?? 0}</span>
              </span>
            }
          />
        </FadeItem>
      </FadeList>

      <FadeList className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-12">
        <Timeline items={data.recent} now={now} className="lg:col-span-7 lg:row-span-2" />
        <Cleanup data={data} now={now} className="lg:col-span-5" />
        <TopLinks items={data.top} className="lg:col-span-5" />
        <Panel title="分布" icon={<BarChart3 size={15} />} className="lg:col-span-12">
          <div className="grid gap-6 md:grid-cols-2 md:gap-8">
            <StackBar
              title="竞赛"
              icon={<Trophy size={13} />}
              href="/admin/competitions"
              segments={[
                ...(Object.keys(LEVELS) as (keyof typeof LEVELS)[]).map((k, i) => ({
                  key: k, label: LEVELS[k].label, color: RAMP[i % RAMP.length], n: lv[k] ?? 0,
                })),
                { key: 'none', label: '—', color: '#475569', n: lv.none ?? 0 },
              ]}
            />
            <StackBar
              title="论文"
              icon={<FileText size={13} />}
              href="/admin/papers"
              segments={(Object.keys(STATUSES) as (keyof typeof STATUSES)[]).map((k, i) => ({
                key: k, label: STATUSES[k].label, color: RAMP[i % RAMP.length], n: st[k] ?? 0,
              }))}
            />
          </div>
        </Panel>
      </FadeList>
    </>
  )
}

/* ---------- 最近动态 ---------- */

function Timeline({ items, now, className }: { items: Activity[]; now: number; className?: string }) {
  return (
    <Panel title="动态" icon={<ActivityIcon size={15} />} className={className}>
      {items.length === 0 ? (
        <Empty icon={<ActivityIcon size={28} />} />
      ) : (
        <ol className="relative">
          <motion.span
            className="absolute bottom-4 left-[17px] top-4 w-[2px] origin-top rounded-full bg-gradient-to-b from-sky-300/70 via-indigo-400/50 to-purple-400/0"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
          />
          {items.map((a, i) => {
            const k = KIND[a.kind]
            const Icon = k.icon
            return (
              <motion.li
                key={`${a.kind}-${a.id}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: 0.12 + i * 0.045 }}
              >
                <Link
                  href={k.href}
                  className="group relative flex min-h-[48px] items-center gap-3 rounded-2xl py-1.5 pr-2 transition-colors duration-200 hover:bg-white/[0.04]"
                >
                  <span
                    className={cn('relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border backdrop-blur transition-transform duration-300 group-hover:scale-110', k.cls)}
                    title={k.label}
                  >
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-white/85 group-hover:text-white">{a.title}</span>
                    {a.sub && <span className="mt-0.5 block truncate text-[11.5px] text-indigo-100/40">{a.sub}</span>}
                  </span>
                  <span className="num shrink-0 rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] text-indigo-100/45">{ago(now, a.at)}</span>
                </Link>
              </motion.li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}

/* ---------- 待清理 ---------- */

function Cleanup({ data, now, className }: { data: DashboardData; now: number; className?: string }) {
  const { run, pending } = useMutate()
  const n = data.expired.count

  const purge = () =>
    run(async () => {
      const r = await api<{ removed: number; bytes: number; orphaned: number }>('/api/files/purge', { method: 'POST' })
      toast(r.removed ? `✕ ${r.removed} · ${formatBytes(r.bytes)}` : '✓')
      return r
    })

  return (
    <Panel
      title="清理"
      icon={<Trash2 size={15} />}
      className={className}
      extra={
        <button
          onClick={purge}
          disabled={pending}
          className={cn('btn btn-icon h-10 w-10 p-0', n > 0 ? 'btn-primary shine' : 'btn-ghost')}
          aria-label="清理过期"
          title="清理过期"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5" title="已过期">
          <span className="flex items-center gap-1.5 text-[11px] text-indigo-100/40"><Ban size={12} />过期</span>
          <span className={cn('mt-1 flex items-baseline gap-2 text-[26px] font-semibold leading-none tracking-tight', n > 0 ? 'text-rose-200' : 'text-white/90')}>
            <Counter value={n} />
            {n > 0 && <span className="num text-[11px] font-normal text-white/40">{formatBytes(data.expired.bytes)}</span>}
          </span>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5" title="24h 内到期">
          <span className="flex items-center gap-1.5 text-[11px] text-indigo-100/40"><Hourglass size={12} />24h</span>
          <span className="mt-1 block text-[26px] font-semibold leading-none tracking-tight text-white/90">
            <Counter value={data.expiring.length} />
          </span>
        </div>
      </div>

      {data.expiring.length > 0 && (
        <ul className="mt-3 divide-y divide-white/[0.05]">
          {data.expiring.map((f, i) => {
            const rest = f.expiresAt - now
            const hot = rest < 60 * 60 * 1000
            const warm = rest < 6 * 60 * 60 * 1000
            return (
              <li key={f.id} className="py-2">
                <div className="flex items-center gap-3 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-white/75" title={f.name}>{f.name}</span>
                  <span className="num hidden shrink-0 text-[11.5px] text-white/35 sm:inline">{formatBytes(f.size)}</span>
                  <span className={cn('num flex w-16 shrink-0 items-center justify-end gap-1 text-[12px]', hot ? 'text-rose-300' : warm ? 'text-amber-200' : 'text-white/55')}>
                    <Clock size={11} />{left(rest)}
                  </span>
                </div>
                <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/[0.05]">
                  <Bar
                    pct={(rest / DAY) * 100}
                    delay={0.1 + i * 0.03}
                    className={hot ? 'bg-rose-400/80' : warm ? 'bg-amber-300/70' : 'bg-gradient-to-r from-sky-300/80 via-indigo-400/80 to-purple-400/80'}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

/* ---------- 存储（环） ---------- */

const R = 52
const C = 2 * Math.PI * R

function Storage({ storage, className }: { storage: DashboardData['storage']; className?: string }) {
  const { used, total, free } = storage
  const other = total && free !== null ? Math.max(0, total - free - used) : 0
  const pct = (n: number) => (total ? (n / total) * 100 : 0)
  // 极小占用也保留可见的一小段
  const pu = total ? Math.max(used > 0 ? 1 : 0, pct(used)) : 100
  const po = total ? pct(other) : 0
  const seg = (p: number) => (Math.min(100, p) / 100) * C

  return (
    <FadeItem className={cn('liquid spotlight relative flex flex-col overflow-hidden rounded-3xl p-4 sm:p-5', className)}>
      <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-sky-400/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-10 h-48 w-48 rounded-full bg-purple-500/15 blur-3xl" />
      <header className="relative flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[14px] font-medium text-white/85">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-indigo-200/15 bg-[image:var(--grad-soft)] text-indigo-100">
            <HardDrive size={15} />
          </span>
          存储
        </h2>
        {total ? <span className="num rounded-full bg-white/[0.05] px-2 py-0.5 text-[11.5px] text-indigo-100/60">{pct(used + other).toFixed(1)}%</span> : null}
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-5 py-4 sm:flex-row lg:flex-col">
        <div className="relative h-40 w-40 shrink-0">
          <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
            <defs>
              <linearGradient id="dash-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7dd3fc" />
                <stop offset="50%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
            </defs>
            <circle cx="64" cy="64" r={R} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="10" />
            {po > 0 && (
              <motion.circle
                cx="64" cy="64" r={R} fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth="10" strokeLinecap="round"
                strokeDashoffset={-seg(pu)}
                initial={{ strokeDasharray: `0 ${C}` }}
                animate={{ strokeDasharray: `${seg(po)} ${C}` }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}
              />
            )}
            <motion.circle
              cx="64" cy="64" r={R} fill="none" stroke="url(#dash-ring)" strokeWidth="10" strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 6px rgb(129 140 248 / 0.7))' }}
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: C - seg(pu) }}
              transition={{ duration: 1.1, ease: EASE, delay: 0.15 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="num text-grad text-[22px] font-semibold leading-none tracking-tight">{formatBytes(used)}</span>
            {total ? <span className="num mt-1.5 text-[11px] text-indigo-100/40">/ {formatBytes(total)}</span> : null}
          </div>
        </div>

        {total ? (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[11.5px] text-indigo-100/45 sm:flex-col lg:flex-row">
            <Legend color="var(--grad)" label="↑" title="上传" value={formatBytes(used)} />
            <Legend color="rgb(255 255 255 / 0.3)" label="◌" title="其他" value={formatBytes(other)} />
            <Legend color="rgb(255 255 255 / 0.08)" label="○" title="可用" value={formatBytes(free ?? 0)} />
          </div>
        ) : null}
      </div>
    </FadeItem>
  )
}

function Legend({ color, label, value, title }: { color: string; label: string; value: React.ReactNode; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
      <span className="num text-white/70">{value}</span>
    </span>
  )
}

/* ---------- 常用书签 ---------- */

function TopLinks({ items, className }: { items: DashboardData['top']; className?: string }) {
  const max = Math.max(1, ...items.map((l) => l.clicks))
  return (
    <Panel
      title="热门"
      icon={<Flame size={15} />}
      className={className}
      extra={
        <Link href="/admin/links" className="btn btn-ghost btn-icon h-10 w-10 p-0" aria-label="书签" title="书签">
          <ArrowUpRight size={15} />
        </Link>
      }
    >
      {items.length === 0 ? (
        <Empty icon={<MousePointerClick size={26} />} />
      ) : (
        <ol className="space-y-3">
          {items.map((l, i) => (
            <li key={l.id} className="flex items-center gap-3">
              <span className={cn('num w-4 shrink-0 text-right text-[11px]', i === 0 ? 'text-grad font-semibold' : 'text-white/25')}>{i + 1}</span>
              <Favicon src={l.iconUrl || faviconOf(l.url)} seed={l.title} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <a href={l.url} target="_blank" rel="noreferrer" className="truncate text-[13px] text-white/80 hover:text-white">{l.title}</a>
                  <span className="num shrink-0 text-[12px] text-white/55">{l.clicks}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <Bar
                    pct={(l.clicks / max) * 100}
                    delay={0.15 + i * 0.05}
                    className={cn('bg-gradient-to-r', i === 0 ? 'from-sky-300 via-indigo-400 to-purple-400 shadow-[0_0_10px_rgb(129_140_248/0.6)]' : 'from-sky-300/70 to-indigo-400/60')}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

function Favicon({ src, seed }: { src: string; seed: string }) {
  const [broken, setBroken] = useState(!src)
  return (
    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br text-[11px] font-semibold text-white/90', broken ? toneOf(seed) : 'from-white/[0.06] to-white/[0.02]')}>
      {broken
        ? seed.slice(0, 1).toUpperCase()
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={src} alt="" className="h-4 w-4" onError={() => setBroken(true)} />}
    </span>
  )
}

/* ---------- 堆叠条 ---------- */

function StackBar({ title, icon, href, segments }: {
  title: string; icon?: React.ReactNode; href: string; segments: { key: string; label: string; color: string; n: number }[]
}) {
  const total = segments.reduce((s, x) => s + x.n, 0)
  const shown = segments.filter((s) => s.n > 0)
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <Link href={href} className="inline-flex min-h-[32px] items-center gap-1.5 text-[12.5px] text-indigo-100/55 transition-colors hover:text-white">
          {icon}{title}<ArrowUpRight size={12} className="opacity-50" />
        </Link>
        <span className="num text-xs text-white/45">{total}</span>
      </div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-white/[0.05]">
        {shown.map((s, i) => (
          <motion.div
            key={s.key}
            title={`${s.label} ${s.n}`}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ background: s.color, boxShadow: `0 0 12px ${s.color}66` }}
            initial={{ width: 0 }}
            animate={{ width: `${(s.n / total) * 100}%` }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.15 + i * 0.06 }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-indigo-100/45">
        {segments.filter((s) => s.n > 0 || s.key !== 'none').map((s) => (
          <Legend key={s.key} color={s.color} label={s.label} value={s.n} />
        ))}
      </div>
    </div>
  )
}
