'use client'
import { useEffect, useRef } from 'react'

/**
 * 漂浮光球 + 鼠标排斥 + 点击爆裂。整站只有一块 canvas：
 * · 光球先画进离屏精灵（按色彩 × 3 档尺寸），帧循环里只做 drawImage，不在每帧建渐变
 * · 页面不可见 / 画布滚出视口时暂停；prefers-reduced-motion 只画静态一帧
 * · 连续掉帧会自动减半光球，再掉就停掉动画，保证滚动和输入不被拖慢
 */

type Orb = {
  x: number; y: number; vy: number // 基础位置与上浮速度
  r: number; sprite: number; a: number
  phase: number; sway: number // 左右摇摆
  ox: number; oy: number; dvx: number; dvy: number // 被鼠标推开的偏移与速度（弹簧回弹）
  bx: number // 本帧的摇摆后横坐标
}
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; hue: number; r: number }
type Ring = { x: number; y: number; life: number; max: number }

const PALETTE: [number, number, number][] = [
  [56, 189, 248], // sky
  [99, 102, 241], // indigo
  [167, 139, 250], // violet
  [45, 212, 191], // teal
  [244, 114, 182], // pink（少量）
]
const SIZES = [24, 48, 96]

function makeSprites() {
  const out: HTMLCanvasElement[][] = []
  for (const [r, g, b] of PALETTE) {
    const row: HTMLCanvasElement[] = []
    for (const s of SIZES) {
      const c = document.createElement('canvas')
      c.width = c.height = s * 2
      const x = c.getContext('2d')!
      const grad = x.createRadialGradient(s, s, 0, s, s, s)
      grad.addColorStop(0, `rgba(${r},${g},${b},0.55)`)
      grad.addColorStop(0.45, `rgba(${r},${g},${b},0.18)`)
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
      x.fillStyle = grad
      x.fillRect(0, 0, s * 2, s * 2)
      // 高光点：让光球更像玻璃珠
      const hl = x.createRadialGradient(s * 0.72, s * 0.7, 0, s * 0.72, s * 0.7, s * 0.4)
      hl.addColorStop(0, 'rgba(255,255,255,0.65)')
      hl.addColorStop(1, 'rgba(255,255,255,0)')
      x.fillStyle = hl
      x.fillRect(0, 0, s * 2, s * 2)
      row.push(c)
    }
    out.push(row)
  }
  return out
}

