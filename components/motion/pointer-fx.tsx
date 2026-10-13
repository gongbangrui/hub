'use client'
import { useEffect } from 'react'

/**
 * 全局指针特效（事件委托，一个监听器服务全站）：
 * 给光标下最近的 .spotlight 写入 --mx/--my，驱动 CSS 聚光（液态玻璃的跟手高光）。
 */
export function PointerFx() {
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return
    let raf = 0
    let last: PointerEvent | null = null
    let prev: HTMLElement | null = null

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
      prev = el
    }
    function onMove(e: PointerEvent) {
      last = e
      if (!raf) raf = requestAnimationFrame(frame)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); void prev }
  }, [])
  return null
}
