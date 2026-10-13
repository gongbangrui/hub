'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { m as motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, ExternalLink, Copy, Check, Paperclip, FileText, Download,
  Quote, FileSpreadsheet, BookOpen, ChevronDown, ArrowUp, ArrowDown, ChevronsUpDown, CircleDot, FilterX, Filter,
} from 'lucide-react'
import { cn, fileKind } from '@/lib/utils'
import { EmptyState, StatusBadge, STATUSES } from '@/components/ui/primitives'
import { PageTitle } from '@/components/ui/page'
import { Magnetic, EASE } from '@/components/ui/fx'
import { PaperEditor } from '@/components/public/paper-editor'
import { buildBibtex, type PaperItem } from '@/components/public/papers-view'
import {
  Toolbar, SearchInput, Checkbox, useSelection, BulkBar,
  AdminTable, Th, Td, Tr, api, useMutate,
} from '@/components/admin/ui'

type Status = keyof typeof STATUSES
type SortKey = 'title' | 'venue' | 'type' | 'status' | 'pubDate' | 'atts'

const STATUS_ORDER: Status[] = ['draft', 'submitted', 'accepted', 'published']
const TYPE_LABEL: Record<string, string> = { journal: '期刊', conference: '会议', preprint: '预印本' }

const DOT: Record<Status, string> = {
  draft: 'rgb(100 116 139 / 0.5)',
  submitted: '#38bdf8',
  accepted: '#a78bfa',
  published: '#34d399',
}

type Pop =
  | { el: HTMLElement; kind: 'status'; ids: number[]; current?: Status }
  | { el: HTMLElement; kind: 'export' }

