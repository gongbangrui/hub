'use client'
import { LazyMotion } from 'framer-motion'

// domMax 含 layout / layoutId 动画；异步加载，不进首屏 bundle
const features = () => import('./motion-features').then((m) => m.default)

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={features}>{children}</LazyMotion>
}
