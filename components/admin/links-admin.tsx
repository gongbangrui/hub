'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pin, PinOff, Pencil, Trash2, GripVertical, ExternalLink, Bookmark, RotateCcw,
  SearchX, Layers, CircleDashed, Hash, FolderInput, MousePointerClick,
} from 'lucide-react'
import { Favicon as FaviconBase } from '@/components/ui/favicon'
import type { Link as LinkRow, Category } from '@/db/schema'
import { cn, hostOf, toneOf } from '@/lib/utils'
import { EmptyState } from '@/components/ui/primitives'
import { LinksEditor } from '@/components/public/links-editor'
import { LinkImporter } from '@/components/public/link-importer'
import {
  AdminTitle, Toolbar, SearchInput, Checkbox, useSelection, BulkBar,
  AdminTable, Th, Td, Tr, api, useMutate,
} from '@/components/admin/ui'

const EASE = [0.22, 1, 0.36, 1] as const

/** 行内图标按钮：移动端 40px 触控，桌面收紧 */
const ICON_BTN = 'btn btn-ghost btn-sm h-10 w-10 p-0 md:h-8 md:w-8'

type CatFilter = 'all' | 'none' | number
type Drop = { id: number; after: boolean } | null

// 置顶在前，组内保持原有相对顺序（Array.sort 稳定）
const byPinned = (rs: LinkRow[]) => [...rs].sort((a, b) => Number(b.pinned) - Number(a.pinned))

