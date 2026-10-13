'use client'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const Particles = dynamic(() => import('./particles'), { ssr: false })

/** 空闲后再加载粒子：不占首屏关键路径 */
export function ParticlesLazy() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 1200 })
      return () => (window as any).cancelIdleCallback?.(id)
    }
    const t = setTimeout(() => setReady(true), 400)
    return () => clearTimeout(t)
  }, [])
  return ready ? <Particles /> : null
}