export function PapersAdmin({ items, startNew = false }: { items: PaperItem[]; startNew?: boolean }) {
  const { run, pending } = useMutate()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status | 'all'>('all')
  const [type, setType] = useState('all')
  const [year, setYear] = useState('all')
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'pubDate', asc: false })
  const [editing, setEditing] = useState<PaperItem | null>(null)
  const [creating, setCreating] = useState(startNew)
  const [pop, setPop] = useState<Pop | null>(null)
  // 行内改状态先乐观落地，刷新后以服务端为准
  const [override, setOverride] = useState<Record<number, Status>>({})

  useEffect(() => { if (startNew) setCreating(true) }, [startNew])
  useEffect(() => { setOverride({}) }, [items])

  const list = useMemo(
    () => items.map((p) => (override[p.id] ? { ...p, status: override[p.id] } : p)),
    [items, override],
  )

  const years = useMemo(
    () => [...new Set(items.map((p) => (p.pubDate ?? '').slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort().reverse(),
    [items],
  )

  // 除状态外的筛选；状态计数基于它
  const base = useMemo(() => {
    const q = query.trim().toLowerCase()
    return list.filter((p) => {
      if (type !== 'all' && (type === 'none' ? !!p.type : p.type !== type)) return false
      if (year !== 'all' && (p.pubDate ?? '').slice(0, 4) !== year) return false
      if (!q) return true
      return [p.title, p.venue, p.doi, p.level, p.abstract, ...(p.authors ?? [])]
        .some((s) => (s ?? '').toLowerCase().includes(q))
    })
  }, [list, query, type, year])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: base.length }
    for (const s of STATUS_ORDER) c[s] = 0
    for (const p of base) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [base])

  const filtered = useMemo(() => {
    const out = status === 'all' ? base : base.filter((p) => p.status === status)
    const dir = sort.asc ? 1 : -1
    const val = (p: PaperItem): string | number => {
      switch (sort.key) {
        case 'status': return STATUS_ORDER.indexOf(p.status as Status)
        case 'atts': return p.attachments.length
        case 'type': return p.type ?? ''
        default: return (p[sort.key] ?? '') as string
      }
    }
    return [...out].sort((a, b) => {
      const av = val(a), bv = val(b)
      const d = typeof av === 'number' ? av - (bv as number) : av.localeCompare(bv as string, 'zh-CN')
      return (d || b.id - a.id) * dir
    })
  }, [base, status, sort])

  const sel = useSelection(filtered)
  const picked = useMemo(() => filtered.filter((p) => sel.selected.has(p.id)), [filtered, sel.selected])
  const filtering = !!query || type !== 'all' || year !== 'all' || status !== 'all'

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: key === 'title' || key === 'venue' }))
  }

  function resetFilters() {
    setQuery(''); setType('all'); setYear('all'); setStatus('all')
  }

  async function changeStatus(ids: number[], s: Status) {
    setPop(null)
    const prev = override
    setOverride((o) => { const n = { ...o }; ids.forEach((id) => (n[id] = s)); return n })
    const r = await run(
      () => Promise.all(ids.map((id) => api(`/api/papers/${id}`, { method: 'PATCH', body: { status: s } }))),
      ids.length > 1 ? `${ids.length} → ${STATUSES[s].label}` : `→ ${STATUSES[s].label}`,
    )
    if (!r) setOverride(prev)
  }

  async function removeMany(ids: number[]) {
    const r = await run(
      () => Promise.all(ids.map((id) => api(`/api/papers/${id}`, { method: 'DELETE' }))),
      ids.length > 1 ? `已删除 ${ids.length}` : '已删除',
    )
    if (r) sel.clear()
  }

  function closeEditor() {
    setCreating(false); setEditing(null)
    // 同步去掉 ?new=1，避免 PaperEditor 保存后 reload 又弹出
    if (window.location.search.includes('new=')) window.history.replaceState(null, '', window.location.pathname)
  }

  const openStatus = (el: HTMLElement, ids: number[], current?: Status) =>
    setPop((p) => (p?.el === el ? null : { el, kind: 'status', ids, current }))

  const rowProps = (p: PaperItem) => ({
    p,
    selected: sel.selected.has(p.id),
    onToggle: () => sel.toggle(p.id),
    onEdit: () => setEditing(p),
    onStatus: (el: HTMLElement) => openStatus(el, [p.id], p.status as Status),
    onDelete: () => removeMany([p.id]),
  })

  return (
    <div>
      <PageTitle
        icon={<BookOpen size={20} />}
        title="论文"
        count={items.length}
        right={
          <>
            <button
              onClick={(e) => { const el = e.currentTarget; setPop((p) => (p?.el === el ? null : { el, kind: 'export' })) }}
              disabled={filtered.length === 0}
              className="btn btn-ghost btn-sm btn-icon"
              aria-label="导出" title="导出"
            >
              <Download size={14} />
            </button>
            <Magnetic>
              <button
                onClick={() => setCreating(true)}
                className="btn btn-primary btn-sm btn-icon shine"
                aria-label="新增论文" title="新增论文"
              >
                <Plus size={15} />
              </button>
            </Magnetic>
          </>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-6">
        {/* 左栏：状态 */}
        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1.5 sm:flex-wrap sm:overflow-visible sm:pb-0 xl:flex-col xl:gap-1">
            {(['all', ...STATUS_ORDER] as const).map((k) => {
              const on = status === k
              return (
                <button
                  key={k}
                  onClick={() => setStatus(k)}
                  className={cn(
                    'relative inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors duration-200 xl:w-full xl:justify-between xl:rounded-xl xl:px-2.5',
                    on ? 'border-indigo-300/25 text-slate-900' : 'border-slate-900/7 bg-slate-900/2 text-slate-600 hover:border-indigo-300/20 hover:text-slate-900/85',
                  )}
                >
                  {on && (
                    <motion.span
                      layoutId="papers-status-chip"
                      className="absolute inset-0 rounded-full bg-[var(--grad-soft)] shadow-[0_0_18px_-6px_rgb(129_140_248/0.7)] xl:rounded-xl"
                      transition={{ duration: 0.32, ease: EASE }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    {k !== 'all' && <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[k], boxShadow: `0 0 8px ${DOT[k]}` }} />}
                    {k === 'all' ? '全部' : STATUSES[k].label}
                  </span>
                  <span className={cn('num relative', on ? 'text-slate-900/60' : 'text-slate-500')}>{counts[k] ?? 0}</span>
                </button>
              )
            })}
          </div>

          {/* 状态分布 */}
          {base.length > 0 && (
            <div className="liquid mt-3 hidden rounded-xl p-3 xl:block">
              <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-900/5">
                {STATUS_ORDER.map((s) => (
                  <motion.span
                    key={s}
                    className="h-full"
                    style={{ background: DOT[s] }}
                    initial={{ width: 0 }}
                    animate={{ width: `${((counts[s] ?? 0) / base.length) * 100}%` }}
                    transition={{ duration: 0.6, ease: EASE }}
                    title={`${STATUSES[s].label} ${counts[s] ?? 0}`}
                  />
                ))}
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1" title="附件"><Paperclip size={11} /><span className="num">{base.reduce((n, p) => n + p.attachments.length, 0)}</span></span>
                <span className="flex items-center gap-1" title="已发表"><Check size={11} className="text-emerald-600" /><span className="num">{Math.round(((counts.published ?? 0) / base.length) * 100)}%</span></span>
              </div>
            </div>
          )}
        </aside>

        {/* 右栏 */}
        <div className="min-w-0">
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="搜索" />
            <select value={type} onChange={(e) => setType(e.target.value)} className="field w-auto min-w-[84px] py-[7px] text-[13px]" aria-label="类型">
              <option value="all">类型</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              <option value="none">∅</option>
            </select>
            {years.length > 0 && (
              <select value={year} onChange={(e) => setYear(e.target.value)} className="field num w-auto min-w-[84px] py-[7px] text-[13px]" aria-label="年份">
                <option value="all">年份</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            <AnimatePresence initial={false}>
              {filtering && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  onClick={resetFilters}
                  className="btn btn-ghost btn-sm btn-icon"
                  aria-label="重置筛选" title="重置筛选"
                >
                  <FilterX size={14} />
                </motion.button>
              )}
            </AnimatePresence>
            <span className="num ml-auto pr-1.5 text-[12px] text-slate-500">{filtered.length} / {items.length}</span>
          </Toolbar>

          {filtered.length === 0 ? (
            <div className="liquid rounded-2xl">
              <EmptyState
                icon={<BookOpen size={30} />}
                action={items.length === 0
                  ? <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm btn-icon shine" aria-label="新增论文" title="新增论文"><Plus size={14} /></button>
                  : <button onClick={resetFilters} className="btn btn-sm btn-icon" aria-label="重置筛选" title="重置筛选"><FilterX size={14} /></button>}
              />
            </div>
          ) : (
            <>
              <AdminTable
                className="hidden md:block"
                head={
                  <>
                    <Th className="w-10"><Checkbox checked={sel.allChecked} indeterminate={sel.someChecked} onChange={sel.toggleAll} /></Th>
                    <SortTh k="title" sort={sort} onSort={toggleSort}>标题</SortTh>
                    <SortTh k="venue" sort={sort} onSort={toggleSort} className="hidden 2xl:table-cell">发表处</SortTh>
                    <SortTh k="status" sort={sort} onSort={toggleSort}>状态</SortTh>
                    <SortTh k="pubDate" sort={sort} onSort={toggleSort}>时间</SortTh>
                    <SortTh k="atts" sort={sort} onSort={toggleSort} align="right"><Paperclip size={11} aria-label="附件" /></SortTh>
                    <Th className="w-[104px]" />
                  </>
                }
              >
                {filtered.map((p) => <PaperRow key={p.id} {...rowProps(p)} />)}
              </AdminTable>

              {/* 窄屏：卡片 */}
              <div className="space-y-2.5 md:hidden">
                {filtered.map((p, i) => <PaperCard key={p.id} index={i} {...rowProps(p)} />)}
              </div>
            </>
          )}
        </div>
      </div>

      <BulkBar count={sel.selected.size} onClear={sel.clear}>
        <button
          onClick={(e) => openStatus(e.currentTarget, [...sel.selected])}
          disabled={pending}
          className="btn btn-ghost btn-sm btn-icon"
          aria-label="改状态" title="改状态"
        >
          <CircleDot size={14} />
        </button>
        <button onClick={() => exportBib(picked)} className="btn btn-ghost btn-sm btn-icon" aria-label="导出 BibTeX" title="BibTeX">
          <Quote size={14} />
        </button>
        <button onClick={() => exportCsv(picked)} className="btn btn-ghost btn-sm btn-icon" aria-label="导出 CSV" title="CSV">
          <FileSpreadsheet size={14} />
        </button>
        <ArmButton onFire={() => removeMany([...sel.selected])} disabled={pending} />
      </BulkBar>

      <Popover anchor={pop?.el ?? null} onClose={() => setPop(null)}>
        {pop?.kind === 'status' && (
          <div className="p-1.5">
            {pop.ids.length > 1 && <p className="label px-2 pb-1 pt-1"><span className="num">× {pop.ids.length}</span></p>}
            {STATUS_ORDER.map((s, i) => (
              <button
                key={s}
                onClick={() => (s === pop.current ? setPop(null) : changeStatus(pop.ids, s))}
                className={cn(
                  'flex min-h-10 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-slate-900/7',
                  pop.current === s && 'bg-[var(--grad-soft)]',
                )}
              >
                <StatusBadge status={s} />
                {pop.current === s && <Check size={12} className="text-sky-600" />}
                <span className="kbd ml-auto">{i + 1}</span>
              </button>
            ))}
          </div>
        )}
        {pop?.kind === 'export' && (
          <div className="p-1.5">
            <p className="label flex items-center gap-1.5 px-2 pb-1 pt-1">
              {filtering && <Filter size={10} />}
              <span className="num">{filtered.length}</span>
            </p>
            <MenuItem icon={<Quote size={13} />} onClick={() => { setPop(null); exportBib(filtered) }}>BibTeX</MenuItem>
            <MenuItem icon={<FileSpreadsheet size={13} />} onClick={() => { setPop(null); exportCsv(filtered) }}>CSV</MenuItem>
          </div>
        )}
      </Popover>

      <PaperEditor open={creating || !!editing} item={editing} onClose={closeEditor} />

      {pop?.kind === 'status' && <StatusKeys onPick={(s) => changeStatus(pop.ids, s)} />}
    </div>
  )
}

/* ---------- 行 ---------- */

type RowProps = {
  p: PaperItem; selected: boolean; onToggle: () => void; onEdit: () => void
  onStatus: (el: HTMLElement) => void; onDelete: () => void
}

function hasPdfOf(p: PaperItem) {
  return p.attachments.some((a) => fileKind(a.file?.mime ?? '', a.file?.originalName ?? '') === 'pdf')
}

function StatusButton({ status, onStatus, className }: { status: string; onStatus: (el: HTMLElement) => void; className?: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onStatus(e.currentTarget) }}
      className={cn('group/s inline-flex items-center gap-0.5 rounded-full outline-none transition-transform active:scale-95', className)}
      aria-label="改状态" title="改状态"
    >
      <StatusBadge status={status} />
      <ChevronDown size={11} className="text-slate-900/40 transition-colors group-hover/s:text-sky-600" />
    </button>
  )
}

