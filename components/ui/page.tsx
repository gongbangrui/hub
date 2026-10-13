import { cn } from '@/lib/utils'

/** 服务端可渲染的页面级小件:入场动画全用 CSS(.enter),不等水合 */

export function GradText({ children, className, animated }: { children: React.ReactNode; className?: string; animated?: boolean }) {
  return <span className={cn('text-grad', animated && 'text-grad-anim', className)}>{children}</span>
}

/** 页面标题:图标 + 短标题 + 计数 */
export function PageTitle({ icon, title, count, right, className }: {
  icon?: React.ReactNode; title: string; count?: number | string; right?: React.ReactNode; className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-center justify-between gap-4', className)}>
      <div className="enter flex items-center gap-3" style={{ ['--i' as string]: 0 }}>
        {icon && (
          <span className="liquid flex h-11 w-11 items-center justify-center rounded-2xl text-indigo-500">
            {icon}
          </span>
        )}
        <h1 className="title-xl text-[clamp(1.75rem,4vw,2.6rem)]">{title}</h1>
        {count !== undefined && (
          <span className="num rounded-full border border-indigo-300/40 bg-indigo-400/10 px-2.5 py-0.5 text-[12px] font-medium text-indigo-600">{count}</span>
        )}
      </div>
      {right && <div className="enter flex flex-wrap items-center gap-2" style={{ ['--i' as string]: 1 }}>{right}</div>}
    </header>
  )
}

/** 小统计块 */
export function Stat({ icon, value, label, className }: { icon?: React.ReactNode; value: React.ReactNode; label?: string; className?: string }) {
  return (
    <div className={cn('liquid spotlight flex items-center gap-3 rounded-2xl px-4 py-3', className)} title={label}>
      {icon && <span className="text-indigo-500">{icon}</span>}
      <span className="num text-lg font-semibold tracking-tight text-slate-900">{value}</span>
      {label && <span className="text-[11px] text-slate-500">{label}</span>}
    </div>
  )
}

/** 纯 CSS 数字滚动:SSR 即显示终值,支持 @property 的浏览器会从 0 滚上去 */
export function Count({ n, className }: { n: number; className?: string }) {
  const v = Math.max(0, Math.round(n))
  return <span className={cn('count num', className)} style={{ ['--to' as string]: v }} aria-label={String(v)} />
}
