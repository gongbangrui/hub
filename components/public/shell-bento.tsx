'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Bookmark, ArrowLeftRight, Trophy, FileText, ArrowUpRight, HardDrive, Lock } from 'lucide-react'
import { Counter, EASE } from '@/components/ui/fx'
import { Favicon } from '@/components/ui/favicon'
import { cn, formatBytes, hostOf } from '@/lib/utils'

export type BentoData = {
  authed: boolean
  links: { count: number; top: { id: number; title: string; url: string }[] }
  files: { count: number; recent: { id: number; name: string; size: number }[]; used: number; quota: number }
  competitions: number
  papers: number
}

const tile = {
  hidden: { opacity: 0, y: 22, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.65, ease: EASE } },
}

function Tile({ className, children, featured }: { className?: string; children: React.ReactNode; featured?: boolean }) {
  return (
    <motion.div
      variants={tile}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className={cn(
        'liquid liquid-hover spotlight group relative overflow-hidden rounded-3xl transition-[border-color,box-shadow,background] duration-300',
        featured && 'grad-border',
        className,
      )}
    >
      {children}
    </motion.div>
  )
}

function Head({ icon: Icon, label, locked }: { icon: React.ElementType; label: string; locked?: boolean }) {
  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-sky-300/15 via-indigo-400/10 to-purple-400/15 text-indigo-50">
          <Icon size={18} strokeWidth={1.9} />
        </span>
        <span className="text-[14px] font-medium text-indigo-50/85">{label}</span>
      </div>
      {locked ? (
        <Lock size={15} className="text-violet-200/70" aria-label="需登录" />
      ) : (
        <ArrowUpRight size={17} className="text-indigo-100/25 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
      )}
    </div>
  )
}

function Big({ n }: { n: number }) {
  return <Counter value={n} className="text-[clamp(2.6rem,6vw,4rem)] font-semibold leading-none tracking-[-0.04em] text-grad" />
}

/** 首页便当格 */
export function ShellBento({ data }: { data: BentoData }) {
  const { authed, links, files } = data
  const pct = Math.min(100, files.quota ? (files.used / files.quota) * 100 : 0)

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.25 } } }}
      className="grid auto-rows-[minmax(150px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6"
    >
      {/* 收藏夹 */}
      <Tile featured className="sm:col-span-2 lg:col-span-4 lg:row-span-2">
        <Link href="/links" aria-label="收藏夹" className="absolute inset-0 z-0 rounded-[inherit]" />
        <div className="pointer-events-none relative z-10 flex h-full flex-col p-6">
          <Head icon={Bookmark} label="收藏夹" />
          <div className="mt-6"><Big n={links.count} /></div>
          {links.top.length > 0 && (
            <div className="mt-auto grid grid-cols-2 gap-2 pt-6 sm:grid-cols-3">
              {links.top.map((l, i) => (
                <motion.a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  title={l.title}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.5 + i * 0.05, ease: EASE }}
                  className="pointer-events-auto flex min-h-11 min-w-0 items-center gap-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-3 py-2 transition-colors hover:border-indigo-300/30 hover:bg-white/[0.08]"
                >
                  <Favicon url={l.url} title={l.title} size={20} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-indigo-50/85">{l.title}</span>
                    <span className="block truncate text-[10.5px] text-indigo-100/30">{hostOf(l.url)}</span>
                  </span>
                </motion.a>
              ))}
            </div>
          )}
        </div>
      </Tile>

      {/* 中转站 */}
      <Tile className="sm:col-span-2 lg:col-span-2 lg:row-span-2">
        <Link href="/files" className="flex h-full flex-col p-6">
          <Head icon={ArrowLeftRight} label="中转站" />
          <div className="mt-6"><Big n={files.count} /></div>
          {files.recent.length > 0 && (
            <ul className="mt-6 space-y-2.5">
              {files.recent.map((f) => (
                <li key={f.id} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] font-mono text-[9.5px] font-semibold text-indigo-100/50">
                    {f.name.includes('.') ? f.name.split('.').pop()!.slice(0, 3).toUpperCase() : '·'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-indigo-50/80">{f.name}</span>
                  <span className="num shrink-0 text-[11px] text-indigo-100/30">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto pt-6">
            <div className="mb-2 flex items-center justify-between text-[11px] text-indigo-100/40">
              <HardDrive size={12} aria-label="存储" />
              <span className="num">{formatBytes(files.used)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-sky-300 via-indigo-400 to-purple-400"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(pct, files.used ? 2 : 0)}%` }}
                transition={{ duration: 1.2, delay: 0.6, ease: EASE }}
              />
            </div>
          </div>
        </Link>
      </Tile>

      {/* 竞赛 / 论文 */}
      {([
        { href: '/competitions', icon: Trophy, label: '竞赛', n: data.competitions },
        { href: '/papers', icon: FileText, label: '论文', n: data.papers },
      ]).map((c) => (
        <Tile key={c.href} className="lg:col-span-3">
          <Link
            href={authed ? c.href : `/login?next=${c.href}`}
            aria-label={c.label}
            className="flex h-full flex-col p-6"
          >
            <Head icon={c.icon} label={c.label} locked={!authed} />
            <div className="mt-auto pt-6">
              {authed ? (
                <Big n={c.n} />
              ) : (
                <span aria-hidden className="flex items-end gap-1.5">
                  {[0.55, 0.85, 0.4, 0.7, 1, 0.6].map((h, i) => (
                    <span key={i} className="w-3 rounded-full bg-gradient-to-t from-indigo-400/10 to-violet-300/25 blur-[1.5px]"
                          style={{ height: `${h * 44}px` }} />
                  ))}
                </span>
              )}
            </div>
          </Link>
        </Tile>
      ))}
    </motion.div>
  )
}
