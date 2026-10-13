'use client'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'

/** 顶部细进度条:点击站内链接即开始,路由落地后收尾。给「切换页面」一个即时反馈 */
function Bar() {
  const pathname = usePathname()
  const search = useSearchParams()
  const [w, setW] = useState(0)
  const [show, setShow] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    function clear() { if (timer.current) { clearInterval(timer.current); timer.current = null } }
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a')
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const u = new URL(a.href, location.href)
      if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search)) return
      clear()
      setShow(true); setW(12)
      timer.current = setInterval(() => setW((x) => x + (90 - x) * 0.12), 160)
    }
    document.addEventListener('click', onClick, true)
    return () => { document.removeEventListener('click', onClick, true); clear() }
  }, [])

  // 路由落地:冲到 100% 再淡出
  useEffect(() => {
    if (!show) return
    if (timer.current) { clearInterval(timer.current); timer.current = null }
    setW(100)
    const t = setTimeout(() => { setShow(false); setW(0) }, 320)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[3px]" style={{ opacity: show ? 1 : 0, transition: 'opacity 260ms' }}>
      <div
        className="h-full rounded-r-full"
        style={{
          width: `${w}%`, transition: 'width 220ms var(--ease-out-expo)',
          background: 'var(--grad)', boxShadow: '0 0 12px rgb(99 102 241 / 0.6)',
        }}
      />
    </div>
  )
}

export function RouteProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>
}