function AttCount({ p }: { p: PaperItem }) {
  return p.attachments.length > 0 ? (
    <span className="inline-flex items-center gap-1 text-[12px] text-slate-900/50">
      {hasPdfOf(p) ? <FileText size={11} className="text-violet-600" /> : <Paperclip size={11} className="text-slate-900/40" />}
      <span className="num">{p.attachments.length}</span>
    </span>
  ) : <span className="num text-[12px] text-slate-900/40">0</span>
}

function PaperRow({ p, selected, onToggle, onEdit, onStatus, onDelete }: RowProps) {
  return (
    <Tr selected={selected} onClick={onEdit} className="cursor-pointer">
      <Td className="w-10"><Checkbox checked={selected} onChange={onToggle} /></Td>

      <Td className="max-w-[300px] xl:max-w-[340px] 2xl:max-w-[380px]">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-slate-900/88 transition-colors group-hover:text-slate-900" title={p.title}>{p.title}</span>
          {p.url && <OpenLink url={p.url} />}
        </div>
        {(!!p.authors?.length || p.venue) && (
          <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
            {p.authors?.join(' · ')}
            {p.venue && <span className="2xl:hidden">{p.authors?.length ? ' — ' : ''}<span className="text-slate-900/45">{p.venue}</span></span>}
          </p>
        )}
      </Td>

      <Td className="hidden max-w-[200px] 2xl:table-cell">
        <p className="truncate text-[12.5px] text-slate-900/60" title={p.venue ?? undefined}>{p.venue || <span className="text-slate-900/40">—</span>}</p>
        {(p.level || p.type) && (
          <p className="mt-0.5 flex items-center gap-2 text-[10.5px]">
            {p.type && <span className="text-slate-500">{TYPE_LABEL[p.type] ?? p.type}</span>}
            {p.level && <span className="text-amber-700">{p.level}</span>}
          </p>
        )}
      </Td>

      <Td><StatusButton status={p.status} onStatus={onStatus} /></Td>

      <Td className="num whitespace-nowrap text-[12px] text-slate-900/45">
        {p.pubDate || <span className="text-slate-900/40">—</span>}
      </Td>

      <Td className="text-right"><AttCount p={p} /></Td>

      <Td className="whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
          {p.doi && <CopyDoi doi={p.doi} />}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="btn btn-ghost btn-sm btn-icon h-8 w-8 p-0" aria-label="编辑" title="编辑"
          >
            <Pencil size={12} />
          </button>
          <ArmButton onFire={onDelete} />
        </div>
      </Td>
    </Tr>
  )
}

