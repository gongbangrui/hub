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
  const [ok, setOk] = useState(true)
  const ref = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el && el.complete && el.naturalWidth === 0) setOk(false)
  }, [])

  if (!ok) {
    return (
      <span
        aria-hidden
        className={cn('flex shrink-0 items-center justify-center bg-gradient-to-br font-semibold text-white', radius, className)}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.52) }}
      >
        {title.charAt(0).toUpperCase()}
      </span>
    )
  }

  return (
    <img
      ref={ref}
      src={`/api/icon?u=${encodeURIComponent(url)}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setOk(false)}
      className={cn('shrink-0 object-contain', radius, className)}
      style={{ width: size, height: size }}
    />
  )
}
