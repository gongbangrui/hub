'use client'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect } from 'react'

/** 空状态：图标为主，文字可省 */
export function EmptyState({ icon, title, hint, action }: {
  icon?: React.ReactNode; title?: string; hint?: string; action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      {icon && (
        <div className="float relative flex h-16 w-16 items-center justify-center rounded-2xl liquid text-indigo-200/60">
          <span className="absolute inset-0 -z-10 rounded-2xl bg-[radial-gradient(circle,rgba(129,140,248,0.35),transparent_70%)] blur-xl" />
          {icon}
        </div>
      )}
      {title && <p className="text-[13px] text-indigo-100/45">{title}</p>}
      {hint && <p className="text-xs text-indigo-100/28">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Sheet({ open, onClose, children, title, wide }: {
  open: boolean; onClose: () => void; children: React.ReactNode; title?: React.ReactNode; wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }} onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%', filter: 'blur(10px)' }}
            animate={{ x: 0, filter: 'blur(0px)' }}
            exit={{ x: '100%', filter: 'blur(10px)' }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className={cn('liquid-strong relative flex h-full w-full flex-col rounded-l-3xl', wide ? 'max-w-3xl' : 'max-w-xl')}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/60 to-transparent" />
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-6 py-5">
              <div className="min-w-0">{title}</div>
              <button onClick={onClose} className="btn btn-ghost shrink-0 p-2" aria-label="关闭">
                <X size={16} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}

export function Modal({ open, onClose, children, title, className }: {
  open: boolean; onClose: () => void; children: React.ReactNode; title?: React.ReactNode; className?: string
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }} onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.97, y: 6, filter: 'blur(6px)' }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className={cn('liquid-strong relative w-full rounded-3xl', className ?? 'max-w-lg')}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/60 to-transparent" />
            {title && <h3 className="border-b border-white/[0.07] px-6 py-4 text-[15px] font-medium">{title}</h3>}
            <div className="px-6 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export function ConfirmButton({ onConfirm, children, className, confirmText = '确认' }: {
  onConfirm: () => void; children: React.ReactNode; className?: string; confirmText?: string
}) {
  return (
    <button
      className={cn('btn', className)}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onConfirm() }}
    >
      {children}
    </button>
  )
}

const BASE = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide num'

export const LEVELS = {
  school: { label: '校级', cls: 'border-white/15 bg-white/[0.06] text-white/65', dot: '#9ca3af' },
  province: { label: '省级', cls: 'border-sky-400/30 bg-sky-400/12 text-sky-200', dot: '#7dd3fc' },
  national: { label: '国家级', cls: 'border-amber-400/30 bg-amber-400/12 text-amber-200', dot: '#fbbf24' },
  international: { label: '国际级', cls: 'border-purple-400/35 bg-purple-400/14 text-purple-200', dot: '#c084fc' },
} as const

export function LevelBadge({ level, className }: { level?: string | null; className?: string }) {
  if (!level || !(level in LEVELS)) return null
  const l = LEVELS[level as keyof typeof LEVELS]
  return (
    <span className={cn(BASE, l.cls, className)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.dot, boxShadow: `0 0 8px ${l.dot}` }} />
      {l.label}
    </span>
  )
}

export const STATUSES = {
  draft: { label: '草稿', cls: 'border-white/15 bg-white/[0.06] text-white/60' },
  submitted: { label: '投稿中', cls: 'border-sky-400/30 bg-sky-400/12 text-sky-200' },
  accepted: { label: '已接收', cls: 'border-violet-400/35 bg-violet-400/14 text-violet-200' },
  published: { label: '已发表', cls: 'border-emerald-400/30 bg-emerald-400/12 text-emerald-200' },
} as const

export function StatusBadge({ status }: { status: string }) {
  const s = STATUSES[status as keyof typeof STATUSES] ?? STATUSES.draft
  return <span className={cn(BASE, s.cls)}>{s.label}</span>
}
