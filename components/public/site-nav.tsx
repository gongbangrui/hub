'use client'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { m as motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import {
  Bookmark, ArrowLeftRight, Trophy, FileText, LogOut, LayoutGrid, LogIn, Home, Search, Lock, Keyboard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/primitives'

// 命令面板第一次打开时才下载
const CommandPalette = dynamic(() => import('./command-palette'), { ssr: false })

type Item = { href: string; label: string; icon: React.ElementType; locked?: boolean; key?: string }

const HOME: Item = { href: '/', label: '首页', icon: Home, key: 'h' }
const NAV: Item[] = [
  { href: '/links', label: '收藏夹', icon: Bookmark, key: 'l' },
  { href: '/files', label: '中转站', icon: ArrowLeftRight, key: 'f' },
  { href: '/competitions', label: '竞赛', icon: Trophy, locked: true, key: 'c' },
  { href: '/papers', label: '论文', icon: FileText, locked: true, key: 'p' },
]
const ALL = [HOME, ...NAV]

const SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
}

/** 渐变标志 */
function Mark({ size = 36 }: { size?: number }) {
  return (
    <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-[30%] bg-gradient-to-br from-sky-400 via-indigo-500 to-violet-500 shadow-[0_8px_24px_-6px_rgba(79,70,229,0.65)]" />
      <span className="absolute inset-[1px] rounded-[30%] bg-gradient-to-b from-white/50 to-transparent opacity-70" />
      <span className="relative h-[28%] w-[28%] rounded-[30%] bg-white/95" />
    </span>
  )
}

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function SiteNav({ authed, title }: { authed: boolean; title: string }) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const [palette, setPalette] = useState(false)
  const [everOpened, setEverOpened] = useState(false)
  const [help, setHelp] = useState(false)
  const gPending = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openSearch = () => { setEverOpened(true); setPalette(true) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setEverOpened(true)
        setPalette((v) => !v)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return
      if (e.key === '/') { e.preventDefault(); openSearch(); return }
      if (e.key === '?') { e.preventDefault(); setHelp(true); return }
      // g 加字母:跳转页面(vim 风格)
      if (gPending.current) {
        clearTimeout(gPending.current); gPending.current = null
        const hit = ALL.find((n) => n.key === e.key.toLowerCase())
        if (hit) { e.preventDefault(); router.push(hit.href) }
        return
      }
      if (e.key === 'g') gPending.current = setTimeout(() => { gPending.current = null }, 900)
    }
    const onOpen = () => openSearch()
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-search', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('open-search', onOpen) }
  }, [router])

  return (
    <>
      {/* 桌面:左侧液态玻璃竖栏 */}
      <aside className="fixed inset-y-3 left-3 z-40 hidden w-[84px] lg:block">
        <div className="liquid liquid-blur flex h-full flex-col items-center rounded-3xl px-2 py-4">
          <Link href="/" aria-label={title} title={title} className="group mb-5 rounded-2xl p-1">
            <motion.span whileHover={{ rotate: -8, scale: 1.08 }} whileTap={{ scale: 0.92 }} transition={SPRING} className="block">
              <Mark />
            </motion.span>
          </Link>

          <nav className="flex w-full flex-col gap-1">
            {ALL.map((n) => {
              const active = isActive(pathname, n.href)
              const lock = n.locked && !authed
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  title={`${n.label}${n.key ? `  (g ${n.key})` : ''}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group/nav relative flex flex-col items-center gap-1 rounded-2xl py-2.5 transition-colors duration-300',
                    active ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="rail-pill"
                      transition={SPRING}
                      className="absolute inset-0 -z-10 rounded-2xl border border-white bg-white/80 shadow-[0_8px_20px_-8px_rgba(79,70,229,0.45),inset_0_1px_0_#fff]"
                    />
                  )}
                  <span className="relative transition-transform duration-300 group-hover/nav:-translate-y-0.5 group-hover/nav:scale-110">
                    <n.icon size={18} strokeWidth={1.9} />
                    {lock && (
                      <Lock size={8} strokeWidth={3} aria-label="需登录" className="absolute -right-2 -top-1.5 text-violet-500" />
                    )}
                  </span>
                  <span className="text-[10.5px] tracking-wide">{n.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="mt-auto flex w-full flex-col items-center gap-1.5">
            <button onClick={openSearch} className="btn btn-ghost btn-icon h-10 w-10 rounded-xl" aria-label="搜索 ⌘K" title="搜索 ⌘K">
              <Search size={16} />
            </button>
            <button onClick={() => setHelp(true)} className="btn btn-ghost btn-icon h-10 w-10 rounded-xl" aria-label="快捷键 ?" title="快捷键 ?">
              <Keyboard size={16} />
            </button>
            <div className="hairline my-1 w-8" />
            {authed ? (
              <>
                <Link href="/admin" className="btn btn-icon h-10 w-10 rounded-xl" aria-label="后台" title="后台">
                  <LayoutGrid size={16} />
                </Link>
                <form action="/api/logout" method="post">
                  <button className="btn btn-ghost btn-icon h-10 w-10 rounded-xl hover:text-rose-600" aria-label="退出" title="退出">
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

      {/* 移动端:底部悬浮 dock
          8 个 44px 的格子加上间隙在 320-375px 的机型上会顶出屏幕，
          窄屏统一缩到 36px（8×36 + 间隔 ≈ 308px，320px 也能放下） */}
      <nav
        className="liquid-strong fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-[22px] p-1.5 lg:hidden"
        aria-label="导航"
      >
        {ALL.map((n) => {
          const active = isActive(pathname, n.href)
          const lock = n.locked && !authed
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-label={n.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors max-[380px]:h-9 max-[380px]:w-9',
                active ? 'text-indigo-700' : 'text-slate-500',
              )}
            >
              {active && (
                <motion.span
                  layoutId="dock-pill"
                  transition={SPRING}
                  className="absolute inset-0 -z-10 rounded-2xl border border-white bg-white/90 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.5)]"
                />
              )}
              <n.icon size={19} strokeWidth={1.9} className="max-[380px]:h-[17px] max-[380px]:w-[17px]" />
              {lock && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-violet-400" />}
            </Link>
          )
        })}
        <span className="mx-0.5 h-6 w-px bg-slate-900/10" />
        <button onClick={openSearch} className="flex h-11 w-11 items-center justify-center rounded-2xl text-slate-500 active:scale-95 max-[380px]:h-9 max-[380px]:w-9" aria-label="搜索">
          <Search size={18} className="max-[380px]:h-4 max-[380px]:w-4" />
        </button>
        <Link
          href={authed ? '/admin' : '/login'}
          aria-label={authed ? '后台' : '登录'}
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-slate-500 active:scale-95 max-[380px]:h-9 max-[380px]:w-9"
        >
          {authed ? <LayoutGrid size={18} className="max-[380px]:h-4 max-[380px]:w-4" /> : <LogIn size={18} className="max-[380px]:h-4 max-[380px]:w-4" />}
        </Link>
      </nav>

      {everOpened && <CommandPalette open={palette} onClose={() => setPalette(false)} authed={authed} />}
      <ShortcutHelp open={help} onClose={() => setHelp(false)} />
    </>
  )
}

function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows: [string[], string][] = [
    [['⌘', 'K'], '全局搜索'],
    [['/'], '全局搜索'],
    [['g', 'h'], '回到首页'],
    [['g', 'l'], '收藏夹'],
    [['g', 'f'], '中转站'],
    [['g', 'c'], '竞赛'],
    [['g', 'p'], '论文'],
    [['?'], '本面板'],
  ]
  return (
    <Modal open={open} onClose={onClose} className="max-w-sm" title={<span className="flex items-center gap-2"><Keyboard size={15} className="text-indigo-500" /> 快捷键</span>}>
      <ul className="space-y-1">
        {rows.map(([keys, label], i) => (
          <li key={i} className="flex items-center justify-between rounded-xl px-2 py-1.5 text-[13.5px] text-slate-600">
            <span>{label}</span>
            <span className="flex items-center gap-1">
              {keys.map((k, j) => (<span key={j} className="flex items-center gap-1">{j > 0 && <span className="text-[11px] text-slate-300">then</span>}<kbd className="kbd">{k}</kbd></span>))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
