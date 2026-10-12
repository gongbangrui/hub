'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion'
import { Loader2, ArrowRight, KeyRound, X, Hourglass } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EASE } from '@/components/ui/fx'

/** 只允许站内相对路径，防止开放重定向 */
function safeNext(v: string | null) {
  // 反斜杠、控制字符（URL 解析会吞掉 \t\n，变成 //host）一律拒绝
  return v && v.startsWith('/') && !v.startsWith('//') && !/[\\\u0000-\u001f]/.test(v) ? v : '/admin'
}

export function LoginForm({ title }: { title?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<null | { wait?: string }>(null)
  const shake = useAnimationControls()

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!pw || busy) return
    setBusy(true); setErr(null)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    }).catch(() => null)
    setBusy(false)
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {}
      const wait = res?.status === 429 ? String(j.error ?? '').match(/\d+/)?.[0] : undefined
      setErr({ wait })
      shake.start({ x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.45 } })
      setPw('')
      return
    }
    router.replace(safeNext(params.get('next')))
    router.refresh()
  }

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 18, scale: 0.97, filter: 'blur(10px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.7, ease: EASE }}
      className="liquid relative w-full max-w-[360px] rounded-[28px] p-8 sm:p-10"
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/70 to-transparent" />

      <div className="flex flex-col items-center">
        <motion.span
          initial={{ rotate: -20, scale: 0.6, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 }}
          className="float relative flex h-16 w-16 items-center justify-center"
        >
          <span className="absolute inset-0 rounded-[30%] bg-gradient-to-br from-sky-300 via-indigo-400 to-purple-400 shadow-[0_14px_44px_-8px_rgba(129,140,248,0.85)]" />
          <span className="absolute inset-[1px] rounded-[30%] bg-gradient-to-b from-white/40 to-transparent opacity-70" />
          <KeyRound size={24} className="relative text-[#0a0b1e]" strokeWidth={2.2} />
        </motion.span>
        {title && <h1 className="title-xl mt-6 text-2xl">{title}</h1>}
      </div>

      <motion.div animate={shake} className="mt-8 flex gap-2">
        <input
          autoFocus
          type="password"
          autoComplete="current-password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); if (err) setErr(null) }}
          placeholder="••••"
          aria-label="口令"
          aria-invalid={!!err}
          className={cn('field h-12 text-center text-[15px] tracking-[0.3em]', err && 'border-rose-400/60')}
        />
        <button
          type="submit"
          disabled={busy || !pw}
          className="btn btn-primary shine h-12 w-12 shrink-0 rounded-xl p-0"
          aria-label="进入"
          title="进入"
        >
          {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
        </button>
      </motion.div>

      <div className="mt-3 flex h-5 items-center justify-center" aria-live="polite">
        <AnimatePresence>
          {err && (
            <motion.span
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-[12.5px] text-rose-300"
            >
              {err.wait ? <><Hourglass size={13} /><span className="num">{err.wait}s</span></> : <X size={14} aria-label="口令不对" />}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.form>
  )
}
