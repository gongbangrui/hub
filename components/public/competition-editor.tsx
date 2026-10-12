'use client'
import { useEffect, useState } from 'react'
import { Loader2, Save, Trash2, Paperclip, ChevronDown, Pencil, Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import { Sheet } from '@/components/ui/primitives'
import { Field } from '@/components/public/links-editor'
import { AttachmentDrop } from '@/components/public/attachment-drop'
import type { Category } from '@/db/schema'
import { LEVELS } from '@/components/ui/primitives'
import type { CompItem } from '@/components/public/competitions-view'

type Props = { open: boolean; item: CompItem | null; categories: Category[]; onClose: () => void }

const EMPTY = {
  name: '', level: '', categoryId: '', dateStart: '', dateEnd: '',
  result: '', team: '', description: '',
}

export function CompetitionEditor({ open, item, categories, onClose }: Props) {
  const [form, setForm] = useState(EMPTY)
  const [atts, setAtts] = useState<{ fileId: number; caption: string; name: string; mime: string; size: number }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setErr('')
    setForm(item ? {
      name: item.name,
      level: item.level ?? '',
      categoryId: item.categoryId ? String(item.categoryId) : '',
      dateStart: item.dateStart ?? '',
      dateEnd: item.dateEnd ?? '',
      result: item.result ?? '',
      team: item.team ?? '',
      description: item.description ?? '',
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
    if (!form.name.trim()) return setErr('名称 ✕')
    setBusy(true); setErr('')
    try {
      const res = await fetch(item ? `/api/competitions/${item.id}` : '/api/competitions', {
        method: item ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          categoryId: form.categoryId ? Number(form.categoryId) : null,
          attachments: atts,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        return setErr(j.error ?? '保存失败')
      }
      onClose()
      location.reload()
    } catch {
      setErr('保存失败')
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
        <div className="flex items-center gap-3">
          <span className="liquid flex h-10 w-10 items-center justify-center rounded-2xl text-indigo-100">
            {item ? <Pencil size={16} /> : <Plus size={17} />}
          </span>
          <h2 className="text-lg font-semibold tracking-tight">
            <span className="text-grad">{item ? '编辑' : '新增'}</span>
          </h2>
        </div>
      }
    >
      <div className="space-y-6">
        <Field label="名称" required>
          <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                 onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="名称" className="field" />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="等级">
            <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="field">
              <option value="">—</option>
              {Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="分类">
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="field">
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>

        {/* 材料上传 */}
        <section>
          <h4 className="mb-3 flex items-center gap-2 text-indigo-200/50" title="材料">
            <Paperclip size={13} />
            {atts.length > 0 && <span className="num text-[11px]">{atts.length}</span>}
            <span className="hairline flex-1" />
          </h4>
          <AttachmentDrop
            ownerType="competition"
            items={atts}
            onChange={setAtts}
          />
        </section>

        <details open={!item} className="group/more">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-indigo-200/50 hover:text-white/80 [&::-webkit-details-marker]:hidden"
                   aria-label="更多" title="更多">
            <ChevronDown size={14} className="transition-transform duration-300 group-open/more:rotate-180" />
            <span className="hairline flex-1" />
          </summary>
          <div className="mt-4 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="开始">
                <input type="date" value={form.dateStart} onChange={(e) => setForm({ ...form, dateStart: e.target.value })} className="field" />
              </Field>
              <Field label="结束">
                <input type="date" value={form.dateEnd} onChange={(e) => setForm({ ...form, dateEnd: e.target.value })} className="field" />
              </Field>
            </div>
            <Field label="结果">
              <input value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} placeholder="一等奖" className="field" />
            </Field>
            <Field label="团队">
              <input value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} placeholder="A、B" className="field" />
            </Field>
            <Field label="描述">
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                        rows={4} className="field resize-none" />
            </Field>
          </div>
        </details>

        {err && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-[12.5px] text-rose-300" role="alert">
            {err}
          </motion.p>
        )}

        <div className="flex items-center gap-2 border-t border-white/[0.07] pt-5">
          <button onClick={save} disabled={busy} className="btn btn-primary shine h-10 px-5">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存
          </button>
          <button onClick={onClose} className="btn btn-ghost h-10">取消</button>
          {item && (
            <button
              onClick={async () => {
                if (!confirm(`删除「${item.name}」？`)) return
                await fetch(`/api/competitions/${item.id}`, { method: 'DELETE' })
                onClose(); location.reload()
              }}
              className="btn btn-danger btn-ghost btn-icon ml-auto h-10 w-10"
              aria-label="删除"
              title="删除"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
