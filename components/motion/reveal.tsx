'use client'
import { motion, type Variants } from 'framer-motion'

const EASE = [0.22, 1, 0.36, 1] as const

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.03 } },
}

export const item: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(6px)' },
  // 动画结束清掉 filter：残留的 filter 会让内部玻璃卡片的 backdrop-filter 失效
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: EASE }, transitionEnd: { filter: 'none' } },
}

export function FadeList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={stagger} initial="hidden" animate="show">
      {children}
    </motion.div>
  )
}

export function FadeItem({ children, className, ...rest }: React.ComponentProps<typeof motion.div>) {
  return <motion.div variants={item} className={className} {...rest}>{children}</motion.div>
}