export default function Particles() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const fine = window.matchMedia('(pointer: fine)').matches
    const nav = navigator as Navigator & { deviceMemory?: number }
    const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4

    let w = 0, h = 0
    let dpr = 1
    let orbs: Orb[] = []
    const sparks: Spark[] = []
    const rings: Ring[] = []
    let sprites = makeSprites()
    const mouse = { x: -9999, y: -9999, active: false }
    let raf = 0
    let running = false
    let last = 0
    let slow = 0
    let level = 0 // 0 = 全量，1 = 减半，2 = 停止
    let visible = true

    function targetCount() {
      const base = Math.round((w * h) / 52000)
      const n = Math.max(14, Math.min(weak ? 22 : 38, base))
      return level === 0 ? n : Math.ceil(n / 2)
    }

    function spawn(initial: boolean): Orb {
      const sprite = Math.random() < 0.08 ? 4 : Math.floor(Math.random() * 4)
      const size = Math.random() < 0.55 ? 0 : Math.random() < 0.7 ? 1 : 2
      const r = [10, 22, 46][size] * (0.7 + Math.random() * 0.6)
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : h + r * 2,
        vy: -(0.12 + Math.random() * 0.32) * (size === 2 ? 0.6 : 1),
        r, sprite: sprite * 3 + size, a: 0.45 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2, sway: 8 + Math.random() * 22,
        ox: 0, oy: 0, dvx: 0, dvy: 0, bx: 0,
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, weak ? 1 : 1.5)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = targetCount()
      while (orbs.length < n) orbs.push(spawn(true))
      if (orbs.length > n) orbs.length = n
      if (!running) draw(0)
    }

    function burst(x: number, y: number) {
      rings.push({ x, y, life: 0, max: 700 })
      const n = weak ? 8 : 14
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.4
        const sp = 1.2 + Math.random() * 2.4
        sparks.push({
          x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          life: 0, max: 600 + Math.random() * 400, hue: Math.floor(Math.random() * 3), r: 1.5 + Math.random() * 2.5,
        })
      }
      if (sparks.length > 80) sparks.splice(0, sparks.length - 80)
      kick()
    }

    function step(dt: number) {
      const k = dt / 16.67
      for (const o of orbs) {
        o.phase += 0.004 * k
        o.y += o.vy * k
        o.bx = o.x + Math.sin(o.phase) * o.sway

        // 鼠标排斥：距离越近推得越狠
        if (mouse.active) {
          const dx = o.bx + o.ox - mouse.x
          const dy = o.y + o.oy - mouse.y
          const d2 = dx * dx + dy * dy
          const R = 150 + o.r
          if (d2 < R * R && d2 > 0.01) {
            const d = Math.sqrt(d2)
            const f = ((R - d) / R) ** 2 * 2.4
            o.dvx += (dx / d) * f * k
            o.dvy += (dy / d) * f * k
          }
        }
        // 弹簧把偏移拉回 0，阻尼让它不来回震荡
        o.dvx += -o.ox * 0.012 * k
        o.dvy += -o.oy * 0.012 * k
        const damp = Math.pow(0.9, k)
        o.dvx *= damp
        o.dvy *= damp
        o.ox += o.dvx * k
        o.oy += o.dvy * k

        if (o.y < -o.r * 3) Object.assign(o, spawn(false))
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.life += dt
        s.x += s.vx * k; s.y += s.vy * k
        s.vx *= 0.955; s.vy *= 0.955
        if (s.life >= s.max) sparks.splice(i, 1)
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].life += dt
        if (rings[i].life >= rings[i].max) rings.splice(i, 1)
      }
    }

    function draw(dt: number) {
      ctx!.clearRect(0, 0, w, h)
      for (const o of orbs) {
        const row = Math.floor(o.sprite / 3)
        const sz = o.sprite % 3
        const sp = sprites[row]?.[sz]
        if (!sp) continue
        const d = o.r * 2
        const edge = Math.max(0, Math.min(1, (h - o.y) / 90, o.y / 90 + 0.5)) // 上下渐隐
        ctx!.globalAlpha = o.a * edge
        ctx!.drawImage(sp, (o.bx || o.x) + o.ox - o.r, o.y + o.oy - o.r, d, d)
      }
      for (const s of sparks) {
        const t = 1 - s.life / s.max
        const [r, g, b] = PALETTE[s.hue]
        ctx!.globalAlpha = t
        ctx!.fillStyle = `rgb(${r},${g},${b})`
        ctx!.beginPath()
        ctx!.arc(s.x, s.y, s.r * (0.6 + t * 0.4), 0, Math.PI * 2)
        ctx!.fill()
      }
      for (const rg of rings) {
        const t = rg.life / rg.max
        ctx!.globalAlpha = (1 - t) * 0.5
        ctx!.strokeStyle = 'rgb(99,102,241)'
        ctx!.lineWidth = 2 * (1 - t) + 0.5
        ctx!.beginPath()
        ctx!.arc(rg.x, rg.y, 6 + t * 70, 0, Math.PI * 2)
        ctx!.stroke()
      }
      ctx!.globalAlpha = 1
      void dt
    }

    function frame(t: number) {
      raf = 0
      if (!running) return
      const dt = Math.min(48, last ? t - last : 16.67)
      last = t
      // 掉帧自保：连续 90 帧平均 >26ms 就降级
      if (dt > 26) slow++; else slow = Math.max(0, slow - 1)
      if (slow > 90) {
        slow = 0
        level++
        if (level >= 2) { stop(); orbs.length = 0; sparks.length = 0; rings.length = 0; ctx!.clearRect(0, 0, w, h); return }
        orbs.length = Math.ceil(orbs.length / 2)
      }
      step(dt)
      draw(dt)
      raf = requestAnimationFrame(frame)
    }

    function start() {
      if (running || reduce || level >= 2 || !visible || document.hidden) return
      running = true
      last = 0
      raf = requestAnimationFrame(frame)
    }
    function stop() {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    function kick() { if (!running) start() }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true
    }
    const onLeave = () => { mouse.active = false }
    const onDown = (e: PointerEvent) => {
      if (reduce || level >= 2) return
      // 点在可交互元素上不放特效，避免干扰
      const t = e.target as Element | null
      if (t?.closest?.('input,textarea,select,[contenteditable],[role="dialog"]')) return
      burst(e.clientX, e.clientY)
    }
    const onVis = () => { document.hidden ? stop() : start() }

    resize()
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? start() : stop() })
    io.observe(canvas)
    window.addEventListener('resize', resize, { passive: true })
    document.addEventListener('visibilitychange', onVis)
    if (fine) {
      window.addEventListener('pointermove', onMove, { passive: true })
      document.documentElement.addEventListener('pointerleave', onLeave)
    }
    window.addEventListener('pointerdown', onDown, { passive: true })
    start()

    return () => {
      stop(); io.disconnect()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointerdown', onDown)
      sprites = []
    }
  }, [])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[1]" />
}
