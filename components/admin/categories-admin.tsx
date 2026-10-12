'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bookmark, Trophy, FileText, Tags, GripVertical, Plus, Trash2, Pencil, Pipette, Check, SearchX, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState, ConfirmButton } from '@/components/ui/primitives'
import {
  AdminTitle, Toolbar, SearchInput, Checkbox, useSelection, BulkBar,
  AdminTable, Th, Td, Tr, api, useMutate,
} from '@/components/admin/ui'

const EASE = [0.22, 1, 0.36, 1] as const

/** 行内图标按钮：移动端 40px 触控，桌面收紧 */
const ICON_BTN = 'btn btn-ghost btn-sm h-10 w-10 p-0 md:h-8 md:w-8'

type Kind = 'link' | 'competition' | 'paper'

export type CatRow = {
  id: number; name: string; slug: string; kind: Kind; color: string | null; sort: number
  /** 使用次数；论文分类无从统计时为 null */
  count: number | null
}

const KINDS: { key: Kind; label: string; icon: typeof Bookmark }[] = [
  { key: 'link', label: '书签', icon: Bookmark },
  { key: 'competition', label: '竞赛', icon: Trophy },
  { key: 'paper', label: '论文', icon: FileText },
]

/** 浅蓝 → 紫 为主，末尾保留三种语义色 */
export const PALETTE = ['#7dd3fc', '#60a5fa', '#818cf8', '#a78bfa', '#c084fc', '#fb7185', '#fbbf24', '#34d399']

/* ---------- 主体 ---------- */

