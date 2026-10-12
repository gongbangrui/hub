'use client'
import { useRef } from 'react'
import { motion, useMotionValue, useSpring, animate, useInView } from 'framer-motion'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export const EASE = [0.22, 1, 0.36, 1] as const

/** 磁吸：子元素向光标轻微偏移，离开回弹 */
export function Magnetic({ children, strength = 0.25, className }: { children: React.ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useSpring(useMotionValue(0), { stiffness: 260, damping: 18 })
  const y = useSpring(useMotionValue(0), { stiffness: 260, damping: 18 })
  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      className={cn('inline-block', className)}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return
        const r = ref.current!.getBoundingClientRect()
        x.set((e.clientX - r.left - r.width / 2) * strength)
        y.set((e.clientY - r.top - r.height / 2) * strength)
      }}
      onPointerLeave={() => { x.set(0); y.set(0) }}
    >
      {children}
    </motion.div>
  )
}

/** 数字滚动计数（进入视口时） */
export function Counter({ value, className, format }: { value: number; className?: string; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!inView) return
    const c = animate(0, value, { duration: 1.1, ease: EASE, onUpdate: (v) => setN(v) })
    return () => c.stop()
  }, [inView, value])
  return <span ref={ref} className={cn('num', className)}>{format ? format(n) : Math.round(n)}</span>
}

/** 渐变文字 */
export function GradText({ children, className, animated }: { children: React.ReactNode; className?: string; animated?: boolean }) {
  return <span className={cn('text-grad', animated && 'text-grad-anim', className)}>{children}</span>
}

/** 瀑布流容器：CSS 多列，子项自动 break-inside: avoid */
export function Masonry({ children, className, wide }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn('masonry', wide && 'masonry-4', className)}>{children}</div>
}

/** 页面标题：图标 + 短标题 + 计数，不放说明文字 */
export function PageTitle({ icon, title, count, right, className }: {
  icon?: React.ReactNode; title: string; count?: number | string; right?: React.ReactNode; className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-center justify-between gap-4', className)}>
      <motion.div
        className="flex items-center gap-3"
        initial={{ opacity: 0, y: 12, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        {icon && (
          <span className="liquid flex h-11 w-11 items-center justify-center rounded-2xl text-indigo-100">
            {icon}
          </span>
        )}
        <h1 className="title-xl text-[clamp(1.75rem,4vw,2.6rem)]">{title}</h1>
        {count !== undefined && (
          <span className="num rounded-full border border-indigo-300/20 bg-indigo-400/10 px-2.5 py-0.5 text-[12px] text-indigo-100/70">{count}</span>
        )}
      </motion.div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  )
}

/** 带渐变描边的小统计块 */
export function Stat({ icon, value, label, className }: { icon?: React.ReactNode; value: React.ReactNode; label?: string; className?: string }) {
  return (
    <div className={cn('liquid spotlight flex items-center gap-3 rounded-2xl px-4 py-3', className)} title={label}>
      {icon && <span className="text-indigo-200/70">{icon}</span>}
      <span className="num text-lg font-semibold tracking-tight text-white/90">{value}</span>
      {label && <span className="text-[11px] text-indigo-100/40">{label}</span>}
    </div>
  )
}
