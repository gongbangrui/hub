'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Check, Trash2, Pin, PencilLine, Plus, Hash, Globe, Type, FolderTree, AlignLeft } from 'lucide-react'
import { Sheet } from '@/components/ui/primitives'
import type { Link as LinkRow, Category } from '@/db/schema'
import { normalizeUrl } from '@/lib/links'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  link: LinkRow | null
  categories: Category[]
  onClose: () => void
}

const EMPTY = { title: '', url: '', description: '', categoryId: '', tags: '', pinned: false }
type Err = '' | 'title' | 'url' | 'save'

export function LinksEditor({ open, link, categories, onClose }: Props) {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<Err>('')

  useEffect(() => {
    if (!open) return
    setErr('')
    setForm(
      link
        ? {
            title: link.title,
            url: link.url,
            description: link.description ?? '',
            categoryId: link.categoryId ? String(link.categoryId) : '',
            tags: (link.tags ?? []).join(', '),
            pinned: link.pinned,
          }
        : EMPTY,
    )
  }, [open, link])

  async function save() {
    if (busy) return
    const url = normalizeUrl(form.url)
    if (!form.title.trim()) return setErr('title')
    if (!url) return setErr('url')

    setBusy(true); setErr('')
    try {
      const payload = {
        title: form.title.trim(),
        url,
        description: form.description.trim() || null,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        tags: form.tags.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
        pinned: form.pinned,
      }
      const res = await fetch(link ? `/api/links/${link.id}` : '/api/links', {
        method: link ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return setErr('save')
      onClose()
      location.reload()
    } catch {
      setErr('save')
    } finally {
      // 网络异常时也必须解锁，否则按钮永远转圈
      setBusy(false)
    }
  }

  const bad = (k: Err) => err === k && 'border-rose-400/60 ring-2 ring-rose-400/20'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <span className="liquid flex h-10 w-10 items-center justify-center rounded-2xl text-indigo-100">
            {link ? <PencilLine size={17} /> : <Plus size={18} />}
          </span>
          <h2 className="text-grad text-lg font-semibold">{link ? '编辑' : '新增'}</h2>
        </div>
      }
    >
      <motion.div
        className="space-y-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      >
        <Field label="标题" icon={<Type size={12} />} required>
          <input
            autoFocus
            value={form.title}
            onChange={(e) => { setForm({ ...form, title: e.target.value }); if (err === 'title') setErr('') }}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="标题"
            aria-invalid={err === 'title'}
            className={cn('field', bad('title'))}
          />
        </Field>

        <Field label="网址" icon={<Globe size={12} />} required>
          <input
            value={form.url}
            onChange={(e) => { setForm({ ...form, url: e.target.value }); if (err === 'url') setErr('') }}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="https://"
            inputMode="url"
            aria-invalid={err === 'url'}
            className={cn('field font-mono text-[13px]', bad('url'))}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="分类" icon={<FolderTree size={12} />}>
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="field">
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <Field label="标签" icon={<Hash size={12} />}>
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="a, b" className="field" />
          </Field>
        </div>

        <Field label="简介" icon={<AlignLeft size={12} />}>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="field resize-none"
          />
        </Field>

        <button
          type="button"
          onClick={() => setForm({ ...form, pinned: !form.pinned })}
          data-active={form.pinned}
          aria-pressed={form.pinned}
          className="chip min-h-10 px-4"
        >
          <motion.span animate={{ rotate: form.pinned ? -30 : 0, scale: form.pinned ? 1.15 : 1 }} transition={{ type: 'spring', stiffness: 400, damping: 16 }}>
            <Pin size={13} className={form.pinned ? 'text-violet-200' : ''} />
          </motion.span>
          置顶
        </button>

        {err === 'save' && <p className="text-[12.5px] text-rose-300">✕ 失败</p>}

        <div className="flex items-center gap-2 border-t border-white/[0.06] pt-5">
          <button onClick={save} disabled={busy} className="btn btn-primary shine min-h-10 px-5">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}
            保存
          </button>
          <button onClick={onClose} className="btn btn-ghost min-h-10">取消</button>
          {link && (
            <button
              onClick={async () => {
                if (!confirm('删除？')) return
                await fetch(`/api/links/${link.id}`, { method: 'DELETE' })
                onClose(); location.reload()
              }}
              className="btn btn-danger btn-ghost btn-icon ml-auto h-10 w-10"
              aria-label="删除"
              title="删除"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </motion.div>
    </Sheet>
  )
}

/** 表单字段：短标签 + 可选图标；hint 仅作悬停提示 */
export function Field({ label, required, hint, icon, className, children }: {
  label?: React.ReactNode; required?: boolean; hint?: string; icon?: React.ReactNode; className?: string; children: React.ReactNode
}) {
  return (
    <label className={cn('block', className)} title={hint}>
      {(label || icon) && (
        <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium tracking-wide text-indigo-100/50">
          {icon && <span className="text-indigo-200/45">{icon}</span>}
          {label}
          {required && <span className="h-1 w-1 rounded-full" style={{ background: 'var(--grad)' }} aria-label="必填" />}
        </span>
      )}
      {children}
    </label>
  )
}
