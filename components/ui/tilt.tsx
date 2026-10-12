'use client'
import { useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion, useMotionTemplate } from 'framer-motion'
import { cn } from '@/lib/utils'

/** 3D 倾斜 + 光斑（仅鼠标，触屏 / 减少动效时禁用） */
export function Tilt({
  children, className, intensity = 8, glare = true, onClick, lift = 0, active,
}: {
  children: React.ReactNode
  className?: string
  intensity?: number
  glare?: boolean
  onClick?: () => void
  /** hover 时上浮像素 */
  lift?: number
  /** 写入 data-active（配合 .grad-border） */
  active?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const [hover, setHover] = useState(false)
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)

  const sx = useSpring(mx, { stiffness: 220, damping: 22, mass: 0.6 })
  const sy = useSpring(my, { stiffness: 220, damping: 22, mass: 0.6 })
  const rotateY = useTransform(sx, [0, 1], [-intensity, intensity])
  const rotateX = useTransform(sy, [0, 1], [intensity, -intensity])
  const gx = useTransform(sx, [0, 1], ['0%', '100%'])
  const gy = useTransform(sy, [0, 1], ['0%', '100%'])
  const glareBg = useMotionTemplate`radial-gradient(340px circle at ${gx} ${gy}, rgba(186,200,255,0.14), rgba(192,132,252,0.05) 35%, transparent 65%)`

  const enabled = !reduce

  function onMove(e: React.PointerEvent) {
    if (!enabled || e.pointerType !== 'mouse') return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width)
    my.set((e.clientY - r.top) / r.height)
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(true) }}
      onPointerLeave={() => { setHover(false); mx.set(0.5); my.set(0.5) }}
      onClick={onClick}
      data-active={active === undefined ? undefined : active}
      animate={{ y: hover && enabled && lift ? -lift : 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      style={enabled ? { rotateX, rotateY, transformPerspective: 900, transformStyle: 'preserve-3d' } : undefined}
      className={cn('relative', className)}
    >
      {children}
      {glare && enabled && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[2] rounded-[inherit] transition-opacity duration-300"
          style={{ opacity: hover ? 1 : 0, background: glareBg }}
        />
      )}
    </motion.div>
  )
}