export function CategoriesAdmin({ rows }: { rows: CatRow[] }) {
  const [kind, setKind] = useState<Kind>('link')
  const [q, setQ] = useState('')
  const [order, setOrder] = useState(rows)
  const { run, pending } = useMutate()

  // 服务端刷新后以服务端为准
  useEffect(() => setOrder(rows), [rows])

  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return order.filter((r) => r.kind === kind && (!k || r.name.toLowerCase().includes(k) || r.slug.includes(k)))
  }, [order, kind, q])

  const sel = useSelection(list)
  const tally = useMemo(() => {
    const m: Record<Kind, number> = { link: 0, competition: 0, paper: 0 }
    order.forEach((r) => m[r.kind]++)
    return m
  }, [order])

  const patchLocal = (id: number, p: Partial<CatRow>) =>
    setOrder((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)))

  // 乐观更新失败时回滚到服务端数据
  const commit = (fn: () => Promise<unknown>, msg?: string) =>
    run(fn, msg).then((r) => { if (r === undefined) setOrder(rows) })

  /* ---- 拖拽排序 ---- */
  const dragId = useRef<number | null>(null)
  const [over, setOver] = useState<{ id: number; after: boolean } | null>(null)
  const canDrag = !q.trim()

  const drop = (targetId: number) => {
    const from = dragId.current
    dragId.current = null
    setOver(null)
    if (from == null || from === targetId) return
    const same = order.filter((r) => r.kind === kind)
    const a = same.findIndex((r) => r.id === from)
    const b = same.findIndex((r) => r.id === targetId)
    if (a < 0 || b < 0) return
    const next = [...same]
    const [moved] = next.splice(a, 1)
    next.splice(b, 0, moved)
    const changed: CatRow[] = []
    const sorted = next.map((r, i) => {
      if (r.sort === i + 1) return r
      const n = { ...r, sort: i + 1 }
      changed.push(n)
      return n
    })
    setOrder((prev) => [...prev.filter((r) => r.kind !== kind), ...sorted])
    if (changed.length) {
      commit(() => Promise.all(changed.map((r) => api(`/api/categories/${r.id}`, { method: 'PATCH', body: { sort: r.sort } }))), '✓')
    }
  }

  /* ---- 批量删除 ---- */
  const picked = list.filter((r) => sel.selected.has(r.id))
  const affected = picked.reduce((s, r) => s + (r.count ?? 0), 0)
  const bulkDelete = async () => {
    const ids = picked.map((r) => r.id)
    const ok = await run(
      () => Promise.all(ids.map((id) => api(`/api/categories/${id}`, { method: 'DELETE' }))),
      `已删除 ${ids.length}`,
    )
    if (ok) sel.clear()
  }

  return (
    <div>
      <AdminTitle title="分类" count={order.length} />

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
        {/* 侧栏：类型 + 新增 */}
        <motion.aside
          className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6 lg:self-start"
          initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <KindTabs value={kind} onChange={(k) => { setKind(k); sel.clear() }} tally={tally} />
          <AddForm kind={kind} pending={pending} run={run} />
        </motion.aside>

        <section className="min-w-0">
          <Toolbar>
            <SearchInput value={q} onChange={setQ} placeholder="搜索" />
          </Toolbar>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={kind}
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <AdminTable
                className="liquid rounded-3xl"
                empty={list.length ? undefined : (
                  <EmptyState icon={q ? <SearchX size={28} /> : <Tags size={28} />} />
                )}
                head={
                  <>
                    <Th className="w-12">
                      <Checkbox checked={sel.allChecked} indeterminate={sel.someChecked} onChange={sel.toggleAll} />
                    </Th>
                    <Th>名称</Th>
                    <Th className="hidden sm:table-cell">slug</Th>
                    <Th className="w-16 text-right" title="使用"><Hash size={12} className="ml-auto" /></Th>
                    <Th className="w-[1%]" />
                  </>
                }
              >
                {list.map((r) => (
                  <Row
                    key={r.id}
                    row={r}
                    selected={sel.selected.has(r.id)}
                    onToggle={() => sel.toggle(r.id)}
                    draggable={canDrag}
                    indicator={over?.id === r.id ? (over.after ? 'after' : 'before') : null}
                    dragging={dragId.current === r.id}
                    onDragStart={() => { dragId.current = r.id }}
                    onDragOver={() => {
                      if (dragId.current == null || dragId.current === r.id) return
                      const ids = list.map((x) => x.id)
                      const after = ids.indexOf(dragId.current) < ids.indexOf(r.id)
                      if (over?.id !== r.id || over.after !== after) setOver({ id: r.id, after })
                    }}
                    onDrop={() => drop(r.id)}
                    onDragEnd={() => { dragId.current = null; setOver(null) }}
                    onRename={(name) => {
                      patchLocal(r.id, { name })
                      commit(() => api(`/api/categories/${r.id}`, { method: 'PATCH', body: { name } }), '已重命名')
                    }}
                    onColor={(color) => {
                      patchLocal(r.id, { color })
                      commit(() => api(`/api/categories/${r.id}`, { method: 'PATCH', body: { color } }))
                    }}
                    onDelete={() => run(() => api(`/api/categories/${r.id}`, { method: 'DELETE' }), '已删除')}
                  />
                ))}
              </AdminTable>
            </motion.div>
          </AnimatePresence>
        </section>
      </div>

      <BulkBar count={picked.length} onClear={sel.clear}>
        <ArmButton
          idle={<Trash2 size={14} />}
          armed={<>删除？<span className="num opacity-70">{picked.length}</span>{affected > 0 && <span className="num opacity-55">· {affected}</span>}</>}
          onConfirm={bulkDelete}
        />
      </BulkBar>
    </div>
  )
}

/* ---------- 类型切换 ---------- */