export function LinksAdmin({ links, categories, autoNew }: {
  links: LinkRow[]; categories: Category[]; autoNew?: boolean
}) {
  const { run, pending } = useMutate()

  // 本地副本：乐观更新 + 拖拽排序，服务端刷新后同步
  const [rows, setRows] = useState(links)
  useEffect(() => setRows(links), [links])

  const [q, setQ] = useState('')
  const [cat, setCat] = useState<CatFilter>('all')
  const [tag, setTag] = useState('')
  const [editor, setEditor] = useState<{ open: boolean; link: LinkRow | null }>({ open: false, link: null })

  // ?new=1 自动打开新增，并清掉参数避免保存刷新后再次弹出
  useEffect(() => {
    if (!autoNew) return
    setEditor({ open: true, link: null })
    window.history.replaceState(null, '', '/admin/links')
  }, [autoNew])

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const catCount = useMemo(() => {
    const m = new Map<number | 'none', number>()
    rows.forEach((r) => {
      const k = r.categoryId && catMap.has(r.categoryId) ? r.categoryId : 'none'
      m.set(k, (m.get(k) ?? 0) + 1)
    })
    return m
  }, [rows, catMap])

  const tags = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((r) => (r.tags ?? []).forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)))
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [rows])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (cat === 'none' && r.categoryId && catMap.has(r.categoryId)) return false
      if (typeof cat === 'number' && r.categoryId !== cat) return false
      if (tag && !(r.tags ?? []).includes(tag)) return false
      if (!k) return true
      return [r.title, r.url, r.description ?? '', ...(r.tags ?? [])].some((s) => s.toLowerCase().includes(k))
    })
  }, [rows, q, cat, tag, catMap])

  const filtering = !!q.trim() || cat !== 'all' || !!tag
  const reset = () => { setQ(''); setCat('all'); setTag('') }

  const sel = useSelection(filtered)
  const ids = () => [...sel.selected]

  /* ---------- 写操作（乐观更新，失败回滚） ---------- */

  async function optimistic(next: LinkRow[], fn: () => Promise<unknown>, msg?: string) {
    const prev = rows
    setRows(next)
    const r = await run(fn, msg)
    if (r === undefined) setRows(prev)
    return r !== undefined
  }

  const patchAll = (list: number[], body: Record<string, unknown>) =>
    () => Promise.all(list.map((id) => api(`/api/links/${id}`, { method: 'PATCH', body })))

  function setPinned(list: number[], pinned: boolean) {
    const s = new Set(list)
    return optimistic(
      byPinned(rows.map((r) => (s.has(r.id) ? { ...r, pinned } : r))),
      patchAll(list, { pinned }),
      list.length > 1 ? (pinned ? '已置顶' : '已取消') : undefined,
    )
  }

  function move(list: number[], categoryId: number | null) {
    const s = new Set(list)
    return optimistic(
      rows.map((r) => (s.has(r.id) ? { ...r, categoryId } : r)),
      patchAll(list, { categoryId }),
      '已移动',
    )
  }

  function remove(list: number[]) {
    const s = new Set(list)
    return optimistic(
      rows.filter((r) => !s.has(r.id)),
      () => Promise.all(list.map((id) => api(`/api/links/${id}`, { method: 'DELETE' }))),
      '已删除',
    )
  }

  /* ---------- 拖拽排序（原生 DnD，仅同一置顶分组内） ---------- */

  const [armed, setArmed] = useState<number | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [drop, setDrop] = useState<Drop>(null)

  useEffect(() => {
    if (armed === null) return
    const off = () => setArmed(null)
    window.addEventListener('pointerup', off)
    return () => window.removeEventListener('pointerup', off)
  }, [armed])

  const endDrag = () => { setArmed(null); setDragId(null); setDrop(null) }

  function onDragOver(e: React.DragEvent<HTMLTableRowElement>, l: LinkRow) {
    if (dragId === null || dragId === l.id) return
    const src = rows.find((r) => r.id === dragId)
    if (!src || src.pinned !== l.pinned) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const box = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > box.top + box.height / 2
    if (drop?.id !== l.id || drop.after !== after) setDrop({ id: l.id, after })
  }

  async function onDrop(e: React.DragEvent<HTMLTableRowElement>) {
    e.preventDefault()
    const src = rows.find((r) => r.id === dragId)
    const target = drop
    endDrag()
    if (!src || !target) return
    const next = rows.filter((r) => r.id !== src.id)
    next.splice(next.findIndex((r) => r.id === target.id) + (target.after ? 1 : 0), 0, src)
    if (next.every((r, i) => r.id === rows[i].id)) return
    await optimistic(next, () => api('/api/links/reorder', { method: 'POST', body: { ids: next.map((r) => r.id) } }), '✓')
  }

  /* ---------- 渲染 ---------- */

  const openNew = () => setEditor({ open: true, link: null })

  const newBtn = (
    <button onClick={openNew} className="btn btn-primary shine h-10 w-10 p-0" aria-label="新增" title="新增">
      <Plus size={17} strokeWidth={2.4} />
    </button>
  )

  const catItems: RailItem[] = [
    { key: 'all', label: '全部', icon: <Layers size={13} />, count: rows.length },
    ...categories.map((c) => ({
      key: c.id as CatFilter,
      label: c.name,
      icon: <span className="h-2 w-2 rounded-full" style={{ background: c.color ?? '#818cf8', boxShadow: `0 0 8px ${c.color ?? '#818cf8'}` }} />,
      count: catCount.get(c.id) ?? 0,
    })),
    { key: 'none', label: '∅', title: '未分类', icon: <CircleDashed size={13} />, count: catCount.get('none') ?? 0 },
  ]

  return (
    <>
      <AdminTitle
        title="书签"
        count={links.length}
        actions={<><LinkImporter />{newBtn}</>}
      />

      {links.length === 0 ? (
        <div className="liquid rounded-3xl">
          <EmptyState
            icon={<Bookmark size={30} />}
            action={<div className="flex items-center gap-2">{newBtn}<LinkImporter /></div>}
          />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-6">
          {/* 侧栏：分类 + 标签（移动端横向滚动） */}
          <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
            <motion.div
              className="liquid rounded-3xl p-1.5 xl:p-2.5"
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
            >
              <Rail id="links-cat" items={catItems} value={cat} onChange={setCat} />
              {tags.length > 0 && (
                <>
                  <div className="hairline my-1.5 xl:my-2.5" />
                  <div className="flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] xl:max-h-[38vh] xl:flex-wrap xl:overflow-y-auto xl:overflow-x-hidden">
                    {tags.map(([t, n]) => (
                      <button
                        key={t}
                        onClick={() => setTag(tag === t ? '' : t)}
                        data-active={tag === t}
                        className="chip shrink-0 px-2.5 py-1 text-[12px]"
                        aria-pressed={tag === t}
                      >
                        <Hash size={11} className="opacity-60" />{t}
                        <span className="num text-[10.5px] opacity-45">{n}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </aside>

          <section className="min-w-0">
            <Toolbar>
              <SearchInput value={q} onChange={setQ} placeholder="搜索" />
              <AnimatePresence initial={false}>
                {filtering && (
                  <motion.div
                    className="flex items-center gap-1.5"
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.24, ease: EASE }}
                  >
                    <span className="num rounded-full border border-indigo-300/20 bg-indigo-400/10 px-2 py-0.5 text-[11.5px] text-indigo-100/70">
                      {filtered.length}/{rows.length}
                    </span>
                    <button onClick={reset} className="btn btn-ghost h-10 w-10 p-0" aria-label="重置" title="重置">
                      <RotateCcw size={14} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </Toolbar>

            <AdminTable
              className="liquid rounded-3xl"
              empty={
                filtered.length === 0 ? (
                  <EmptyState
                    icon={<SearchX size={28} />}
                    action={
                      <button onClick={reset} className="btn btn-ghost h-10 w-10 p-0" aria-label="重置" title="重置">
                        <RotateCcw size={15} />
                      </button>
                    }
                  />
                ) : undefined
              }
              head={
                <>
                  <Th className="w-[64px]">
                    <Checkbox checked={sel.allChecked} indeterminate={sel.someChecked} onChange={sel.toggleAll} />
                  </Th>
                  <Th>标题</Th>
                  <Th className="hidden sm:table-cell">分类</Th>
                  <Th className="hidden 2xl:table-cell">标签</Th>
                  <Th className="text-center" title="置顶"><Pin size={12} className="mx-auto" /></Th>
                  <Th className="hidden text-right md:table-cell" title="点击">
                    <MousePointerClick size={12} className="ml-auto" />
                  </Th>
                  <Th className="w-[1%]" />
                </>
              }
            >
              {filtered.map((l) => {
                const c = l.categoryId ? catMap.get(l.categoryId) : undefined
                const isDrop = drop?.id === l.id
                return (
                  <Tr
                    key={l.id}
                    selected={sel.selected.has(l.id)}
                    draggable={armed === l.id}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', String(l.id))
                      setDragId(l.id)
                    }}
                    onDragOver={(e) => onDragOver(e, l)}
                    onDrop={onDrop}
                    onDragEnd={endDrag}
                    onClick={() => sel.toggle(l.id)}
                    onDoubleClick={() => setEditor({ open: true, link: l })}
                    className={cn(
                      'cursor-default select-none',
                      dragId === l.id && 'opacity-40',
                      isDrop && (drop?.after
                        ? '[&>td]:shadow-[inset_0_-2px_0_0_rgb(129_140_248)]'
                        : '[&>td]:shadow-[inset_0_2px_0_0_rgb(129_140_248)]'),
                    )}
                  >
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Checkbox checked={sel.selected.has(l.id)} onChange={() => sel.toggle(l.id)} />
                        <span
                          onPointerDown={() => setArmed(l.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="hidden cursor-grab rounded p-0.5 text-white/20 transition-colors hover:text-indigo-200/80 active:cursor-grabbing md:inline-flex"
                          aria-label="拖动排序"
                          title="拖动排序"
                        >
                          <GripVertical size={14} />
                        </span>
                      </div>
                    </Td>

                    <Td className="w-full max-w-0">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Favicon link={l} />
                        <div className="min-w-0">
                          <span className="block truncate font-medium text-white/90" title={l.title}>
                            {l.title}
                          </span>
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate text-[11.5px] text-white/35 transition-colors hover:text-sky-200"
                            title={l.url}
                          >
                            {hostOf(l.url)}
                          </a>
                        </div>
                      </div>
                    </Td>

                    <Td className="hidden sm:table-cell">
                      {c ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setCat(c.id) }}
                          className="inline-flex max-w-[140px] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[12px] text-white/70 transition-colors hover:border-indigo-300/35"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.color ?? '#818cf8' }} />
                          <span className="truncate">{c.name}</span>
                        </button>
                      ) : (
                        <span className="text-[12px] text-white/22">—</span>
                      )}
                    </Td>

                    <Td className="hidden 2xl:table-cell">
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {(l.tags ?? []).slice(0, 4).map((t) => (
                          <button
                            key={t}
                            onClick={(e) => { e.stopPropagation(); setTag(t) }}
                            className={cn(
                              'rounded-md px-1.5 py-px text-[11.5px] transition-colors',
                              tag === t ? 'bg-violet-400/15 text-violet-200' : 'bg-white/[0.05] text-white/45 hover:text-white/80',
                            )}
                          >
                            #{t}
                          </button>
                        ))}
                        {(l.tags?.length ?? 0) > 4 && <span className="num text-[11px] text-white/25">+{l.tags!.length - 4}</span>}
                      </div>
                    </Td>

                    <Td className="text-center">
                      <Switch on={l.pinned} onChange={(v) => setPinned([l.id], v)} />
                    </Td>

                    <Td className="num hidden text-right text-white/55 md:table-cell">{l.clickCount}</Td>

                    <Td>
                      <div className="flex items-center justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={cn(ICON_BTN, 'hidden sm:inline-flex')}
                          aria-label="打开"
                          title="打开"
                        >
                          <ExternalLink size={13} />
                        </a>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditor({ open: true, link: l }) }}
                          className={ICON_BTN}
                          aria-label="编辑"
                          title="编辑"
                        >
                          <Pencil size={13} />
                        </button>
                        <ConfirmDelete onConfirm={() => remove([l.id])} compact />
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </AdminTable>
          </section>
        </div>
      )}

      <BulkBar count={sel.selected.size} onClear={sel.clear}>
        <button
          disabled={pending}
          onClick={() => setPinned(ids(), true).then(sel.clear)}
          className="btn btn-sm h-9 w-9 p-0"
          aria-label="置顶" title="置顶"
        >
          <Pin size={13} />
        </button>
        <button
          disabled={pending}
          onClick={() => setPinned(ids(), false).then(sel.clear)}
          className="btn btn-sm h-9 w-9 p-0"
          aria-label="取消置顶" title="取消置顶"
        >
          <PinOff size={13} />
        </button>
        <label className="relative" title="移动到">
          <FolderInput size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-indigo-200/70" />
          <select
            value=""
            disabled={pending}
            aria-label="移动到"
            onChange={(e) => {
              const v = e.target.value
              if (!v) return
              move(ids(), v === 'none' ? null : Number(v)).then(sel.clear)
            }}
            className="field h-9 w-[92px] py-0 pl-8 text-[12.5px] sm:w-auto"
          >
            <option value="" disabled>→</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="none">∅</option>
          </select>
        </label>
        <ConfirmDelete disabled={pending} count={sel.selected.size} onConfirm={() => remove(ids()).then(sel.clear)} />
      </BulkBar>

      <LinksEditor
        open={editor.open}
        link={editor.link}
        categories={categories}
        onClose={() => setEditor((s) => ({ ...s, open: false }))}
      />
    </>
  )
}

/* ---------- 侧栏筛选 ---------- */

type RailItem = { key: CatFilter; label: string; title?: string; icon: React.ReactNode; count: number }

function Rail({ id, items, value, onChange }: {
  id: string; items: RailItem[]; value: CatFilter; onChange: (v: CatFilter) => void
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none] xl:flex-col xl:overflow-visible">
      {items.map((it) => {
        const on = it.key === value
        return (
          <button
            key={String(it.key)}
            onClick={() => onChange(it.key)}
            title={it.title ?? it.label}
            aria-pressed={on}
            className={cn(
              'relative flex min-h-10 shrink-0 items-center gap-2.5 rounded-2xl px-3 text-left text-[13px] transition-colors duration-200',
              on ? 'text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85',
            )}
          >
            {on && (
              <motion.span
                layoutId={id}
                className="absolute inset-0 rounded-2xl border border-indigo-300/30 shadow-[0_0_24px_-8px_rgb(129_140_248/0.7)]"
                style={{ background: 'var(--grad-soft)' }}
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              />
            )}
            <span className="relative flex w-3.5 shrink-0 items-center justify-center">{it.icon}</span>
            <span className="relative max-w-[9rem] truncate xl:flex-1">{it.label}</span>
            <span className={cn('num relative text-[11px]', on ? 'text-indigo-100/80' : 'text-white/30')}>{it.count}</span>
          </button>
        )
      })}
    </nav>
  )
}

