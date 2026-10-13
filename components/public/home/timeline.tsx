import Link from 'next/link'
import { Bookmark, FileText, Trophy, Paperclip, Inbox } from 'lucide-react'
import { timeAgo, type Activity } from '@/lib/stats'
import { hostOf } from '@/lib/utils'

const KIND = {
  link: { icon: Bookmark, label: '收藏', cls: 'bg-sky-400/15 text-sky-600' },
  file: { icon: Paperclip, label: '文件', cls: 'bg-indigo-400/15 text-indigo-600' },
  competition: { icon: Trophy, label: '竞赛', cls: 'bg-amber-400/15 text-amber-600' },
  paper: { icon: FileText, label: '论文', cls: 'bg-violet-400/15 text-violet-600' },
} as const

export function Timeline({ items, now }: { items: Activity[]; now: number }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
        <Inbox size={28} strokeWidth={1.5} />
        <span className="text-[13px]">还没有动态</span>
      </div>
    )
  }
  return (
    <ol className="relative">
      <span aria-hidden className="absolute bottom-3 left-[21px] top-3 w-px bg-gradient-to-b from-sky-300/70 via-indigo-300/40 to-transparent" />
      {items.map((a, i) => {
        const k = KIND[a.kind]
        const sub = a.kind === 'link' && a.sub ? hostOf(a.sub) : a.sub
        return (
          <li key={`${a.kind}-${a.id}`} className="enter" style={{ ['--i' as string]: i + 2 }}>
            <Link href={a.href} className="group relative flex items-center gap-4 rounded-2xl px-1.5 py-2.5 transition-colors hover:bg-white/70">
              <span className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-4 ring-[#f3f8ff] transition-transform duration-300 group-hover:scale-110 ${k.cls}`}>
                <k.icon size={16} strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-slate-800">{a.title}</span>
                <span className="block truncate text-[11.5px] text-slate-400">{k.label}{sub ? ` · ${sub}` : ''}</span>
              </span>
              <time className="num shrink-0 text-[11.5px] text-slate-400" dateTime={new Date(a.at).toISOString()}>{timeAgo(a.at, now)}</time>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
