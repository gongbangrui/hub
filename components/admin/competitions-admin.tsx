'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trophy, Plus, Pencil, Trash2, Download, Paperclip, ChevronDown, ArrowUp, ArrowDown,
  ArrowUpDown, FileText, ZoomIn, Users, Award, FilterX, FileDown, CalendarDays, Check,
} from 'lucide-react'
import type { Category } from '@/db/schema'
import { cn, formatBytes, fileKind } from '@/lib/utils'
import { EmptyState, LevelBadge, LEVELS } from '@/components/ui/primitives'
import { PageTitle, Magnetic, EASE } from '@/components/ui/fx'
import { fileUrl } from '@/lib/file-url'
import { CompetitionEditor } from '@/components/public/competition-editor'
import { Lightbox, type CompItem } from '@/components/public/competitions-view'
import {
  Toolbar, SearchInput, Checkbox, useSelection, BulkBar,
  AdminTable, Th, Td, Tr, api, useMutate, toast,
} from '@/components/admin/ui'

type LevelKey = keyof typeof LEVELS
type SortKey = 'date' | 'name' | 'level'

const WEIGHT: Record<string, number> = { international: 4, national: 3, province: 2, school: 1 }

export function CompetitionsAdmin({ items, categories, startNew }: {
  items: CompItem[]; categories: Category[]; startNew?: boolean
}) {
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<LevelKey | 'none' | 'all'>('all')
  const [year, setYear] = useState('all')
  const [cat, setCat] = useState('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [expanded, setExpanded] = useState<number | null>(null)
  const [editing, setEditing] = useState<CompItem | null>(null)
  const [creating, setCreating] = useState(false)
  const { run, pending } = useMutate()

  // ?new=1 直接打开新增
  useEffect(() => {
    if (!startNew) return
    setCreating(true)
    const url = new URL(window.location.href)
    url.searchParams.delete('new')
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [startNew])

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const years = useMemo(
    () => [...new Set(items.map(yearOf).filter(Boolean))].sort((a, b) => Number(b) - Number(a)),
    [items],
  )

  const counts = useMemo(() => {
    const m: Record<string, number> = { none: 0 }
    for (const c of items) {
      const k = c.level && c.level in LEVELS ? c.level : 'none'
      m[k] = (m[k] ?? 0) + 1
    }
    return m
  }, [items])

  const stats = useMemo(() => {
    const y = String(new Date().getFullYear())
    let atts = 0, awarded = 0, thisYear = 0
    for (const c of items) {
      atts += c.attachments.length
      if (c.result) awarded++
      if (yearOf(c) === y) thisYear++
    }
    return { atts, awarded, thisYear }
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = items.filter((c) => {
      if (level === 'none' ? c.level && c.level in LEVELS : level !== 'all' && c.level !== level) return false
      if (year !== 'all' && yearOf(c) !== year) return false
      if (cat === 'none' ? c.categoryId && catName.has(c.categoryId) : cat !== 'all' && String(c.categoryId) !== cat) return false
      if (!q) return true
      return [c.name, c.result, c.team, c.description, c.categoryId ? catName.get(c.categoryId)?.name : '']
        .some((s) => (s ?? '').toLowerCase().includes(q))
    })
    const d = sort.dir === 'asc' ? 1 : -1
    return list.sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name, 'zh-CN') * d
      if (sort.key === 'level') return ((WEIGHT[a.level ?? ''] ?? 0) - (WEIGHT[b.level ?? ''] ?? 0)) * d || cmpDate(a, b, -1)
      return cmpDate(a, b, d)
    })
  }, [items, query, level, year, cat, sort, catName])

  const sel = useSelection(filtered)
  const filtering = !!query || level !== 'all' || year !== 'all' || cat !== 'all'

  function resetFilters() {
    setQuery(''); setLevel('all'); setYear('all'); setCat('all')
  }

  function toggleSort(key: SortKey) {
    setSort((s) => s.key === key
      ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'name' ? 'asc' : 'desc' })
  }

  const ids = () => [...sel.selected]

  async function bulkPatch(body: Record<string, unknown>, msg: string) {
    const list = ids()
    await run(() => Promise.all(list.map((id) => api(`/api/competitions/${id}`, { method: 'PATCH', body }))), msg)
  }

  async function bulkDelete() {
    const list = ids()
    const r = await run(() => Promise.all(list.map((id) => api(`/api/competitions/${id}`, { method: 'DELETE' }))), `已删除 ${list.length}`)
    if (r) sel.clear()
  }

  function removeOne(id: number) {
    return run(() => api(`/api/competitions/${id}`, { method: 'DELETE' }), '✓')
  }

  function exportCsv(list: CompItem[]) {
    if (!list.length) return toast('∅', 'info')
    const head = ['名称', '等级', '分类', '开始', '结束', '结果', '团队', '说明', '材料数']
    const rows = list.map((c) => [
      c.name,
      c.level && c.level in LEVELS ? LEVELS[c.level as LevelKey].label : '',
      c.categoryId ? catName.get(c.categoryId)?.name ?? '' : '',
      c.dateStart ?? '', c.dateEnd ?? '', c.result ?? '', c.team ?? '', c.description ?? '',
      String(c.attachments.length),
    ])
    const csv = '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `competitions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast(`✓ ${list.length}`)
  }

  const chips: { key: LevelKey | 'none' | 'all'; label: string; n: number; dot?: string }[] = [
    { key: 'all', label: '全部', n: items.length },
    ...(Object.keys(LEVELS) as LevelKey[]).slice().reverse().map((k) => ({
      key: k, label: LEVELS[k].label, n: counts[k] ?? 0, dot: LEVELS[k].dot as string,
    })),
    ...(counts.none > 0 ? [{ key: 'none' as const, label: '未标', n: counts.none, dot: '#4b5563' }] : []),
  ]

  return (
    <div>
      <PageTitle
        icon={<Trophy size={20} />}
        title="竞赛"
        count={items.length}
        right={
          <>
            <button
              onClick={() => exportCsv(filtered)}
              className="btn btn-ghost btn-sm btn-icon"
              aria-label="导出 CSV" title="导出 CSV"
            >
              <FileDown size={14} />
            </button>
            <Magnetic>
              <button
                onClick={() => setCreating(true)}
                className="btn btn-primary btn-sm btn-icon shine"
                aria-label="新增竞赛" title="新增竞赛"
              >
                <Plus size={15} />
              </button>
            </Magnetic>
          </>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-6">
        {/* 左栏：等级 / 统计 */}
        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1.5 sm:flex-wrap sm:overflow-visible sm:pb-0 xl:flex-col xl:gap-1">
            {chips.map((c) => (
              <LevelChip
                key={c.key}
                active={level === c.key}
                onClick={() => setLevel(level === c.key && c.key !== 'all' ? 'all' : c.key)}
                label={c.label}
                n={c.n}
                dot={c.dot}
              />
            ))}
          </div>

          <div className="mt-3 hidden gap-2 xl:grid">
            <Mini icon={<Paperclip size={13} />} value={stats.atts} label="材料" />
            <Mini icon={<Award size={13} />} value={stats.awarded} label="获奖" />
            <Mini icon={<CalendarDays size={13} />} value={stats.thisYear} label="今年" />
          </div>
        </aside>

        {/* 右栏：工具条 + 列表 */}
        <div className="min-w-0">
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder="搜索" />
            <select value={year} onChange={(e) => setYear(e.target.value)} className="field num w-auto min-w-[84px] py-[7px] text-[13px]">
              <option value="all">年份</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="field w-auto min-w-[88px] py-[7px] text-[13px]">
              <option value="all">分类</option>
              <option value="none">∅</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
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
            <span className="num ml-auto pr-1.5 text-[12px] text-indigo-100/35">{filtered.length} / {items.length}</span>
          </Toolbar>

          {filtered.length === 0 ? (
            <div className="liquid rounded-2xl">
              <EmptyState
                icon={<Trophy size={30} />}
                action={items.length === 0
                  ? <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm btn-icon shine" aria-label="新增竞赛" title="新增竞赛"><Plus size={14} /></button>
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
                    <Th className="w-12" />
                    <SortTh label="名称" k="name" sort={sort} onSort={toggleSort} />
                    <SortTh label="等级" k="level" sort={sort} onSort={toggleSort} />
                    <Th className="hidden 2xl:table-cell">分类</Th>
                    <SortTh label="时间" k="date" sort={sort} onSort={toggleSort} />
                    <Th className="hidden 2xl:table-cell">结果</Th>
                    <Th className="text-right">材料</Th>
                    <Th className="w-[84px]" />
                  </>
                }
              >
                {filtered.map((c) => {
                  const open = expanded === c.id
                  const cover = imagesOf(c)[0]?.file
                  const category = c.categoryId ? catName.get(c.categoryId) : undefined
                  return (
                    <Fragment key={c.id}>
                      <Tr
                        selected={sel.selected.has(c.id)}
                        onClick={() => setExpanded(open ? null : c.id)}
                        className="cursor-pointer"
                      >
                        <Td><Checkbox checked={sel.selected.has(c.id)} onChange={() => sel.toggle(c.id)} /></Td>
                        <Td className="py-2">
                          {cover ? (
                            <img src={fileUrl(cover, true)} alt="" loading="lazy"
                                 className="h-9 w-9 rounded-lg border border-white/[0.08] object-cover" />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.035]">
                              <Trophy size={13} className="text-indigo-200/25" />
                            </span>
                          )}
                        </Td>
                        <Td className="max-w-[220px] 2xl:max-w-[320px]">
                          <div className="flex items-center gap-1.5">
                            <ChevronDown
                              size={13}
                              className={cn('shrink-0 text-white/25 transition-transform duration-300', open && 'rotate-180 text-sky-300')}
                            />
                            <span className="truncate text-white/88" title={c.name}>{c.name}</span>
                          </div>
                        </Td>
                        <Td>{c.level && c.level in LEVELS ? <LevelBadge level={c.level} /> : <span className="text-white/20">—</span>}</Td>
                        <Td className="hidden 2xl:table-cell">
                          {category ? (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-white/60">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: category.color || '#64748b' }} />
                              {category.name}
                            </span>
                          ) : <span className="text-white/20">—</span>}
                        </Td>
                        <Td className="num whitespace-nowrap text-[12px] text-white/50">{dateRange(c) ?? <span className="text-white/20">—</span>}</Td>
                        <Td className="hidden max-w-[180px] truncate text-[12.5px] text-amber-200/75 2xl:table-cell">
                          {c.result || <span className="text-white/20">—</span>}
                        </Td>
                        <Td className="text-right">
                          <span className={cn('num inline-flex items-center gap-1 text-[12px]', c.attachments.length ? 'text-white/60' : 'text-white/20')}>
                            <Paperclip size={11} />{c.attachments.length}
                          </span>
                        </Td>
                        <Td>
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditing(c) }}
                              className="btn btn-ghost btn-sm btn-icon h-8 w-8 p-0" aria-label="编辑" title="编辑"
                            >
                              <Pencil size={12} />
                            </button>
                            <ArmedDelete onConfirm={() => removeOne(c.id)} />
                          </div>
                        </Td>
                      </Tr>
                      <AnimatePresence initial={false}>
                        {open && (
                          <tr key={`x-${c.id}`} className="!border-t-0">
                            <td colSpan={9} className="p-0">
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.32, ease: EASE }}
                                className="overflow-hidden"
                              >
                                <Preview c={c} category={category?.name} onEdit={() => setEditing(c)} pad="indent" />
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </Fragment>
                  )
                })}
              </AdminTable>

              {/* 窄屏：卡片流 */}
              <div className="space-y-2.5 md:hidden">
                {filtered.map((c, i) => {
                  const open = expanded === c.id
                  const cover = imagesOf(c)[0]?.file
                  const category = c.categoryId ? catName.get(c.categoryId) : undefined
                  return (
                    <motion.div
                      key={c.id}
                      layout="position"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.38, ease: EASE, delay: Math.min(i, 8) * 0.03 }}
                      className={cn(
                        'liquid liquid-hover overflow-hidden rounded-2xl',
                        sel.selected.has(c.id) && 'bg-indigo-400/[0.07] ring-1 ring-indigo-400/35',
                      )}
                    >
                      <div className="flex items-center gap-2.5 p-3" onClick={() => setExpanded(open ? null : c.id)}>
                        <span
                          className="-m-2 flex shrink-0 p-2"
                          onClick={(e) => { e.stopPropagation(); sel.toggle(c.id) }}
                        >
                          <Checkbox checked={sel.selected.has(c.id)} onChange={() => sel.toggle(c.id)} />
                        </span>
                        {cover ? (
                          <img src={fileUrl(cover, true)} alt="" loading="lazy"
                               className="h-10 w-10 shrink-0 rounded-xl border border-white/[0.08] object-cover" />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035]">
                            <Trophy size={14} className="text-indigo-200/25" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] text-white/88">{c.name}</p>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-white/40">
                            {c.level && c.level in LEVELS && <LevelBadge level={c.level} />}
                            <span className="num">{dateRange(c)}</span>
                            {c.result && <span className="truncate text-amber-200/70">{c.result}</span>}
                          </div>
                        </div>
                        <ChevronDown size={15} className={cn('shrink-0 text-white/25 transition-transform duration-300', open && 'rotate-180 text-sky-300')} />
                      </div>

                      <div className="flex items-center justify-end gap-1 border-t border-white/[0.06] px-2 py-1.5">
                        <span className={cn('num mr-auto flex items-center gap-1 pl-1.5 text-[11.5px]', c.attachments.length ? 'text-white/50' : 'text-white/20')}>
                          <Paperclip size={11} />{c.attachments.length}
                        </span>
                        <button
                          onClick={() => setEditing(c)}
                          className="btn btn-ghost h-10 w-10 p-0" aria-label="编辑" title="编辑"
                        >
                          <Pencil size={14} />
                        </button>
                        <ArmedDelete onConfirm={() => removeOne(c.id)} iconLg />
                      </div>

                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.32, ease: EASE }}
                            className="overflow-hidden"
                          >
                            <Preview c={c} category={category?.name} onEdit={() => setEditing(c)} pad="flush" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <BulkBar count={sel.selected.size} onClear={sel.clear}>
        <select
          value=""
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            const lv = v === '_' ? null : v
            bulkPatch({ level: lv }, lv ? `✓ ${LEVELS[lv as LevelKey].label}` : '✓ ∅')
          }}
          className="field w-auto py-[5px] text-[12.5px]"
          aria-label="批量等级"
        >
          <option value="">等级</option>
          {(Object.keys(LEVELS) as LevelKey[]).map((k) => <option key={k} value={k}>{LEVELS[k].label}</option>)}
          <option value="_">∅</option>
        </select>
        {categories.length > 0 && (
          <select
            value=""
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value
              if (!v) return
              const id = v === '_' ? null : Number(v)
              bulkPatch({ categoryId: id }, id ? `✓ ${catName.get(id)?.name ?? ''}` : '✓ ∅')
            }}
            className="field w-auto py-[5px] text-[12.5px]"
            aria-label="批量分类"
          >
            <option value="">分类</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="_">∅</option>
          </select>
        )}
        <button
          onClick={() => exportCsv(filtered.filter((c) => sel.selected.has(c.id)))}
          className="btn btn-ghost btn-sm btn-icon"
          aria-label="导出所选 CSV" title="导出所选 CSV"
        >
          <Download size={14} />
        </button>
        <ArmedDelete disabled={pending} onConfirm={bulkDelete} />
      </BulkBar>

      <CompetitionEditor
        open={creating || !!editing}
        item={editing}
        categories={categories}
        onClose={() => { setCreating(false); setEditing(null) }}
      />
    </div>
  )
}

