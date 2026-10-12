'use client'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Lock, LogIn } from 'lucide-react'
import { EASE } from '@/components/ui/fx'

export function LockedNotice({ what, count, next }: { what?: string; count?: number; next?: string }) {
  const pathname = usePathname()
  const target = next ?? pathname ?? '/'

  return (
    <div className="relative min-h-[420px]" aria-label={what}>
      {/* 模糊占位，不泄露数据 */}
      <div aria-hidden className="pointer-events-none select-none opacity-[0.18] blur-[7px]">
        <div className="masonry">
          {[150, 210, 130, 180, 240, 140].map((h, i) => (
            <div key={i} className="liquid rounded-3xl p-5" style={{ height: h }}>
              <div className="h-3 w-2/3 rounded bg-white/25" />
              <div className="mt-3 h-2.5 w-1/3 rounded bg-white/15" />
              <div className="mt-6 h-2 w-full rounded bg-white/12" />
            </div>
          ))}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.96, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.7, ease: EASE }}
        className="absolute inset-0 flex items-center justify-center p-4"
      >
        <div className="liquid-strong flex flex-col items-center gap-5 rounded-3xl px-10 py-8">
          <span className="pulse-ring flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-200/20 bg-gradient-to-br from-sky-300/20 via-indigo-400/15 to-purple-400/20">
            <Lock size={22} className="text-indigo-50" />
          </span>
          {count !== undefined && count > 0 && (
            <span className="num text-grad text-3xl font-semibold tracking-tight" title={String(count)}>{count}</span>
          )}
          <Link
            href={`/login?next=${encodeURIComponent(target)}`}
            className="btn btn-primary shine h-11 px-5"
            aria-label="登录"
          >
            <LogIn size={15} /> 登录
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