function PaperCard({ p, selected, onToggle, onEdit, onStatus, onDelete, index }: RowProps & { index: number }) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: EASE, delay: Math.min(index, 8) * 0.03 }}
      className={cn(
        'liquid liquid-hover overflow-hidden rounded-2xl',
        selected && 'bg-indigo-400/[0.07] ring-1 ring-indigo-400/35',
      )}
    >
      <div className="flex gap-2.5 p-3" onClick={onEdit}>
        <span className="-m-2 flex shrink-0 self-start p-2" onClick={(e) => { e.stopPropagation(); onToggle() }}>
          <Checkbox checked={selected} onChange={onToggle} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13.5px] leading-snug text-slate-900/88">{p.title}</p>
          {!!p.authors?.length && <p className="mt-1 truncate text-[11.5px] text-slate-500">{p.authors.join(' · ')}</p>}
          {p.venue && <p className="mt-0.5 truncate text-[11.5px] text-slate-900/45">{p.venue}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-slate-900/6 px-2 py-1.5">
        <StatusButton status={p.status} onStatus={onStatus} className="min-h-10 px-1" />
        <span className="num ml-1 text-[11.5px] text-slate-900/40">{p.pubDate}</span>
        <span className="ml-auto mr-1"><AttCount p={p} /></span>
        {p.url && <OpenLink url={p.url} large />}
        {p.doi && <CopyDoi doi={p.doi} large />}
        <button onClick={onEdit} className="btn btn-ghost h-10 w-10 p-0" aria-label="编辑" title="编辑">
          <Pencil size={14} />
        </button>
        <ArmButton onFire={onDelete} large />
      </div>
    </motion.div>
  )
}