/* ---------------- 行内预览 ---------------- */

function Preview({ c, category, onEdit, pad = 'indent' }: {
  c: CompItem; category?: string; onEdit: () => void; pad?: 'indent' | 'flush'
}) {
  const [lightbox, setLightbox] = useState<number | null>(null)
  const images = imagesOf(c)
  const others = c.attachments.filter((a) => fileKind(a.file?.mime ?? '', a.file?.originalName ?? '') !== 'image')

  return (
    <div className={cn(
      'border-t border-white/[0.06] bg-gradient-to-b from-sky-400/[0.045] via-indigo-400/[0.02] to-transparent py-4',
      pad === 'indent' ? 'px-4 pl-[68px]' : 'px-3',
    )}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-indigo-100/45">
        {c.result && <span className="flex items-center gap-1 text-amber-200/75"><Award size={11} />{c.result}</span>}
        {c.team && <span className="flex items-center gap-1"><Users size={11} />{c.team}</span>}
        {category && <span className="flex items-center gap-1"><span className="text-indigo-300/60">#</span>{category}</span>}
        <button onClick={onEdit} className="btn btn-ghost btn-sm btn-icon ml-auto" aria-label="编辑" title="编辑">
          <Pencil size={12} />
        </button>
      </div>

      {c.description && (
        <p className="mt-2 line-clamp-3 max-w-3xl whitespace-pre-wrap text-[12.5px] leading-relaxed text-white/50">{c.description}</p>
      )}

      {c.attachments.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-indigo-100/25">∅</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((a, i) => (
            <motion.button
              key={a.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 8) * 0.03 }}
              onClick={() => setLightbox(i)}
              className="group relative h-20 w-28 overflow-hidden rounded-xl border border-white/[0.08]"
              aria-label="查看图片"
            >
              <img src={fileUrl(a.file!, true)} alt={a.caption ?? ''} loading="lazy"
                   className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.07]" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                <ZoomIn size={14} className="text-white/85" />
              </span>
            </motion.button>
          ))}
          {others.map((a) => (
            <a
              key={a.id}
              href={fileUrl(a.file!)}
              className="liquid liquid-hover spotlight flex h-20 w-44 flex-col justify-between rounded-xl p-2.5"
            >
              <span className="flex items-center gap-1.5 text-indigo-100/45">
                <FileText size={13} />
                <Download size={11} className="ml-auto" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] text-white/75" title={a.file!.originalName}>{a.file!.originalName}</span>
                <span className="num text-[10.5px] text-white/30">{formatBytes(a.file!.size)}</span>
              </span>
            </a>
          ))}
        </div>
      )}

      {/* 表格容器带 backdrop-filter，会困住 fixed 元素，挂到 body */}
      {lightbox !== null && createPortal(
        <Lightbox images={images} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />,
        document.body,
      )}
    </div>
  )
}

