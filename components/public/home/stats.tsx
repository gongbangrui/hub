import { Bookmark, FileText, HardDrive, Activity } from 'lucide-react'
import { Count } from '@/components/ui/page'
import { formatBytes } from '@/lib/utils'

function Card({ icon: Icon, label, i, children, foot, tone }: {
  icon: React.ElementType; label: string; i: number; children: React.ReactNode; foot?: React.ReactNode; tone: string
}) {
  return (
    <div className="enter liquid liquid-hover spotlight flex flex-col rounded-3xl p-5" style={{ ['--i' as string]: i }}>
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-slate-500">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={17} strokeWidth={1.9} /></span>
      </div>
      <div className="mt-3 flex-1">{children}</div>
      {foot && <div className="mt-3 text-[12px] text-slate-500">{foot}</div>}
    </div>
  )
}

function Ring({ pct }: { pct: number }) {
  const R = 30
  const C = 2 * Math.PI * R
  return (
    <svg viewBox="0 0 76 76" className="h-[76px] w-[76px] -rotate-90">
      <defs>
        <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" /><stop offset="55%" stopColor="#6366f1" /><stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <circle cx="38" cy="38" r={R} fill="none" stroke="rgb(15 23 42 / 0.07)" strokeWidth="8" />
      <circle
        cx="38" cy="38" r={R} fill="none" stroke="url(#ring-g)" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(pct, pct > 0 ? 0.02 : 0))}
        className="ring-draw" style={{ ['--c' as string]: C }}
      />
    </svg>
  )
}

export function Stats({ links, files, used, quota, trend, clicks }: {
  links: { count: number; week: number }
  files: { count: number; bytes: number }
  used: number
  quota: number
  trend: number[]
  clicks: number
}) {
  const pct = quota ? Math.min(1, used / quota) : 0
  const max = Math.max(1, ...trend)
  const total = trend.reduce((a, b) => a + b, 0)

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Card i={0} icon={Bookmark} label="收藏" tone="bg-sky-400/15 text-sky-600"
            foot={<>本周 <b className="num font-semibold text-sky-600">+{links.week}</b> · 点击 <span className="num">{clicks}</span></>}>
        <Count n={links.count} className="text-[2.6rem] font-semibold leading-none tracking-[-0.04em] text-slate-900" />
      </Card>

      <Card i={1} icon={FileText} label="文件" tone="bg-indigo-400/15 text-indigo-600"
            foot={<span className="num">{formatBytes(files.bytes)}</span>}>
        <Count n={files.count} className="text-[2.6rem] font-semibold leading-none tracking-[-0.04em] text-slate-900" />
      </Card>

      <Card i={2} icon={HardDrive} label="存储" tone="bg-violet-400/15 text-violet-600"
            foot={<span className="num">{formatBytes(used)} / {formatBytes(quota)}</span>}>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Ring pct={pct} />
            <span className="num absolute inset-0 flex items-center justify-center text-[13px] font-semibold text-slate-700">
              {Math.round(pct * 100)}%
            </span>
          </div>
        </div>
      </Card>

      <Card i={3} icon={Activity} label="近 14 天" tone="bg-teal-400/15 text-teal-600"
            foot={<>新增 <b className="num font-semibold text-teal-600">{total}</b> 条</>}>
        <div className="flex h-[76px] items-end gap-[3px]" aria-hidden>
          {trend.map((n, i) => (
            <span
              key={i}
              className="bar-grow flex-1 rounded-t-[4px]"
              style={{
                height: `${Math.max(8, (n / max) * 100)}%`,
                background: n ? 'linear-gradient(180deg,#38bdf8,#6366f1)' : 'rgb(15 23 42 / 0.08)',
                animationDelay: `${0.25 + i * 0.03}s`,
              }}
              title={String(n)}
            />
          ))}
        </div>
      </Card>
    </div>
  )
}
