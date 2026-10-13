'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { m as motion, AnimatePresence } from 'framer-motion'
import { Search, X, Check, Minus, CircleAlert, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Counter } from '@/components/ui/fx'

const EASE = [0.22, 1, 0.36, 1] as const

/* ---------- 页标题 ---------- */

/** 渐变标题 + 计数胶囊；eyebrow 仅为兼容保留，不再渲染 */
export function AdminTitle({ title, count, actions, icon }: {
  eyebrow?: string; title: string; count?: number; actions?: React.ReactNode; icon?: React.ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <motion.h1
        className="flex min-w-0 items-center gap-3"
        initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        {icon && (
          <span className="liquid flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-slate-700">{icon}</span>
        )}
        <span className="title-xl text-[clamp(1.6rem,3.4vw,2.3rem)]">{title}</span>
        {count !== undefined && (
          <motion.span
            key={count}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            className="num rounded-full border border-indigo-300/25 bg-[image:var(--grad-soft)] px-2.5 py-0.5 text-[12px] font-medium text-slate-700 shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]"
          >
            {count}
          </motion.span>
        )}
      </motion.h1>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/* ---------- 统计卡片 ---------- */

/** cyan / fuchsia 为旧名，映射到新色板 */
const TONE = {
  sky: { icon: 'text-sky-600 bg-sky-400/12 border-sky-300/25', glow: 'from-sky-400/30' },
  cyan: { icon: 'text-sky-600 bg-sky-400/12 border-sky-300/25', glow: 'from-sky-400/30' },
  indigo: { icon: 'text-indigo-500 bg-indigo-400/12 border-indigo-300/25', glow: 'from-indigo-400/30' },
  violet: { icon: 'text-violet-600 bg-violet-400/12 border-violet-300/25', glow: 'from-violet-400/30' },
  purple: { icon: 'text-violet-600 bg-purple-400/12 border-purple-300/25', glow: 'from-purple-400/30' },
  fuchsia: { icon: 'text-violet-600 bg-purple-400/12 border-purple-300/25', glow: 'from-purple-400/30' },
  amber: { icon: 'text-amber-700 bg-amber-400/12 border-amber-300/25', glow: 'from-amber-400/25' },
  emerald: { icon: 'text-emerald-600 bg-emerald-400/12 border-emerald-300/25', glow: 'from-emerald-400/25' },
  rose: { icon: 'text-rose-600 bg-rose-400/12 border-rose-300/25', glow: 'from-rose-400/25' },
} as const

export type Tone = keyof typeof TONE

export function StatCard({ label, value, hint, icon, tone = 'sky', href }: {
  label: string; value: number | string; hint?: React.ReactNode; icon?: React.ReactNode; tone?: Tone; href?: string
}) {
  const t = TONE[tone]
  const body = (
    <div
      className={cn(
        'liquid relative h-full overflow-hidden rounded-3xl p-4',
        href && 'liquid-hover spotlight grad-border transition-transform duration-300 hover:-translate-y-0.5',
      )}
    >
      <div className={cn('pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br to-transparent blur-2xl', t.glow)} />
      <div className="relative flex items-center justify-between gap-3">
        <p className="text-[12px] font-medium text-slate-600">{label}</p>
        {icon && <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl border', t.icon)}>{icon}</span>}
      </div>
      <div className="relative mt-3 text-[30px] font-semibold leading-none tracking-tight text-slate-900">
        {typeof value === 'number' ? <Counter value={value} /> : <span className="num">{value}</span>}
      </div>
      {hint && <div className="relative mt-2.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-slate-500">{hint}</div>}
    </div>
  )
  return href ? <Link href={href} className="block h-full rounded-3xl">{body}</Link> : body
}

/* ---------- 工具条 / 搜索 ---------- */

export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('liquid sticky top-[76px] z-30 mb-4 flex flex-wrap items-center gap-2 rounded-2xl p-2 md:top-4', className)}>
      {children}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = '搜索', className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <div className={cn('relative min-w-[160px] flex-1', className)}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        placeholder={placeholder}
        aria-label={placeholder}
        className="field h-10 pl-9 pr-9"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-900/40 transition-colors hover:bg-slate-900/10 hover:text-slate-900"
          aria-label="清空"
          title="清空"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

/* ---------- 复选框 / 选择 ---------- */

export function Checkbox({ checked, indeterminate, onChange, className }: {
  checked: boolean; indeterminate?: boolean; onChange: (next: boolean) => void; className?: string
}) {
  const on = checked || indeterminate
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      className={cn(
        'relative flex h-[18px] before:absolute before:-inset-[11px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-all duration-200',
        on
          ? 'border-transparent bg-gradient-to-br from-sky-300 via-indigo-400 to-purple-400 text-white shadow-[0_0_14px_-2px_rgb(129_140_248/0.7)]'
          : 'border-slate-900/14 bg-slate-900/4 hover:border-indigo-300/50',
        className,
      )}
    >
      <AnimatePresence initial={false}>
        {on && (
          <motion.span
            key={indeterminate ? 'mix' : 'on'}
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            {indeterminate ? <Minus size={12} strokeWidth={3.2} /> : <Check size={12} strokeWidth={3.2} />}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

export function useSelection<T extends { id: number }>(items: T[]) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set())

  // 列表变化时剔除已不存在的 id
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const ids = new Set(items.map((i) => i.id))
      let changed = false
      const next = new Set<number>()
      prev.forEach((id) => (ids.has(id) ? next.add(id) : (changed = true)))
      return changed ? next : prev
    })
  }, [items])

  const allChecked = items.length > 0 && items.every((i) => selected.has(i.id))
  const someChecked = selected.size > 0 && !allChecked

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected(allChecked ? new Set() : new Set(items.map((i) => i.id)))
  }, [allChecked, items])

  const clear = useCallback(() => setSelected(new Set()), [])

  return { selected, toggle, toggleAll, clear, allChecked, someChecked }
}