/* ---------------- 小组件 ---------------- */

function LevelChip({ active, onClick, label, n, dot }: {
  active: boolean; onClick: () => void; label: string; n: number; dot?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors duration-200 min-h-9 xl:w-full xl:justify-between xl:rounded-xl xl:px-2.5',
        active ? 'border-indigo-300/25 text-white' : 'border-white/[0.07] bg-white/[0.025] text-indigo-100/55 hover:border-indigo-300/20 hover:text-white/85',
      )}
    >
      {active && (
        <motion.span
          layoutId="comp-level-chip"
          className="absolute inset-0 rounded-full bg-[var(--grad-soft)] xl:rounded-xl"
          style={dot ? { boxShadow: `inset 0 0 0 1px ${dot}55, 0 0 16px -4px ${dot}90` } : undefined}
          transition={{ duration: 0.32, ease: EASE }}
        />
      )}
      <span className="relative flex items-center gap-1.5">
        {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot, boxShadow: `0 0 8px ${dot}` }} />}
        {label}
      </span>
      <span className={cn('num relative', active ? 'text-white/60' : 'text-indigo-100/35')}>{n}</span>
    </button>
  )
}

function Mini({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="liquid liquid-hover spotlight flex items-center gap-2 rounded-xl px-3 py-2" title={label}>
      <span className="text-indigo-200/70">{icon}</span>
      <span className="num text-[15px] font-semibold tracking-tight text-white/90">{value}</span>
      <span className="text-[11px] text-indigo-100/45">{label}</span>
    </div>
  )
}