function OpenLink({ url, large }: { url: string; large?: boolean }) {
  return (
    <a
      href={url} target="_blank" rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg text-slate-900/40 transition-colors hover:text-sky-600',
        large ? 'h-10 w-10' : 'p-0.5',
      )}
      aria-label="原文" title="原文"
    >
      <ExternalLink size={large ? 14 : 12} />
    </a>
  )
}

function SortTh({ k, sort, onSort, children, className, align }: {
  k: SortKey; sort: { key: SortKey; asc: boolean }; onSort: (k: SortKey) => void
  children: React.ReactNode; className?: string; align?: 'right'
}) {
  const active = sort.key === k
  const Icon = !active ? ChevronsUpDown : sort.asc ? ArrowUp : ArrowDown
  return (
    <Th className={cn(align === 'right' && 'text-right', className)} aria-sort={active ? (sort.asc ? 'ascending' : 'descending') : undefined}>
      <button
        onClick={() => onSort(k)}
        className={cn('inline-flex items-center gap-1 uppercase tracking-[inherit] transition-colors',
          active ? 'text-sky-600' : 'hover:text-slate-900/65')}
      >
        {children}
        <Icon size={10} className={active ? 'text-sky-600' : 'opacity-40'} />
      </button>
    </Th>
  )
}

