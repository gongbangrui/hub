'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bookmark, ArrowLeftRight, Trophy, FileText, LogOut, LayoutGrid, LogIn, Home, Command, CornerDownLeft, Search, Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/primitives'

type Item = { href: string; label: string; icon: React.ElementType; locked?: boolean }

const NAV: Item[] = [
  { href: '/links', label: '收藏夹', icon: Bookmark },
  { href: '/files', label: '中转站', icon: ArrowLeftRight },
  { href: '/competitions', label: '竞赛', icon: Trophy, locked: true },
  { href: '/papers', label: '论文', icon: FileText, locked: true },
]

const SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
}

/** 渐变标志 */
function Mark({ size = 36 }: { size?: number }) {
  return (
    <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-[30%] bg-gradient-to-br from-sky-300 via-indigo-400 to-purple-400 shadow-[0_8px_28px_-6px_rgba(129,140,248,0.8)]" />
      <span className="absolute inset-[1px] rounded-[30%] bg-gradient-to-b from-white/35 to-transparent opacity-70" />
      <span className="relative h-[28%] w-[28%] rounded-[30%] bg-[#060818]" />
    </span>
  )
}

export function SiteNav({ authed, title }: { authed: boolean; title: string }) {
  const pathname = usePathname() ?? '/'
  const [palette, setPalette] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((v) => !v)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <>
      {/* 桌面：左侧液态玻璃竖栏 */}
      <aside className="fixed inset-y-3 left-3 z-40 hidden w-[84px] lg:block">
        <div className="liquid flex h-full flex-col items-center rounded-3xl px-2 py-4">
          <Link href="/" aria-label={title} title={title} className="group mb-5 rounded-2xl p-1">
            <motion.span whileHover={{ rotate: -8, scale: 1.06 }} whileTap={{ scale: 0.92 }} transition={SPRING} className="block">
              <Mark />
            </motion.span>
          </Link>

          <nav className="flex w-full flex-col gap-1">
            {[{ href: '/', label: '首页', icon: Home } as Item, ...NAV].map((n) => {
              const active = isActive(pathname, n.href)
              const lock = n.locked && !authed
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  title={n.label}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex flex-col items-center gap-1 rounded-2xl py-2.5 transition-colors duration-300',
                    active ? 'text-white' : 'text-indigo-100/45 hover:text-indigo-50',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="rail-pill"
                      transition={SPRING}
                      className="absolute inset-0 -z-10 rounded-2xl border border-indigo-200/20 bg-[image:var(--grad-soft)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_24px_-6px_rgba(129,140,248,0.6)]"
                    />
                  )}
                  <span className="relative">
                    <n.icon size={18} strokeWidth={1.9} />
                    {lock && (
                      <Lock size={8} strokeWidth={3} aria-label="需登录"
                            className="absolute -right-2 -top-1.5 text-violet-200/80" />
                    )}
                  </span>
                  <span className="text-[10.5px] tracking-wide">{n.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="mt-auto flex w-full flex-col items-center gap-1.5">
            <button
              onClick={() => setPalette(true)}
              className="btn btn-ghost btn-icon h-10 w-10 rounded-xl"
              aria-label="命令面板 ⌘K" title="⌘K"
            >
              <Command size={16} />
            </button>
            <div className="hairline my-1 w-8" />
            {authed ? (
              <>
                <Link href="/admin" className="btn btn-icon h-10 w-10 rounded-xl" aria-label="后台" title="后台">
                  <LayoutGrid size={16} />
                </Link>
                <form action="/api/logout" method="post">
                  <button className="btn btn-ghost btn-icon h-10 w-10 rounded-xl hover:text-rose-200" aria-label="退出" title="退出">
                    <LogOut size={16} />
                  </button>
                </form>
              </>
            ) : (
              <Link href="/login" className="btn btn-primary shine btn-icon h-10 w-10 rounded-xl" aria-label="登录" title="登录">
                <LogIn size={16} />
              </Link>
            )}
          </div>
        </div>
      </aside>

      {/* 移动端：底部悬浮 dock */}
      <nav
        className="liquid-strong fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-[22px] p-1.5 lg:hidden"
        aria-label="导航"
      >
        {[{ href: '/', label: '首页', icon: Home } as Item, ...NAV].map((n) => {
          const active = isActive(pathname, n.href)
          const lock = n.locked && !authed
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-label={n.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors',
                active ? 'text-white' : 'text-indigo-100/50',
              )}
            >
              {active && (
                <motion.span
                  layoutId="dock-pill"
                  transition={SPRING}
                  className="absolute inset-0 -z-10 rounded-2xl border border-indigo-200/20 bg-[image:var(--grad-soft)]"
                />
              )}
              <n.icon size={19} strokeWidth={1.9} />
              {lock && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-violet-300/80" />}
              {active && <motion.span layoutId="dock-dot" transition={SPRING} className="absolute bottom-1 h-1 w-1 rounded-full bg-sky-200" />}
            </Link>
          )
        })}
        <span className="mx-0.5 h-6 w-px bg-white/10" />
        <button
          onClick={() => setPalette(true)}
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-indigo-100/50 active:scale-95"
          aria-label="命令面板"
        >
          <Search size={18} />
        </button>
        <Link
          href={authed ? '/admin' : '/login'}
          aria-label={authed ? '后台' : '登录'}
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-indigo-100/50 active:scale-95"
        >
          {authed ? <LayoutGrid size={18} /> : <LogIn size={18} />}
        </Link>
      </nav>

      <Palette open={palette} onClose={() => setPalette(false)} authed={authed} />
    </>
  )
}