/* ---------- 批量操作条 ---------- */

export function BulkBar({ count, onClear, children }: {
  count: number; onClear: () => void; children: React.ReactNode
}) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:pl-[92px] lg:pl-64">
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
            animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ y: 40, opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="liquid-strong grad-border pointer-events-auto relative flex max-w-full items-center gap-2 overflow-x-auto rounded-2xl py-1.5 pl-2 pr-1.5"
            data-active="true"
          >
            <motion.span
              key={count}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 26 }}
              className="num flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-xl bg-[image:var(--grad)] px-2 text-[13px] font-semibold text-white"
              title="已选"
            >
              <Check size={13} strokeWidth={3} />{count}
            </motion.span>
            <div className="flex shrink-0 items-center gap-1.5">{children}</div>
            <button onClick={onClear} className="btn btn-ghost btn-icon h-9 w-9 shrink-0 p-0" aria-label="取消选择" title="取消选择">
              <X size={15} />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ---------- 表格 ---------- */

/** head 传入一组 <Th>，children 传入 <Tr> 行；empty 有值时替代表体 */
export function AdminTable({ head, children, empty, className }: {
  head: React.ReactNode; children?: React.ReactNode; empty?: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('liquid overflow-hidden rounded-3xl', className)}>
      {empty ? (
        <div>{empty}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-slate-900/7 bg-gradient-to-r from-sky-300/[0.04] via-indigo-300/[0.03] to-purple-300/[0.04]">{head}</tr>
            </thead>
            <tbody className="divide-y divide-slate-900/5">{children}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function Th({ className, children, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn('label whitespace-nowrap px-3 py-3 text-left font-medium first:pl-4 last:pr-4', className)} {...rest}>
      {children}
    </th>
  )
}

export function Td({ className, children, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-3 py-2.5 align-middle first:pl-4 last:pr-4', className)} {...rest}>
      {children}
    </td>
  )
}

export function Tr({ selected, className, children, ...rest }: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr data-selected={selected ? 'true' : undefined} className={cn('admin-row group', className)} {...rest}>
      {children}
    </tr>
  )
}

/* ---------- Toast ---------- */

type ToastTone = 'ok' | 'err' | 'info'
type ToastItem = { id: number; msg: string; tone: ToastTone }

let toasts: ToastItem[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const EMPTY: ToastItem[] = []

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function toast(msg: string, tone: ToastTone = 'ok') {
  const id = ++seq
  toasts = [...toasts.slice(-3), { id, msg, tone }]
  emit()
  setTimeout(() => dismiss(id), tone === 'err' ? 4200 : 2600)
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

const TOAST_STYLE = {
  ok: { icon: <Check size={13} strokeWidth={3} />, cls: 'bg-emerald-400/15 text-emerald-600 border-emerald-300/30', bar: 'from-emerald-300 to-sky-300' },
  err: { icon: <CircleAlert size={14} />, cls: 'bg-rose-400/15 text-rose-600 border-rose-300/30', bar: 'from-rose-400 to-purple-400' },
  info: { icon: <Info size={14} />, cls: 'bg-sky-400/15 text-sky-600 border-sky-300/30', bar: 'from-sky-300 via-indigo-400 to-purple-400' },
} as const

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => EMPTY)
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:items-end"
    >
      <AnimatePresence initial={false}>
        {list.map((t) => {
          const st = TOAST_STYLE[t.tone]
          return (
            <motion.div
              key={t.id}
              layout
              role={t.tone === 'err' ? 'alert' : 'status'}
              initial={{ opacity: 0, y: -14, scale: 0.94, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 28, scale: 0.96, filter: 'blur(6px)' }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              onClick={() => dismiss(t.id)}
              className={cn(
                'liquid-strong pointer-events-auto relative flex max-w-[min(24rem,calc(100vw-2rem))] cursor-pointer items-center gap-2.5 overflow-hidden rounded-2xl py-2 pl-2 pr-4 text-[13px]',
                t.tone === 'err' && 'border-rose-400/30',
              )}
            >
              <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border', st.cls)}>{st.icon}</span>
              <span className="min-w-0 break-words text-slate-900/90">{t.msg}</span>
              <motion.span
                className={cn('absolute bottom-0 left-0 h-[2px] w-full origin-left bg-gradient-to-r opacity-70', st.bar)}
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: (t.tone === 'err' ? 4200 : 2600) / 1000, ease: 'linear' }}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

/* ---------- API ---------- */

type ApiInit = Omit<RequestInit, 'body'> & { body?: unknown }

/** JSON fetch；对象 body 自动序列化，非 2xx 抛出响应中的 error 字段 */
export async function api<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const { body, headers, ...rest } = init
  const isRaw = body === undefined || typeof body === 'string' || body instanceof FormData || body instanceof Blob
  const res = await fetch(path, {
    ...rest,
    headers: isRaw ? headers : { 'Content-Type': 'application/json', ...(headers as Record<string, string> | undefined) },
    body: isRaw ? (body as BodyInit | undefined) : JSON.stringify(body),
  })
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const err = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : ''
    throw new Error(err || (res.status === 401 ? '未登录' : `请求失败 ${res.status}`))
  }
  return data as T
}

/** 执行写操作：成功 toast + 刷新服务端数据，失败 toast 错误 */
export function useMutate() {
  const router = useRouter()
  // 用计数器而不是布尔：批量操作会并发发起多个请求，
  // 最快那个先结束时若直接把 pending 置 false，其余请求还在飞，按钮就又能点了
  const [inflight, setInflight] = useState(0)
  const run = useCallback(async <R,>(fn: () => Promise<R>, okMsg?: string): Promise<R | undefined> => {
    setInflight((n) => n + 1)
    try {
      const r = await fn()
      if (okMsg) toast(okMsg)
      return r
    } catch (e) {
      toast(e instanceof Error ? e.message : '操作失败', 'err')
      return undefined
    } finally {
      setInflight((n) => n - 1)
      // 无论成败都刷新：批量请求里只要有一个失败，其余成功的改动也必须反映到界面上
      router.refresh()
    }
  }, [router])
  const pending = inflight > 0
  return useMemo(() => ({ run, pending }), [run, pending])
}