function SortTh({ label, k, sort, onSort }: {
  label: string; k: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; onSort: (k: SortKey) => void
}) {
  const on = sort.key === k
  const Icon = !on ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <Th aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button
        onClick={() => onSort(k)}
        className={cn('inline-flex items-center gap-1 uppercase transition-colors', on ? 'text-sky-200' : 'hover:text-white/70')}
      >
        {label}
        <Icon size={11} className={on ? 'opacity-90' : 'opacity-35'} />
      </button>
    </Th>
  )
}

/** 两步删除：首次点击变红待确认，2.5s 内再点执行 */
function ArmedDelete({ onConfirm, disabled, iconLg }: {
  onConfirm: () => unknown; disabled?: boolean; iconLg?: boolean
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 2500)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <button
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        if (!armed) return setArmed(true)
        setArmed(false)
        onConfirm()
      }}
      className={cn(
        'btn btn-danger p-0',
        iconLg ? 'h-10 w-10' : 'btn-sm btn-icon h-8 w-8 p-0',
        armed ? 'border-rose-400/45 bg-rose-500/20 text-rose-200 shadow-[0_0_18px_-4px_rgb(244_63_94/0.7)]' : 'btn-ghost',
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
          {armed ? <Check size={iconLg ? 15 : 13} strokeWidth={2.6} /> : <Trash2 size={iconLg ? 14 : 12} />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

/* ---------------- 工具函数 ---------------- */

function imagesOf(c: CompItem) {
  return c.attachments.filter((a) => fileKind(a.file?.mime ?? '', a.file?.originalName ?? '') === 'image')
}

function yearOf(c: CompItem) {
  const d = c.dateStart || c.dateEnd
  return d ? String(d).slice(0, 4) : ''
}

/** 无日期永远排最后 */
function cmpDate(a: CompItem, b: CompItem, dir: number) {
  const x = a.dateStart || a.dateEnd || ''
  const y = b.dateStart || b.dateEnd || ''
  if (!x || !y) return x ? -1 : y ? 1 : 0
  return x.localeCompare(y) * dir
}

function dateRange(c: CompItem) {
  if (!c.dateStart && !c.dateEnd) return null
  const fmt = (s: string) => s.replace(/-/g, '.').slice(0, 7)
  if (c.dateStart && c.dateEnd && fmt(c.dateStart) !== fmt(c.dateEnd)) return `${fmt(c.dateStart)} — ${fmt(c.dateEnd)}`
  return fmt(c.dateStart || c.dateEnd || '')
}

function csvCell(v: string) {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
