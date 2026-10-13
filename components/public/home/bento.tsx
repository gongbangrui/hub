import Link from 'next/link'
import { Bookmark, ArrowLeftRight, Trophy, FileText, ArrowUpRight, Lock } from 'lucide-react'
import { Count } from '@/components/ui/page'
import { Favicon } from '@/components/ui/favicon'
import { formatBytes, hostOf, cn } from '@/lib/utils'

export type BentoData = {
  authed: boolean
  links: { count: number; top: { id: number; title: string; url: string }[] }
  files: { count: number; recent: { id: number; name: string; size: number }[] }
  competitions: number
  papers: number
}

function Tile({ className, children, i, featured }: { className?: string; children: React.ReactNode; i: number; featured?: boolean }) {
  return (
    <div
      className={cn('enter liquid liquid-blur liquid-hover spotlight group relative overflow-hidden rounded-3xl', featured && 'grad-border', className)}
      style={{ ['--i' as string]: i }}
    >
      {children}
    </div>
  )
}

function Head({ icon: Icon, label, locked }: { icon: React.ElementType; label: string; locked?: boolean }) {
  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white bg-gradient-to-br from-sky-300/25 via-indigo-400/15 to-purple-400/25 text-indigo-600 shadow-sm">
          <Icon size={18} strokeWidth={1.9} />
        </span>
        <span className="text-[14px] font-medium text-slate-700">{label}</span>
      </div>
      {locked ? (
        <Lock size={15} className="text-violet-500" aria-label="需登录" />
      ) : (
        <ArrowUpRight size={17} className="text-slate-400 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-indigo-600" />
      )}
    </div>
  )
}

const BIG = 'text-[clamp(2.6rem,6vw,4rem)] font-semibold leading-none tracking-[-0.04em] text-grad'

/** 首页便当格:全部服务端渲染,悬停效果纯 CSS */
export function Bento({ data }: { data: BentoData }) {
  const { authed, links, files } = data

  return (
    <div className="grid auto-rows-[minmax(150px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
      <Tile i={0} featured className="sm:col-span-2 lg:col-span-4 lg:row-span-2">
        <Link href="/links" aria-label="收藏夹" className="absolute inset-0 z-0 rounded-[inherit]" />
        <div className="pointer-events-none relative z-10 flex h-full flex-col p-6">
          <Head icon={Bookmark} label="收藏夹" />
          <div className="mt-6"><Count n={links.count} className={BIG} /></div>
          {links.top.length > 0 && (
            <div className="mt-auto grid grid-cols-2 gap-2 pt-6 sm:grid-cols-3">
              {links.top.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  title={l.title}
                  className="pointer-events-auto flex min-h-11 min-w-0 items-center gap-2.5 rounded-2xl border border-white/80 bg-white/60 px-3 py-2 shadow-[0_1px_2px_rgb(30_64_120/0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-300/50 hover:bg-white/90 hover:shadow-[0_10px_24px_-10px_rgb(79_70_229/0.35)]"
                >
                  <Favicon url={l.url} title={l.title} size={20} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-slate-700">{l.title}</span>
                    <span className="block truncate text-[10.5px] text-slate-400">{hostOf(l.url)}</span>
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </Tile>

      <Tile i={1} className="sm:col-span-2 lg:col-span-2 lg:row-span-2">
        <Link href="/files" className="flex h-full flex-col p-6">
          <Head icon={ArrowLeftRight} label="中转站" />
          <div className="mt-6"><Count n={files.count} className={BIG} /></div>
          {files.recent.length > 0 && (
            <ul className="mt-6 space-y-2.5">
              {files.recent.map((f) => (
                <li key={f.id} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white bg-white/70 font-mono text-[9.5px] font-semibold text-slate-500 shadow-sm">
                    {f.name.includes('.') ? f.name.split('.').pop()!.slice(0, 3).toUpperCase() : '·'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700">{f.name}</span>
                  <span className="num shrink-0 text-[11px] text-slate-400">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
          )}
        </Link>
      </Tile>

      {([
        { href: '/competitions', icon: Trophy, label: '竞赛', n: data.competitions },
        { href: '/papers', icon: FileText, label: '论文', n: data.papers },
      ]).map((c, k) => (
        <Tile key={c.href} i={2 + k} className="lg:col-span-3">
          <Link href={authed ? c.href : `/login?next=${c.href}`} aria-label={c.label} className="flex h-full flex-col p-6">
            <Head icon={c.icon} label={c.label} locked={!authed} />
            <div className="mt-auto pt-6">
              {authed ? (
                <Count n={c.n} className={BIG} />
              ) : (
                <span aria-hidden className="flex items-end gap-1.5">
                  {[0.55, 0.85, 0.4, 0.7, 1, 0.6].map((h, i) => (
                    <span key={i} className="w-3 rounded-full bg-gradient-to-t from-indigo-400/15 to-violet-300/35" style={{ height: `${h * 44}px` }} />
                  ))}
                </span>
              )}
            </div>
          </Link>
        </Tile>
      ))}
    </div>
  )
}