function CopyDoi({ doi, large }: { doi: string; large?: boolean }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), 1400)
    return () => clearTimeout(t)
  }, [done])
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation()
        try { await navigator.clipboard.writeText(doi); setDone(true) } catch { /* 剪贴板不可用时静默 */ }
      }}
      className={cn('btn btn-ghost p-0', large ? 'h-10 w-10' : 'btn-sm btn-icon h-8 w-8')}
      aria-label={`复制 DOI ${doi}`}
      title={`DOI ⧉ ${doi}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={done ? 'y' : 'n'}
          initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="flex"
        >
          {done ? <Check size={large ? 14 : 12} className="text-emerald-600" /> : <Copy size={large ? 14 : 12} />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

/** 两次点击确认的危险按钮 */
function ArmButton({ onFire, disabled, large }: { onFire: () => void; disabled?: boolean; large?: boolean }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 2600)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        if (armed) { setArmed(false); onFire() } else setArmed(true)
      }}
      className={cn(
        'btn btn-danger p-0',
        large ? 'h-10 w-10' : 'btn-sm btn-icon h-8 w-8',
        armed ? 'border-rose-400/45 bg-rose-500/20 text-rose-600 shadow-[0_0_18px_-4px_rgb(244_63_94/0.7)]' : 'btn-ghost',
      )}
      aria-label={armed ? '确认删除' : '删除'}
      title={armed ? '删除？' : '删除'}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={armed ? 'y' : 'n'}
          initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="flex"
        >
          {armed ? <Check size={large ? 15 : 13} strokeWidth={2.6} /> : <Trash2 size={large ? 14 : 12} />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

function MenuItem({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[13px] text-slate-900/75 transition-colors hover:bg-slate-900/7 hover:text-slate-900">
      <span className="text-indigo-500">{icon}</span>
      {children}
    </button>
  )
}

/** 状态菜单打开时 1–4 直接选 */
function StatusKeys({ onPick }: { onPick: (s: Status) => void }) {
  const ref = useRef(onPick)
  ref.current = onPick
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const s = STATUS_ORDER[Number(e.key) - 1]
      if (s && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); ref.current(s) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  return null
}

/* ---------- 浮层：fixed 定位挂到 body，避免被表格 overflow 裁掉 ---------- */

function Popover({ anchor, onClose, children, width = 196 }: {
  anchor: HTMLElement | null; onClose: () => void; children: React.ReactNode; width?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState<React.CSSProperties>({})

  useEffect(() => setMounted(true), [])

  useLayoutEffect(() => {
    if (!anchor) return
    const r = anchor.getBoundingClientRect()
    const up = r.bottom + 220 > window.innerHeight
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    })

    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (box.current?.contains(t) || anchor.contains(t)) return
      close.current()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    const off = () => close.current()
    window.addEventListener('pointerdown', down)
    window.addEventListener('keydown', key)
    window.addEventListener('scroll', off, true)
    window.addEventListener('resize', off)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', key)
      window.removeEventListener('scroll', off, true)
      window.removeEventListener('resize', off)
    }
  }, [anchor, width])

  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {anchor && (
        <motion.div
          ref={box}
          key="pop"
          style={{ position: 'fixed', ...pos }}
          initial={{ opacity: 0, y: -4, scale: 0.97, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.97, filter: 'blur(4px)' }}
          transition={{ duration: 0.2, ease: EASE }}
          className="liquid-strong z-[65] overflow-hidden rounded-2xl shadow-[0_18px_50px_-12px_rgb(40_70_160/0.45)]"
        >
          <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/60 to-transparent" />
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ---------- 导出 ---------- */

function stamp() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function save(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportBib(list: PaperItem[]) {
  if (!list.length) return
  save(`papers-${stamp()}.bib`, buildBibtex(list) + '\n', 'application/x-bibtex;charset=utf-8')
}

function csvCell(v: unknown) {
  let s = v == null ? '' : String(v)
  if (/^[=+@\t]/.test(s)) s = `'${s}` // 防 Excel 公式注入
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function exportCsv(list: PaperItem[]) {
  if (!list.length) return
  const head = ['标题', '作者', '发表处', '类型', '状态', '级别', '时间', 'DOI', '链接', '附件数', '摘要']
  const rows = list.map((p) => [
    p.title,
    (p.authors ?? []).join('; '),
    p.venue,
    p.type ? TYPE_LABEL[p.type] ?? p.type : '',
    STATUSES[p.status as Status]?.label ?? p.status,
    p.level,
    p.pubDate,
    p.doi,
    p.url,
    p.attachments.length,
    p.abstract,
  ])
  const body = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
  save(`papers-${stamp()}.csv`, '\uFEFF' + body, 'text/csv;charset=utf-8')
}
