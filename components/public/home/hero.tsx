import Link from 'next/link'
import { ArrowLeftRight, Bookmark, Check, Sparkles, UploadCloud } from 'lucide-react'
import { Favicon } from '@/components/ui/favicon'
import { SearchTrigger } from './search-trigger'
import { formatBytes, hostOf } from '@/lib/utils'

type Props = {
  title: string
  line: string
  subtitle: string
  links: { id: number; title: string; url: string }[]
  files: { id: number; name: string; size: number }[]
  counts: { links: number; files: number; used: number }
}

/** 首屏:全部服务端渲染 + CSS 动画,不等水合就完整可见(LCP) */
export function Hero({ title, line, subtitle, links, files, counts }: Props) {
  const lines = (line || title).split(/[，,\n]/).map((l) => l.trim()).filter(Boolean)

  return (
    <section className="relative grid items-center gap-10 pt-4 lg:grid-cols-[1.1fr_0.9fr] lg:pt-10">
      <div className="min-w-0">
        <span className="enter liquid inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium text-slate-600" style={{ ['--i' as string]: 0 }}>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500" />
          </span>
          {title}
          <Sparkles size={12} className="text-violet-500" />
        </span>

        <h1 className="mt-6 text-[clamp(2.5rem,7.2vw,5.2rem)] font-bold leading-[1.04] tracking-[-0.045em]">
          {lines.map((l, i) => (
            <span
              key={i}
              className={`enter-blur block ${i === lines.length - 1 ? 'text-grad text-grad-anim pb-1' : 'title-xl'}`}
              style={{ ['--i' as string]: i + 1 }}
            >
              {l}
            </span>
          ))}
        </h1>

        {subtitle && (
          <p className="enter mt-5 max-w-xl text-[15.5px] leading-relaxed text-slate-500" style={{ ['--i' as string]: lines.length + 1 }}>
            {subtitle}
          </p>
        )}

        <div className="enter mt-8 max-w-xl" style={{ ['--i' as string]: lines.length + 2 }}>
          <SearchTrigger label="搜索链接、文件、竞赛、论文…" />
        </div>

        <div className="enter mt-5 flex flex-wrap items-center gap-3" style={{ ['--i' as string]: lines.length + 3 }}>
          <Link href="/files" className="btn btn-primary shine h-11 px-5">
            <UploadCloud size={16} /> 上传文件
          </Link>
          <Link href="/links" className="btn h-11 px-5">
            <Bookmark size={16} className="text-indigo-500" /> 浏览收藏
          </Link>
          <span className="num ml-1 hidden text-[12.5px] text-slate-500 sm:inline">
            {counts.links} 链接 · {counts.files} 文件 · {formatBytes(counts.used)}
          </span>
        </div>
      </div>

      {/* 右侧:悬浮的玻璃卡片组,内容取自真实数据 */}
      <div aria-hidden className="relative hidden h-[430px] lg:block">
        <div className="enter float absolute right-0 top-0 w-[300px] rotate-[3deg]" style={{ ['--i' as string]: 3, animationDelay: '0s' }}>
          <div className="liquid liquid-blur rounded-3xl p-4">
            <div className="mb-3 flex items-center gap-2 text-[12.5px] font-medium text-slate-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400/20 to-indigo-500/20 text-indigo-600"><Bookmark size={14} /></span>
              收藏夹
            </div>
            <div className="space-y-1.5">
              {(links.length ? links : [{ id: 0, title: '—', url: 'https://example.com' }]).slice(0, 3).map((l) => (
                <div key={l.id} className="flex items-center gap-2.5 rounded-xl bg-white/70 px-2.5 py-2">
                  <Favicon url={l.url} title={l.title} size={20} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-slate-700">{l.title}</span>
                    <span className="block truncate text-[10.5px] text-slate-400">{hostOf(l.url)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="enter absolute left-2 top-[215px] w-[290px] -rotate-[4deg]" style={{ ['--i' as string]: 4 }}>
          <div className="float liquid liquid-blur rounded-3xl p-4" style={{ animationDelay: '-2s', animationDuration: '7s' }}>
            <div className="mb-3 flex items-center gap-2 text-[12.5px] font-medium text-slate-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-400/20 to-sky-500/20 text-violet-600"><ArrowLeftRight size={14} /></span>
              中转站
            </div>
            <div className="space-y-1.5">
              {files.slice(0, 2).map((f) => (
                <div key={f.id} className="flex items-center gap-2.5 rounded-xl bg-white/70 px-2.5 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900/5 font-mono text-[9px] font-semibold text-slate-500">
                    {f.name.includes('.') ? f.name.split('.').pop()!.slice(0, 3).toUpperCase() : '·'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-700">{f.name}</span>
                  <span className="num text-[10.5px] text-slate-400">{formatBytes(f.size)}</span>
                </div>
              ))}
              {files.length === 0 && (
                <div className="rounded-xl border border-dashed border-indigo-300/50 bg-white/50 px-3 py-4 text-center text-[12px] text-slate-400">
                  拖拽文件到这里
                </div>
              )}
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-900/5">
                <div className="h-full w-[68%] rounded-full" style={{ background: 'var(--grad)' }} />
              </div>
            </div>
          </div>
        </div>

        <div className="enter absolute bottom-0 right-6" style={{ ['--i' as string]: 5 }}>
          <div className="float flex h-24 w-24 items-center justify-center rounded-full text-white shadow-[0_24px_48px_-12px_rgba(79,70,229,0.55)]"
               style={{ background: 'radial-gradient(circle at 30% 25%, #bae6fd 0%, #38bdf8 28%, #6366f1 70%, #7c3aed 100%)', animationDuration: '8s' }}>
            <span className="absolute left-4 top-3 h-6 w-9 -rotate-[24deg] rounded-full bg-white/50 blur-[2px]" />
            <Check size={30} strokeWidth={2.6} />
          </div>
        </div>
      </div>
    </section>
  )
}