/* ---------- 小部件 ---------- */

function Favicon({ link }: { link: LinkRow }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.04]">
      <FaviconBase url={link.url} title={link.title} size={20} radius="rounded-md" />
    </span>
  )
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="置顶"
      title="置顶"
      onClick={(e) => { e.stopPropagation(); onChange(!on) }}
      className="inline-flex h-10 items-center justify-center px-1"
    >
      <span
        className={cn(
          'relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors duration-300',
          on
            ? 'border-transparent bg-gradient-to-r from-sky-300 via-indigo-400 to-purple-400 shadow-[0_0_12px_-2px_rgb(129_140_248/0.7)]'
            : 'border-white/15 bg-white/[0.06]',
        )}
      >
        <motion.span
          className={cn('absolute h-3 w-3 rounded-full', on ? 'bg-[#060818]' : 'bg-white/45')}
          animate={{ x: on ? 16 : 3 }}
          transition={{ type: 'spring', stiffness: 520, damping: 32 }}
        />
      </span>
    </button>
  )
}

/** 两次点击确认删除，2.6s 后自动复位 */
function ConfirmDelete({ onConfirm, compact, disabled, count }: {
  onConfirm: () => void; compact?: boolean; disabled?: boolean; count?: number
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <motion.button
      layout
      transition={{ duration: 0.24, ease: EASE }}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        if (timer.current) clearTimeout(timer.current)
        if (armed) { setArmed(false); onConfirm(); return }
        setArmed(true)
        timer.current = setTimeout(() => setArmed(false), 2600)
      }}
      onBlur={() => setArmed(false)}
      className={cn(
        'btn btn-danger',
        compact ? 'btn-sm h-10 min-w-10 px-0 md:h-8 md:min-w-8' : 'btn-sm h-9 min-w-9 px-0',
        compact && !armed && 'btn-ghost',
        armed && 'border-rose-400/45 bg-rose-500/16 px-2.5 text-rose-200',
      )}
      aria-label={armed ? '确认删除' : '删除'}
      title="删除"
    >
      <Trash2 size={13} />
      {armed && (
        <span className="flex items-center gap-1">
          删除？{count !== undefined && <span className="num opacity-70">{count}</span>}
        </span>
      )}
    </motion.button>
  )
}