/** ⌘K 命令面板：页面间跳转 */
function Palette({ open, onClose, authed }: { open: boolean; onClose: () => void; authed: boolean }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  type Cmd = { key: string; label: string; hint: string; icon: React.ElementType; run: () => void }
  const go = useCallback((href: string) => { onClose(); router.push(href) }, [onClose, router])

  const all = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { key: '/', label: '首页', hint: '/', icon: Home, run: () => go('/') },
      ...NAV.map((n) => ({ key: n.href, label: n.label, hint: n.href, icon: n.icon, run: () => go(n.href) })),
    ]
    if (authed) {
      list.push({ key: '/admin', label: '后台', hint: '/admin', icon: LayoutGrid, run: () => go('/admin') })
      list.push({
        key: 'logout', label: '退出', hint: '⏻', icon: LogOut,
        run: async () => { onClose(); await fetch('/api/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/' },
      })
    } else {
      list.push({ key: '/login', label: '登录', hint: '/login', icon: LogIn, run: () => go('/login') })
    }
    return list
  }, [authed, go, onClose])

  const items = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return all
    return all.filter((c) => c.label.toLowerCase().includes(s) || c.hint.toLowerCase().includes(s))
  }, [all, q])

  useEffect(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30) }
  }, [open])
  useEffect(() => { setIdx(0) }, [q])

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); items[idx]?.run() }
  }

  return (
    <Modal open={open} onClose={onClose} className="max-w-md">
      <div className="-mx-2 -my-1" onKeyDown={onKey}>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-200/40" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="跳转"
            aria-label="跳转"
            className="field h-11 pl-10 pr-14"
          />
          <span className="kbd absolute right-3 top-1/2 -translate-y-1/2">esc</span>
        </div>
        <ul className="mt-3 max-h-[50vh] space-y-0.5 overflow-y-auto" role="listbox">
          {items.map((c, i) => (
            <li key={c.key} role="option" aria-selected={i === idx}>
              <button
                onMouseEnter={() => setIdx(i)}
                onClick={() => c.run()}
                className={cn(
                  'relative flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] transition-colors',
                  i === idx ? 'text-white' : 'text-indigo-100/60',
                )}
              >
                {i === idx && (
                  <motion.span layoutId="palette-hl" transition={SPRING}
                    className="absolute inset-0 -z-10 rounded-xl border border-indigo-200/15 bg-[image:var(--grad-soft)]" />
                )}
                <c.icon size={16} className="shrink-0 opacity-80" />
                <span className="flex-1">{c.label}</span>
                <span className="font-mono text-[11px] text-indigo-100/30">{c.hint}</span>
                {i === idx && <CornerDownLeft size={13} className="text-indigo-100/50" />}
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="py-6 text-center text-indigo-100/30">∅</li>}
        </ul>
      </div>
    </Modal>
  )
}
