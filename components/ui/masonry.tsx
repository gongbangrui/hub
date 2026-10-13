'use client'
import {
  Children, isValidElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type ReactElement,
} from 'react'
import { cn } from '@/lib/utils'

/**
 * 瀑布流:按「最短列优先」放置,所以阅读顺序是从左到右、从上到下(CSS 多列是先填满第一列)。
 * · 首屏 / 无 JS:退回 CSS 多列(.masonry),内容照常可见
 * · 水合后:绝对定位 + translate。筛选 / 排序 / 增删时,每张卡会从旧位置滑到新位置(FLIP 效果由 CSS transition 完成)
 * · 被移除的卡片淡出后才真正卸载;图片加载导致高度变化时自动重排
 * 子元素需要稳定的 key。
 */
export function Masonry({
  children, gap = 16, minCol = 300, maxCols = 4, className,
}: {
  children: React.ReactNode; gap?: number; minCol?: number; maxCols?: number; className?: string
}) {
  const kids = Children.toArray(children).filter(isValidElement) as ReactElement[]
  const box = useRef<HTMLDivElement>(null)
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const [mounted, setMounted] = useState(false)
  const [width, setWidth] = useState(0)
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [ghosts, setGhosts] = useState<{ key: string; el: ReactElement; x: number; y: number; w: number }[]>([])
  const prev = useRef<{ keys: string[]; els: Map<string, ReactElement> }>({ keys: [], els: new Map() })
  const last = useRef(new Map<string, { x: number; y: number; w: number }>())

  // 没有 key 的子元素会全部变成 "null"，在同一个格子位上互相覆盖，
  // 这里退回到索引，至少让每个子元素各占一格
  const keyOf = (el: ReactElement, i: number) => (el.key == null ? `#${i}` : String(el.key))
  const keys = kids.map(keyOf)

  const cols = Math.max(1, Math.min(maxCols, Math.floor((width + gap) / (minCol + gap))))
  const colW = width ? (width - gap * (cols - 1)) / cols : 0

  const layout = useMemo(() => {
    const colH = new Array(cols).fill(0) as number[]
    const pos = new Map<string, { x: number; y: number; w: number }>()
    for (const k of keys) {
      const h = heights[k]
      if (h === undefined) continue
      let c = 0
      for (let i = 1; i < cols; i++) if (colH[i] < colH[c] - 0.5) c = i
      pos.set(k, { x: c * (colW + gap), y: colH[c], w: colW })
      colH[c] += h + gap
    }
    return { pos, height: Math.max(0, Math.max(...colH) - gap) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join('|'), heights, cols, colW, gap])

  useLayoutEffect(() => {
    setWidth(box.current?.clientWidth ?? 0)
    setMounted(true)
  }, [])

  // 容器宽度
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [mounted])

  // 每张卡的高度
  const measure = useCallback(() => {
    setHeights((old) => {
      let changed = false
      const next: Record<string, number> = {}
      nodes.current.forEach((n, k) => {
        const h = n.offsetHeight
        next[k] = h
        if (old[k] !== h) changed = true
      })
      return changed || Object.keys(old).length !== Object.keys(next).length ? next : old
    })
  }, [])

  useEffect(() => {
    if (!mounted) return
    const ro = new ResizeObserver(() => measure())
    nodes.current.forEach((n) => ro.observe(n))
    return () => ro.disconnect()
  }, [mounted, keys.join('|'), measure])

  useLayoutEffect(() => { if (mounted) measure() }, [mounted, keys.join('|'), width, measure])

  // 记录最近一次位置,供删除时做离场动画
  useEffect(() => {
    layout.pos.forEach((p, k) => last.current.set(k, p))
  }, [layout])

  // 找出刚被移除的卡片,让它们淡出 220ms
  useLayoutEffect(() => {
    if (!mounted) return
    const before = prev.current
    const gone = before.keys.filter((k) => !keys.includes(k) && last.current.has(k) && before.els.has(k))
    prev.current = { keys, els: new Map(kids.map((el, i) => [keyOf(el, i), el])) }
    if (!gone.length) return
    const add = gone.map((k) => ({ key: k, el: before.els.get(k)!, ...last.current.get(k)! }))
    setGhosts((g) => [...g, ...add])
    const t = setTimeout(() => setGhosts((g) => g.filter((x) => !gone.includes(x.key))), 240)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join('|'), mounted])

  if (!mounted) {
    return <div ref={box} className={cn('masonry mas-pending', maxCols >= 4 && 'masonry-4', className)}>{kids}</div>
  }

  return (
    <div ref={box} className={cn('relative mas-ready', className)} style={{ height: layout.height, transition: 'height 400ms var(--ease-out-expo)' }}>
      {kids.map((el, i) => {
        const k = keyOf(el, i)
        const p = layout.pos.get(k)
        return (
          <div
            key={k}
            ref={(n) => { if (n) nodes.current.set(k, n); else nodes.current.delete(k) }}
            className="mas-item"
            style={{
              position: 'absolute', left: 0, top: 0, width: p?.w ?? colW,
              transform: `translate3d(${p?.x ?? 0}px, ${p?.y ?? 0}px, 0)`,
              opacity: p ? 1 : 0,
              // 新卡首次出现不从 (0,0) 飞过来:没有位置时不加过渡
              transition: p ? 'transform 520ms var(--ease-out-expo), width 300ms var(--ease-out-expo), opacity 380ms' : 'none',
            }}
          >
            {el}
          </div>
        )
      })}
      {ghosts.map((g) => (
        <div
          key={`ghost-${g.key}`}
          aria-hidden
          className="pointer-events-none"
          style={{ position: 'absolute', left: 0, top: 0, width: g.w, transform: `translate3d(${g.x}px, ${g.y}px, 0)` }}
        >
          <div className="mas-leave">{g.el}</div>
        </div>
      ))}
    </div>
  )
}
