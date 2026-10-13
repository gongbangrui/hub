'use client'
import { useEffect, useRef, useState } from 'react'
import { cn, toneOf } from '@/lib/utils'

/**
 * 站点图标：/api/icon 走外网抓取，失败时用首字母渐变色块兜底。
 * 注意 onError 有可能在水合完成前就触发，那时 React 还没挂上处理函数，
 * 所以挂载后再用 ref 检查一次 naturalWidth —— 否则会留下裂图。
 */
export function Favicon({ url, title, size = 20, radius = 'rounded-[6px]', className }: {
  url: string
  title: string
  size?: number
  radius?: string
  className?: string
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading')
  const ref = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !el.complete) return
    setState(el.naturalWidth === 0 ? 'fail' : 'ok')
  }, [])

  const tile = (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center bg-gradient-to-br font-semibold text-white shadow-sm', toneOf(title), radius, className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.52) }}
    >
      {title.charAt(0).toUpperCase()}
    </span>
  )
  if (state === 'fail') return tile

  // 加载中先显示首字母色块，图标到了再淡入覆盖，避免空白格
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {state === 'loading' && tile}
      <img
        ref={ref}
        src={`/api/icon?u=${encodeURIComponent(url)}`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onLoad={(e) => setState(e.currentTarget.naturalWidth === 0 ? 'fail' : 'ok')}
        onError={() => setState('fail')}
        className={cn('object-contain', radius, state === 'loading' ? 'absolute inset-0 opacity-0' : '', className)}
        style={{ width: size, height: size }}
      />
    </span>
  )
}
