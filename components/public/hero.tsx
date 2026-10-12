'use client'
import { motion } from 'framer-motion'
import { EASE } from '@/components/ui/fx'

/** 拆分：拉丁单词整体、中文逐字、空白保留 */
function tokens(s: string) {
  return s.match(/[A-Za-z0-9'’\-]+|\s+|./gu) ?? []
}

export function Hero({ line, title }: { line: string; subtitle?: string; authed?: boolean; title?: string }) {
  const text = (line || title || '').trim()
  const lines = text.split(/[，,\n]/).map((l) => l.trim()).filter(Boolean)
  let k = 0

  return (
    <section className="relative isolate pb-4 pt-10 md:pb-8 md:pt-20">
      {/* 背后光球 */}
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 hidden h-[420px] w-[420px] md:block">
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease: EASE }}
          className="float relative h-full w-full"
        >
          <div className="absolute inset-[18%] rounded-full bg-[conic-gradient(from_180deg,#7dd3fc,#818cf8,#c084fc,#818cf8,#7dd3fc)] opacity-40 blur-3xl" />
          <div className="liquid absolute inset-[30%] rounded-full" />
          <div className="absolute inset-[30%] animate-[spin_18s_linear_infinite] rounded-full border border-dashed border-indigo-200/20" />
        </motion.div>
      </div>

      <h1 className="max-w-5xl text-[clamp(2.4rem,8.5vw,6rem)] font-bold leading-[1.02] tracking-[-0.045em]">
        {lines.map((l, li) => {
          const parts = tokens(l)
          const n = parts.length
          return (
            <span key={li} className="block">
              {parts.map((p, i) => {
                const delay = 0.06 + k++ * 0.035
                if (/^\s+$/.test(p)) return <span key={i}>{p}</span>
                return (
                  <motion.span
                    key={i}
                    className="text-grad inline-block"
                    style={{
                      backgroundSize: `${Math.max(n, 1) * 100}% 100%`,
                      backgroundPosition: `${n > 1 ? (i / (n - 1)) * 100 : 0}% 0`,
                    }}
                    initial={{ opacity: 0, y: '0.5em', filter: 'blur(12px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.7, delay: Math.min(delay, 1.2), ease: EASE }}
                  >
                    {p}
                  </motion.span>
                )
              })}
            </span>
          )
        })}
      </h1>

      <motion.div
        aria-hidden
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 1, delay: 0.5, ease: EASE }}
        className="mt-8 h-px w-40 origin-left bg-gradient-to-r from-sky-300 via-indigo-400 to-transparent"
      />
    </section>
  )
}
