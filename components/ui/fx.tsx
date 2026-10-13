'use client'
import { useRef } from 'react'
import { m as motion, useMotionValue, useSpring, animate, useInView } from 'framer-motion'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export { EASE } from '@/lib/motion'
import { EASE } from '@/lib/motion'

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