function KindTabs({ value, onChange, tally }: {
  value: Kind; onChange: (k: Kind) => void; tally: Record<Kind, number>
}) {
  return (
    <div className="liquid grid grid-cols-3 gap-1 rounded-3xl p-1.5 lg:grid-cols-1">
      {KINDS.map(({ key, label, icon: Icon }) => {
        const on = key === value
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            aria-pressed={on}
            className={cn(
              'relative flex min-h-10 items-center justify-center gap-2 rounded-2xl px-3 text-[13px] transition-colors duration-200 lg:justify-start',
              on ? 'text-white' : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80',
            )}
          >
            {on && (
              <motion.span
                layoutId="cat-kind"
                className="absolute inset-0 rounded-2xl border border-indigo-300/30 shadow-[0_0_24px_-8px_rgb(129_140_248/0.7)]"
                style={{ background: 'var(--grad-soft)' }}
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              />
            )}
            <Icon size={14} className={cn('relative shrink-0', on && 'text-sky-200')} />
            <span className="relative lg:flex-1 lg:text-left">{label}</span>
            <span className={cn('num relative text-[11px]', on ? 'text-indigo-100/80' : 'text-white/30')}>{tally[key]}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- 新增 ---------- */

function AddForm({ kind, pending, run }: {
  kind: Kind; pending: boolean; run: ReturnType<typeof useMutate>['run']
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const input = useRef<HTMLInputElement>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return input.current?.focus()
    const ok = await run(
      () => api('/api/categories', { method: 'POST', body: { name: name.trim(), slug: slug.trim() || undefined, kind, color } }),
      '已新增',
    )
    if (ok) {
      setName('')
      setSlug('')
      setColor(PALETTE[(PALETTE.indexOf(color) + 1) % PALETTE.length])
      input.current?.focus()
    }
  }

  return (
    <form onSubmit={submit} className="liquid flex flex-wrap items-center gap-2 rounded-3xl p-2.5 lg:flex-col lg:items-stretch">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <ColorPick value={color} onPick={setColor} />
        <input
          ref={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名称"
          aria-label="名称"
          className="field h-10 min-w-0 flex-1 py-0"
        />
      </div>
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="slug"
        aria-label="slug"
        className="field num hidden h-10 w-28 py-0 text-[12.5px] sm:block lg:w-full"
      />
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="btn btn-primary shine h-10 w-10 shrink-0 p-0 lg:w-full"
        aria-label="新增"
        title="新增"
      >
        <Plus size={17} strokeWidth={2.4} />
      </button>
    </form>
  )
}

/* ---------- 行 ---------- */

function Row({
  row, selected, onToggle, draggable, indicator, dragging,
  onDragStart, onDragOver, onDrop, onDragEnd, onRename, onColor, onDelete,
}: {
  row: CatRow; selected: boolean; onToggle: () => void
  draggable: boolean; indicator: 'before' | 'after' | null; dragging: boolean
  onDragStart: () => void; onDragOver: () => void; onDrop: () => void; onDragEnd: () => void
  onRename: (name: string) => void; onColor: (c: string) => void; onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.name)

  useEffect(() => { if (!editing) setDraft(row.name) }, [row.name, editing])

  const commit = () => {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== row.name) onRename(v)
    else setDraft(row.name)
  }

  return (
    <Tr
      selected={selected}
      draggable={draggable && !editing}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragOver={(e) => { e.preventDefault(); onDragOver() }}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
      onDragEnd={onDragEnd}
      onClick={onToggle}
      className={cn(
        'cursor-default',
        dragging && 'opacity-40',
        indicator === 'before' && 'shadow-[inset_0_2px_0_0_rgb(129_140_248/0.85)]',
        indicator === 'after' && 'shadow-[inset_0_-2px_0_0_rgb(129_140_248/0.85)]',
      )}
    >
      <Td>
        <div className="flex items-center gap-1.5">
          <Checkbox checked={selected} onChange={onToggle} />
          <GripVertical
            size={13}
            aria-hidden
            className={cn('hidden shrink-0 text-white/15 transition-colors md:block', draggable ? 'cursor-grab group-hover:text-indigo-200/60' : 'opacity-0')}
          />
        </div>
      </Td>

      <Td className="w-full max-w-0">
        <div className="flex min-w-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <ColorPick value={row.color} onPick={onColor} />
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') { setDraft(row.name); setEditing(false) }
              }}
              aria-label="名称"
              className="field -my-1 h-9 max-w-xs py-0 text-[13.5px]"
            />
          ) : (
            <button
              onClick={() => setEditing(true)}
              title="重命名"
              className="group/name flex min-h-9 min-w-0 items-center gap-1.5 text-left text-white/90 hover:text-white"
            >
              <span className="truncate">{row.name}</span>
              <Pencil size={11} className="shrink-0 text-white/20 transition-colors group-hover/name:text-indigo-200/70 md:text-white/0" />
            </button>
          )}
        </div>
      </Td>

      <Td className="hidden sm:table-cell">
        <span className="num text-[12.5px] text-white/38">{row.slug}</span>
      </Td>

      <Td className="text-right">
        {row.count === null
          ? <span className="text-white/22">—</span>
          : <span className={cn('num', row.count ? 'text-white/80' : 'text-white/30')}>{row.count}</span>}
      </Td>

      <Td className="text-right" onClick={(e) => e.stopPropagation()}>
        <ArmButton
          idle={<Trash2 size={13} />}
          armed={<>删除？{row.count ? <span className="num opacity-60">· {row.count}</span> : null}</>}
          onConfirm={onDelete}
          compact
        />
      </Td>
    </Tr>
  )
}

/* ---------- 两步删除 ---------- */

function ArmButton({ idle, armed, onConfirm, compact }: {
  idle: React.ReactNode; armed: React.ReactNode; onConfirm: () => void; compact?: boolean
}) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!on) return
    const t = setTimeout(() => setOn(false), 3200)
    return () => clearTimeout(t)
  }, [on])

  return (
    <AnimatePresence mode="wait" initial={false}>
      {on ? (
        <motion.span
          key="armed"
          className="inline-flex"
          initial={{ opacity: 0, x: 6, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          <ConfirmButton
            onConfirm={() => { setOn(false); onConfirm() }}
            className={cn('btn-danger btn-sm gap-1.5 border-rose-400/40 bg-rose-500/10', compact ? 'h-10 md:h-8' : 'h-9')}
          >
            <Check size={12} /> {armed}
          </ConfirmButton>
        </motion.span>
      ) : (
        <motion.span
          key="idle"
          className="inline-flex"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setOn(true) }}
            className={cn(
              'btn btn-danger',
              compact ? cn(ICON_BTN, 'text-white/40 opacity-70 group-hover:opacity-100') : 'btn-sm h-9 w-9 p-0',
            )}
            aria-label="删除"
            title="删除"
          >
            {idle}
          </button>
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/* ---------- 取色 ---------- */

function ColorPick({ value, onPick }: { value: string | null; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const [custom, setCustom] = useState(value || PALETTE[0])
  const [mounted, setMounted] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => setMounted(true), [])
  useEffect(() => { setCustom(value || PALETTE[0]) }, [value])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  useEffect(() => () => clearTimeout(timer.current), [])

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    const r = btn.current?.getBoundingClientRect()
    if (r) setPos({ left: Math.min(r.left - 8, window.innerWidth - 196), top: r.bottom + 8 })
    setOpen((o) => !o)
  }

  const pick = (c: string) => { setOpen(false); if (c !== value) onPick(c) }

  // 原生取色器拖动时连续触发，停手后再提交
  const onCustom = (c: string) => {
    setCustom(c)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { if (c !== value) onPick(c) }, 380)
  }

  const c = value || 'rgb(255 255 255 / 0.25)'

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        aria-label="颜色"
        title="颜色"
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/[0.07]"
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: c, boxShadow: value ? `0 0 10px ${value}` : undefined }} />
      </button>

      {mounted && createPortal(
        <AnimatePresence>
          {open && (
            <>
              <div className="fixed inset-0 z-[80]" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
              <motion.div
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, y: -6, scale: 0.96, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -4, scale: 0.97, filter: 'blur(4px)' }}
                transition={{ duration: 0.22, ease: EASE }}
                style={pos}
                className="liquid-strong fixed z-[81] w-[184px] rounded-2xl p-2.5"
              >
                <div className="grid grid-cols-4 gap-1.5">
                  {PALETTE.map((p) => (
                    <button
                      key={p}
                      onClick={() => pick(p)}
                      className={cn(
                        'flex h-8 items-center justify-center rounded-lg border transition-all duration-200 hover:scale-105',
                        value?.toLowerCase() === p ? 'border-white/40 bg-white/[0.08]' : 'border-transparent hover:bg-white/[0.06]',
                      )}
                      aria-label={p}
                    >
                      <span className="h-3.5 w-3.5 rounded-full" style={{ background: p, boxShadow: `0 0 10px ${p}` }} />
                    </button>
                  ))}
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.07] px-2 py-1.5 text-[12px] text-white/55 transition-colors hover:border-white/20 hover:text-white/85">
                  <span className="relative h-4 w-4 overflow-hidden rounded-md border border-white/20" style={{ background: custom }}>
                    <input
                      type="color"
                      value={custom}
                      onChange={(e) => onCustom(e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </span>
                  <span className="num flex-1 uppercase">{custom}</span>
                  <Pipette size={12} />
                </label>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
