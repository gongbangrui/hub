'use client'
import { useEffect, useState } from 'react'
import { Loader2, Check, Trash2, Plus, Pencil, Paperclip, ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'
import { Sheet, STATUSES } from '@/components/ui/primitives'
import { Field } from '@/components/public/links-editor'
import { AttachmentDrop, type AttItem } from '@/components/public/attachment-drop'
import type { PaperItem } from '@/components/public/papers-view'

type Props = { open: boolean; item: PaperItem | null; onClose: () => void }

const EMPTY = {
  title: '', authors: '', venue: '', type: '', status: 'draft',
  level: '', doi: '', url: '', pubDate: '', abstract: '',
}

export function PaperEditor({ open, item, onClose }: Props) {
  const [form, setForm] = useState(EMPTY)
  const [atts, setAtts] = useState<AttItem[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setErr('')
    setForm(item ? {
      title: item.title,
      authors: (item.authors ?? []).join('、'),
      venue: item.venue ?? '',
      type: item.type ?? '',
      status: item.status ?? 'draft',
      level: item.level ?? '',
      doi: item.doi ?? '',
      url: item.url ?? '',
      pubDate: item.pubDate ?? '',
      abstract: item.abstract ?? '',
    } : EMPTY)
    setAtts(item ? item.attachments.map((a) => ({
      fileId: a.fileId,
      caption: a.caption ?? '',
      name: a.file?.originalName ?? '',
      mime: a.file?.mime ?? '',
      size: a.file?.size ?? 0,
    })) : [])
  }, [open, item])

  async function save() {
    if (busy) return
    if (!form.title.trim()) return setErr('✕ 标题')
    setBusy(true); setErr('')
    try {
      const res = await fetch(item ? `/api/papers/${item.id}` : '/api/papers', {
        method: item ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          authors: form.authors.split(/[、,，;；]+/).map((s) => s.trim()).filter(Boolean),
          attachments: atts,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        return setErr(j.error ?? '✕')
      }
      onClose()
      location.reload()
    } catch {
      setErr('✕')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title={
        <h2 className="flex items-center gap-2.5 text-lg font-medium">
          <span className="liquid flex h-9 w-9 items-center justify-center rounded-xl text-indigo-200">
            {item ? <Pencil size={15} /> : <Plus size={16} />}
          </span>
          论文
        </h2>
      }
    >
      <div className="space-y-6">
        <Field label="标题" required>
          <textarea
            autoFocus
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            rows={2}
            className="field resize-none"
          />
        </Field>

        <Field label="作者">
          <input value={form.authors} onChange={(e) => setForm({ ...form, authors: e.target.value })}
                 placeholder="A、B、C" className="field" />
        </Field>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="状态">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="field">
              {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="类型">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="field">
              <option value="">—</option>
              <option value="journal">期刊</option>
              <option value="conference">会议</option>
              <option value="preprint">预印本</option>
            </select>
          </Field>
          <Field label="日期">
            <input type="date" value={form.pubDate} onChange={(e) => setForm({ ...form, pubDate: e.target.value })} className="field" />
          </Field>
        </div>

        <Field label="发表处">
          <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })}
                 placeholder="期刊 / 会议" className="field" />
        </Field>

        <section>
          <h4 className="label mb-3 flex items-center gap-1.5"><Paperclip size={12} /> 附件</h4>
          <AttachmentDrop ownerType="paper" items={atts} onChange={setAtts} />
        </section>

        <details open={!item} className="group">
          <summary className="label flex min-h-[40px] cursor-pointer list-none items-center gap-1.5 hover:text-white/70" aria-label="更多">
            <ChevronDown size={13} className="transition-transform duration-300 group-open:rotate-180" /> ⋯
          </summary>
          <div className="mt-4 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="DOI">
                <input value={form.doi} onChange={(e) => setForm({ ...form, doi: e.target.value })} placeholder="10.xxxx/…" className="field font-mono text-[12.5px]" />
              </Field>
              <Field label="级别">
                <input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="CCF-A" className="field" />
              </Field>
            </div>
            <Field label="链接">
              <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" className="field" />
            </Field>
            <Field label="摘要">
              <textarea value={form.abstract} onChange={(e) => setForm({ ...form, abstract: e.target.value })}
                        rows={5} className="field resize-none" />
            </Field>
          </div>
        </details>

        {err && (
          <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="text-[12.5px] text-rose-300">{err}</motion.p>
        )}

        <div className="flex items-center gap-2 border-t border-white/[0.07] pt-5">
          <button onClick={save} disabled={busy} className="btn btn-primary shine min-h-[40px] px-5">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 保存
          </button>
          <button onClick={onClose} className="btn btn-ghost min-h-[40px]">取消</button>
          {item && (
            <button
              onClick={async () => {
                if (!confirm('删除？')) return
                await fetch(`/api/papers/${item.id}`, { method: 'DELETE' })
                onClose(); location.reload()
              }}
              className="btn btn-danger btn-ghost ml-auto h-10 w-10 justify-center p-0"
              aria-label="删除" title="删除"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
