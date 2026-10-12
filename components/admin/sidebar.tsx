'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Bookmark, FolderOpen, Trophy, FileText, Tags, Settings,
  House, LogOut, Menu, X, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const EASE = [0.22, 1, 0.36, 1] as const

const NAV = [
  { href: '/admin', label: '概览', icon: LayoutDashboard },
  { href: '/admin/links', label: '书签', icon: Bookmark },
  { href: '/admin/files', label: '文件', icon: FolderOpen },
  { href: '/admin/competitions', label: '竞赛', icon: Trophy },
  { href: '/admin/papers', label: '论文', icon: FileText },
  { href: '/admin/categories', label: '分类', icon: Tags },
  { href: '/admin/settings', label: '设置', icon: Settings },
]

const isActive = (pathname: string, href: string) =>
  href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(href + '/')

/** rail：md 段只显示图标；full：始终显示文字 */
type Mode = 'rail' | 'full'

function Logo() {
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
      <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-sky-300 via-indigo-400 to-purple-400 shadow-[0_6px_22px_-6px_rgb(129_140_248/0.9)]" />
      <span className="absolute inset-[1px] rounded-[11px] bg-gradient-to-b from-white/35 to-transparent opacity-60" />
      <span className="relative h-2.5 w-2.5 rounded-[4px] bg-[#060818]" />
    </span>
  )
}

function Brand({ title, mode }: { title: string; mode: Mode }) {
  return (
    <Link
      href="/admin"
      title={title}
      aria-label={title}
      className={cn('flex min-w-0 items-center gap-2.5 rounded-xl', mode === 'rail' && 'md:justify-center lg:justify-start lg:px-1.5')}
    >
      <Logo />
      <span className={cn('truncate text-[15px] font-semibold tracking-tight text-white/95', mode === 'rail' && 'md:hidden lg:inline')}>
        {title}
      </span>
    </Link>
  )
}

function NavList({ layoutId, mode, onNavigate }: { layoutId: string; mode: Mode; onNavigate?: () => void }) {
  const pathname = usePathname()
  const rail = mode === 'rail'
  return (
    <nav className="flex flex-col gap-1" aria-label="后台">
      {NAV.map((n) => {
        const active = isActive(pathname, n.href)
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            title={n.label}
            aria-label={n.label}
            aria-current={active ? 'page' : undefined}
            className="group relative block rounded-xl"
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-xl border border-indigo-200/20 bg-[image:var(--grad-soft)] shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_0_24px_-8px_rgb(129_140_248/0.8)]"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              >
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-sky-300 via-indigo-400 to-purple-400 shadow-[0_0_10px_rgb(165_180_252/0.9)]" />
              </motion.span>
            )}
            <span
              className={cn(
                'relative z-[1] flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors duration-200',
                rail && 'md:justify-center md:px-0 lg:justify-start lg:px-3',
                active ? 'text-white' : 'text-indigo-100/50 group-hover:bg-white/[0.04] group-hover:text-white/90',
              )}
            >
              <n.icon
                size={18}
                strokeWidth={active ? 2.2 : 1.9}
                className={cn('shrink-0 transition-transform duration-300 group-hover:scale-110', active && 'text-sky-200 drop-shadow-[0_0_6px_rgb(125_211_252/0.7)]')}
              />
              <span className={cn(rail && 'md:hidden lg:inline')}>{n.label}</span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

function Footer({ mode }: { mode: Mode }) {
  const [busy, setBusy] = useState(false)
  async function logout() {
    setBusy(true)
    try { await fetch('/api/logout', { method: 'POST' }) } finally { window.location.href = '/' }
  }
  const rail = mode === 'rail'
  const btn = 'flex h-10 w-10 items-center justify-center rounded-xl text-indigo-100/50 transition-all duration-200 active:scale-95'
  return (
    <div className={cn('relative flex items-center gap-1 pt-3', rail && 'md:flex-col lg:flex-row')}>
      <div className="hairline absolute inset-x-1 top-0" />
      <Link href="/" className={cn(btn, 'hover:bg-white/[0.07] hover:text-white')} title="前台" aria-label="前台">
        <House size={17} />
      </Link>
      <button
        onClick={logout}
        disabled={busy}
        className={cn(btn, 'hover:bg-rose-500/12 hover:text-rose-300 disabled:opacity-40')}
        title="退出"
        aria-label="退出"
      >
        {busy ? <Loader2 size={17} className="animate-spin" /> : <LogOut size={17} />}
      </button>
    </div>
  )
}

export function Sidebar({ title }: { title: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open])

  const current = NAV.find((n) => isActive(pathname, n.href))

  return (
    <>
      {/* md：图标轨；lg：完整侧栏 */}
      <motion.aside
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="liquid fixed inset-y-3 left-3 z-40 hidden w-[68px] flex-col gap-6 rounded-3xl px-2.5 pb-3 pt-4 md:flex lg:w-56 lg:px-3"
      >
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/50 to-transparent" />
        <div className="pointer-events-none absolute -left-10 top-10 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-purple-400/10 blur-3xl" />
        <Brand title={title} mode="rail" />
        <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <NavList layoutId="admin-nav" mode="rail" />
        </div>
        <Footer mode="rail" />
      </motion.aside>

      {/* 移动端顶栏 */}
      <header className="sticky top-0 z-40 px-3 pt-3 md:hidden">
        <div className="liquid flex h-14 items-center gap-2 rounded-2xl px-2">
          <button
            onClick={() => setOpen(true)}
            className="btn btn-ghost h-10 w-10 p-0"
            aria-label="菜单"
            title="菜单"
            aria-expanded={open}
          >
            <Menu size={18} />
          </button>
          <Brand title={title} mode="full" />
          <AnimatePresence mode="wait" initial={false}>
            {current && (
              <motion.span
                key={current.href}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-indigo-200/15 bg-[image:var(--grad-soft)] px-2.5 py-1 text-[12.5px] text-white/85"
              >
                <current.icon size={13} className="text-sky-200" />
                {current.label}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* 移动端抽屉 */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }} onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%', filter: 'blur(10px)' }}
              animate={{ x: 0, filter: 'blur(0px)' }}
              exit={{ x: '-100%', filter: 'blur(10px)' }}
              transition={{ duration: 0.42, ease: EASE }}
              className="liquid-strong relative flex h-full w-72 max-w-[82vw] flex-col gap-6 rounded-r-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4"
            >
              <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-sky-300/40 via-indigo-300/20 to-purple-400/40" />
              <div className="flex items-center justify-between gap-2">
                <Brand title={title} mode="full" />
                <button onClick={() => setOpen(false)} className="btn btn-ghost h-10 w-10 shrink-0 p-0" aria-label="关闭" title="关闭">
                  <X size={17} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <NavList layoutId="admin-nav-m" mode="full" onNavigate={() => setOpen(false)} />
              </div>
              <Footer mode="full" />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
