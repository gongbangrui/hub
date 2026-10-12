'use client'
import { useEffect } from 'react'

/**
 * 全局指针特效（事件委托，一个监听器服务全站）：
 * - 给光标下最近的 .spotlight 写入 --mx/--my，驱动 CSS 聚光
 * - 跟随光标的柔光（仅精确指针设备）
 */
export function PointerFx() {
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const glow = document.getElementById('cursor-glow')
    let raf = 0
    let last: PointerEvent | null = null

    function frame() {
      raf = 0
      const e = last
      if (!e) return
      const el = (e.target as Element | null)?.closest?.('.spotlight') as HTMLElement | null
      if (el) {
        const r = el.getBoundingClientRect()
        el.style.setProperty('--mx', `${e.clientX - r.left}px`)
        el.style.setProperty('--my', `${e.clientY - r.top}px`)
      }
      if (glow) glow.style.transform = `translate3d(${e.clientX - 300}px, ${e.clientY - 300}px, 0)`
    }
    function onMove(e: PointerEvent) {
      last = e
      if (!raf) raf = requestAnimationFrame(frame)
    }
    if (!fine || reduce) { if (glow) glow.style.display = 'none' }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf) }
  }, [])

  return (
    <div
      id="cursor-glow"
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[1] h-[600px] w-[600px] rounded-full opacity-[0.22] blur-3xl transition-transform duration-300 ease-out will-change-transform"
      style={{ background: 'radial-gradient(circle, rgba(129,140,248,0.55), rgba(125,211,252,0.15) 40%, transparent 70%)', transform: 'translate3d(-999px,-999px,0)' }}
    />
  )
}
