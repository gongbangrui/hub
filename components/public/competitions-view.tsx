'use client'
import { useEffect, useMemo, useState } from 'react'
import { m as motion, AnimatePresence } from 'framer-motion'
import {
  Trophy, LayoutGrid, GitCommitVertical, Search, Plus, Pencil, Trash2, Calendar, Users, Award,
  ImageIcon, FileText, Download, ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Paperclip,
  RotateCcw, Tag, Layers, ExternalLink, SearchX,
} from 'lucide-react'
import type { Competition, Category, Attachment, FileRow } from '@/db/schema'
import { cn, formatBytes, fileKind } from '@/lib/utils'
import { fileUrl } from '@/lib/file-url'
import { EmptyState, Sheet, LevelBadge, LEVELS } from '@/components/ui/primitives'
import { GradText, PageTitle } from '@/components/ui/page'
import { Masonry } from '@/components/ui/masonry'
import { EASE } from '@/lib/motion'
import { CompetitionEditor } from '@/components/public/competition-editor'
import { useRouter } from 'next/navigation'

export type CompItem = Competition & {
  attachments: (Attachment & { file: FileRow | null })[]
}

type View = 'masonry' | 'timeline'
type LevelKey = keyof typeof LEVELS
const LEVEL_ORDER: LevelKey[] = ['international', 'national', 'province', 'school']
const NO_DATE = '∅'

/* 触屏上始终显示，指针设备上 hover / focus 时显示 */
const HOVER_REVEAL =
  'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100'

export function CompetitionsView({ items, categories, authed }: {
  items: CompItem[]; categories: Category[]; authed: boolean
}) {
  const [view, setView] = useState<View>('masonry')
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<string>('all')
  const [year, setYear] = useState<string>('all')
  const [cat, setCat] = useState<string>('all')
  const [open, setOpen] = useState<CompItem | null>(null)
  const [editing, setEditing] = useState<CompItem | null>(null)
  const [creating, setCreating] = useState(false)
  const router = useRouter()

  const years = useMemo(
    () => [...new Set(items.map(yearOf))].filter(Boolean).sort((a, b) => Number(b) - Number(a)),
    [items],
  )
  const levelCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of items) if (c.level) m[c.level] = (m[c.level] ?? 0) + 1
    return m
  }, [items])
  const usedCats = useMemo(
    () => categories.filter((c) => items.some((i) => i.categoryId === c.id)),
    [categories, items],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((c) => {
      if (level !== 'all' && c.level !== level) return false
      if (year !== 'all' && yearOf(c) !== year) return false
      if (cat !== 'all' && String(c.categoryId ?? '') !== cat) return false
      if (!q) return true
      return [c.name, c.result, c.team, c.description].some((s) => (s ?? '').toLowerCase().includes(q))
    })
  }, [items, query, level, year, cat])

  const grouped = useMemo(() => {
    const map = new Map<string, CompItem[]>()
    for (const c of filtered) {
      const y = yearOf(c) || NO_DATE
      if (!map.has(y)) map.set(y, [])
      map.get(y)!.push(c)
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === NO_DATE) return 1
      if (b[0] === NO_DATE) return -1
      return Number(b[0]) - Number(a[0])
    })
  }, [filtered])

  const dirty = level !== 'all' || year !== 'all' || cat !== 'all' || query.trim() !== ''
  const reset = () => { setLevel('all'); setYear('all'); setCat('all'); setQuery('') }

  async function remove(c: CompItem) {
    if (!confirm(`删除「${c.name}」？`)) return
    const r = await fetch(`/api/competitions/${c.id}`, { method: 'DELETE' })
    if (!r.ok) { alert('删除失败'); return }
    // 用 refresh 而不是整页重载：保住筛选、排序与滚动位置
    router.refresh()
  }

  const filterProps = {
    query, setQuery, level, setLevel, year, setYear, cat, setCat,
    years, levelCounts, cats: usedCats, dirty, reset,
  }
  const cardProps = (c: CompItem) => ({
    c, authed,
    onOpen: () => setOpen(c),
    onEdit: () => setEditing(c),
    onDelete: () => remove(c),
  })

  return (
    <div className="space-y-6 md:space-y-8">
      <PageTitle
        icon={<Trophy size={20} />}
        title="竞赛"
        count={items.length}
        right={
          <>
            <div className="hidden items-center gap-1.5 sm:flex">
              {LEVEL_ORDER.filter((k) => levelCounts[k]).map((k) => (
                <button
                  key={k}
                  onClick={() => setLevel(level === k ? 'all' : k)}
                  data-active={level === k}
                  className="chip min-h-9"
                  title={LEVELS[k].label}
                  aria-label={`${LEVELS[k].label} ${levelCounts[k]}`}
                >
                  <Dot color={LEVELS[k].dot} />
                  <span className="num">{levelCounts[k]}</span>
                </button>
              ))}
            </div>
            <ViewToggle view={view} onChange={setView} />
            {authed && (
              <button onClick={() => setCreating(true)} className="btn btn-primary shine btn-icon h-10 w-10"
                      aria-label="新增" title="新增">
                <Plus size={17} />
              </button>
            )}
          </>
        }
      />

      <div className="split">
        <aside className="sticky-col hidden lg:block">
          <FilterPanel {...filterProps} />
        </aside>

        <div className="lg:hidden">
          <FilterBar {...filterProps} />
        </div>

        <section className="min-w-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={items.length === 0 ? <Trophy size={28} /> : <SearchX size={28} />}
              action={
                items.length === 0
                  ? authed && (
                    <button onClick={() => setCreating(true)} className="btn btn-primary shine" aria-label="新增" title="新增">
                      <Plus size={15} />
                    </button>
                  )
                  : (
                    <button onClick={reset} className="btn btn-ghost" aria-label="重置" title="重置">
                      <RotateCcw size={14} />
                    </button>
                  )
              }
            />
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              {view === 'masonry' ? (
                <motion.div key="masonry" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }}>
                  <Masonry minCol={320}>
                    {filtered.map((c, i) => (
                      <div key={c.id} className="enter" style={{ ['--i' as string]: Math.min(i, 10) }}>
                        <CompCard {...cardProps(c)} />
                      </div>
                    ))}
                  </Masonry>
                </motion.div>
              ) : (
                <motion.div key="timeline" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }}>
                  <Timeline grouped={grouped} cardProps={cardProps} />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </section>
      </div>

      <DetailSheet item={open} onClose={() => setOpen(null)} authed={authed}
                   onEdit={() => { setEditing(open); setOpen(null) }} />

      <CompetitionEditor
        open={creating || !!editing}
        item={editing}
        categories={categories}
        onClose={() => { setCreating(false); setEditing(null) }}
      />
    </div>
  )
}

/* ---------------- helpers ---------------- */

function yearOf(c: CompItem) {
  const d = c.dateStart || c.dateEnd
  return d ? String(d).slice(0, 4) : ''
}

function dateRange(c: CompItem) {
  if (!c.dateStart && !c.dateEnd) return null
  const fmt = (s: string) => s.replace(/-/g, '.').slice(0, 7)
  if (c.dateStart && c.dateEnd && c.dateStart !== c.dateEnd) return `${fmt(c.dateStart)} → ${fmt(c.dateEnd)}`
  return fmt(c.dateStart || c.dateEnd || '')
}

function isImage(a: { file: FileRow | null }) {
  return fileKind(a.file?.mime ?? '', a.file?.originalName ?? '') === 'image'
}

function teamOf(c: CompItem) {
  return (c.team ?? '').split(/[、,，;；/|\s]+/).map((s) => s.trim()).filter(Boolean)
}

function levelDot(level?: string | null) {
  return level && level in LEVELS ? LEVELS[level as LevelKey].dot : '#a5b4fc'
}

function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', className)} style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
}

/* ---------------- 视图切换 ---------------- */

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts = [['masonry', LayoutGrid, '瀑布流'], ['timeline', GitCommitVertical, '时间轴']] as const
  return (
    <div className="liquid flex items-center gap-0.5 rounded-2xl p-1">
      {opts.map(([v, Icon, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-label={label}
          title={label}
          aria-pressed={view === v}
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
            view === v ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900/80',
          )}
        >
          {view === v && (
            <motion.span
              layoutId="comp-view-pill"
              className="absolute inset-0 rounded-xl border border-indigo-300/30"
              style={{ background: 'var(--grad-soft)' }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          <Icon size={16} className="relative" />
        </button>
      ))}
    </div>
  )
}

/* ---------------- 筛选 ---------------- */

type FilterProps = {
  query: string; setQuery: (v: string) => void
  level: string; setLevel: (v: string) => void
  year: string; setYear: (v: string) => void
  cat: string; setCat: (v: string) => void
  years: string[]; levelCounts: Record<string, number>; cats: Category[]
  dirty: boolean; reset: () => void
}

function Pill({ active, onClick, layoutId, children, label, className }: {
  active: boolean; onClick: () => void; layoutId: string; children: React.ReactNode; label?: string; className?: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors',
        active ? 'text-slate-900' : 'text-slate-600 hover:bg-slate-900/5 hover:text-slate-900',
        className,
      )}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-0 rounded-full border border-indigo-300/40 shadow-[0_0_20px_-6px_rgb(129_140_248/0.6)]"
          style={{ background: 'var(--grad-soft)' }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </button>
  )
}

function SearchField({ query, setQuery }: { query: string; setQuery: (v: string) => void }) {
  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索"
        aria-label="搜索"
        className="field h-10 pl-9 pr-9"
      />
      {query && (
        <button onClick={() => setQuery('')} aria-label="清除" title="清除"
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900">
          <X size={13} />
        </button>
      )}
    </div>
  )
}

function FilterPanel(p: FilterProps) {
  const group = (icon: React.ReactNode, title: string, body: React.ReactNode) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-indigo-400" title={title} aria-label={title}>
        {icon}
        <span className="hairline flex-1" />
      </div>
      <div className="flex flex-wrap gap-1">{body}</div>
    </div>
  )

  return (
    <div className="liquid space-y-5 rounded-3xl p-4">
      <SearchField query={p.query} setQuery={p.setQuery} />

      {group(<Layers size={13} />, '等级', (
        <>
          <Pill layoutId="cf-lv" className="h-8" active={p.level === 'all'} onClick={() => p.setLevel('all')}>全部</Pill>
          {LEVEL_ORDER.map((k) => (
            <Pill key={k} layoutId="cf-lv" className="h-8" active={p.level === k} onClick={() => p.setLevel(k)}>
              <Dot color={LEVELS[k].dot} />{LEVELS[k].label}
              <span className="num text-[10.5px] opacity-50">{p.levelCounts[k] ?? 0}</span>
            </Pill>
          ))}
        </>
      ))}

      {p.years.length > 0 && group(<Calendar size={13} />, '年份', (
        <>
          <Pill layoutId="cf-yr" className="h-8" active={p.year === 'all'} onClick={() => p.setYear('all')}>全部</Pill>
          {p.years.map((y) => (
            <Pill key={y} layoutId="cf-yr" className="num h-8" active={p.year === y} onClick={() => p.setYear(y)}>{y}</Pill>
          ))}
        </>
      ))}

      {p.cats.length > 0 && group(<Tag size={13} />, '分类', (
        <>
          <Pill layoutId="cf-ct" className="h-8" active={p.cat === 'all'} onClick={() => p.setCat('all')}>全部</Pill>
          {p.cats.map((c) => (
            <Pill key={c.id} layoutId="cf-ct" className="h-8" active={p.cat === String(c.id)} onClick={() => p.setCat(String(c.id))}>
              {c.name}
            </Pill>
          ))}
        </>
      ))}

      <AnimatePresence>
        {p.dirty && (
          <motion.button
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            onClick={p.reset}
            className="btn btn-ghost btn-sm w-full"
            aria-label="重置"
            title="重置"
          >
            <RotateCcw size={13} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

function FilterBar(p: FilterProps) {
  const sep = <span className="mx-1 h-4 w-px shrink-0 bg-slate-900/10" aria-hidden />
  return (
    <div className="liquid space-y-2 rounded-2xl p-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><SearchField query={p.query} setQuery={p.setQuery} /></div>
        {p.dirty && (
          <button onClick={p.reset} className="btn btn-ghost btn-icon h-10 w-10" aria-label="重置" title="重置">
            <RotateCcw size={14} />
          </button>
        )}
      </div>
      <div className="-mx-2 flex items-center gap-1 overflow-x-auto px-2 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Pill layoutId="cb-lv" className="h-10" active={p.level === 'all'} onClick={() => p.setLevel('all')} label="全部等级">
          <Layers size={13} />
        </Pill>
        {LEVEL_ORDER.map((k) => (
          <Pill key={k} layoutId="cb-lv" className="h-10" active={p.level === k} onClick={() => p.setLevel(k)}>
            <Dot color={LEVELS[k].dot} />{LEVELS[k].label}
          </Pill>
        ))}
        {p.years.length > 0 && (
          <>
            {sep}
            <Pill layoutId="cb-yr" className="h-10" active={p.year === 'all'} onClick={() => p.setYear('all')} label="全部年份">
              <Calendar size={13} />
            </Pill>
            {p.years.map((y) => (
              <Pill key={y} layoutId="cb-yr" className="num h-10" active={p.year === y} onClick={() => p.setYear(y)}>{y}</Pill>
            ))}
          </>
        )}
        {p.cats.length > 0 && (
          <>
            {sep}
            <Pill layoutId="cb-ct" className="h-10" active={p.cat === 'all'} onClick={() => p.setCat('all')} label="全部分类">
              <Tag size={13} />
            </Pill>
            {p.cats.map((c) => (
              <Pill key={c.id} layoutId="cb-ct" className="h-10" active={p.cat === String(c.id)} onClick={() => p.setCat(String(c.id))}>
                {c.name}
              </Pill>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

/* ---------------- 卡片部件 ---------------- */

type CardProps = { c: CompItem; authed: boolean; onOpen: () => void; onEdit: () => void; onDelete: () => void }

function Actions({ onEdit, onDelete, className, overlay }: {
  onEdit: () => void; onDelete: () => void; className?: string; overlay?: boolean
}) {
  const base = overlay
    ? 'flex h-10 w-10 items-center justify-center rounded-xl border border-slate-900/12 bg-white/70 backdrop-blur-md transition-colors'
    : 'btn btn-ghost btn-icon h-10 w-10'
  return (
    <div className={cn('flex items-center gap-1 transition-opacity', HOVER_REVEAL, className)}>
      <button onClick={(e) => { e.stopPropagation(); onEdit() }} aria-label="编辑" title="编辑"
              className={cn(base, overlay && 'hover:border-indigo-300/50 hover:text-slate-900')}>
        <Pencil size={13} />
      </button>
      <button onClick={(e) => { e.stopPropagation(); onDelete() }} aria-label="删除" title="删除"
              className={cn(base, overlay ? 'text-rose-600 hover:border-rose-400/50 hover:bg-rose-500/25' : 'btn-danger')}>
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function TeamRow({ c, max = 4 }: { c: CompItem; max?: number }) {
  const team = teamOf(c)
  if (!team.length) return null
  return (
    <span className="flex items-center gap-1.5" title={c.team ?? ''}>
      <Users size={11} className="shrink-0 text-indigo-400" />
      <span className="flex -space-x-1.5">
        {team.slice(0, max).map((m, i) => (
          <span key={i}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-gradient-to-br from-sky-300/40 via-indigo-400/40 to-purple-400/40 text-[9.5px] font-medium text-slate-900/85">
            {m.slice(0, 1)}
          </span>
        ))}
        {team.length > max && (
          <span className="num flex h-5 min-w-5 items-center justify-center rounded-full border border-white bg-slate-900/10 px-1 text-[9px] text-slate-900/70">
            +{team.length - max}
          </span>
        )}
      </span>
    </span>
  )
}

function openOnKey(fn: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() }
  }
}

/* ---------------- 瀑布流卡片 ---------------- */

function CompCard({ c, authed, onOpen, onEdit, onDelete }: CardProps) {
  const cover = c.attachments.find(isImage)?.file
  const range = dateRange(c)

  return (
    <motion.article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={openOnKey(onOpen)}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="liquid liquid-hover spotlight grad-border group relative cursor-pointer rounded-3xl"
    >
      {cover ? (
        <div className="relative overflow-hidden rounded-t-3xl">
          <img src={fileUrl(cover, true)} alt="" loading="lazy"
               className="block max-h-80 w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-slate-900/10 to-transparent" />
          <div className="absolute left-3 top-3"><LevelBadge level={c.level} className="backdrop-blur-md" /></div>
        </div>
      ) : (
        <div className="relative flex items-center gap-2 px-4 pt-4">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-900/10"
            style={{ background: `radial-gradient(circle at 30% 20%, ${levelDot(c.level)}55, transparent 70%)` }}
          >
            <Trophy size={16} className="text-slate-900/75" />
          </span>
          <LevelBadge level={c.level} />
        </div>
      )}

      <div className={cn('relative space-y-2.5 p-4', cover && '-mt-6')}>
        <h3 className="text-[15px] font-medium leading-snug text-slate-900/92">{c.name}</h3>

        {c.result && (
          <p className="flex items-start gap-1.5 text-[13.5px] font-semibold leading-snug">
            <Award size={14} className="mt-[1px] shrink-0 text-indigo-500" />
            <GradText>{c.result}</GradText>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-500">
          {range && <span className="num flex items-center gap-1"><Calendar size={11} />{range}</span>}
          <TeamRow c={c} />
          {c.attachments.length > 0 && (
            <span className="num flex items-center gap-1" title="材料"><Paperclip size={11} />{c.attachments.length}</span>
          )}
        </div>
      </div>

      {authed && <Actions overlay onEdit={onEdit} onDelete={onDelete} className="absolute right-2.5 top-2.5" />}
    </motion.article>
  )
}

/* ---------------- 时间轴 ---------------- */

function Timeline({ grouped, cardProps }: {
  grouped: [string, CompItem[]][]
  cardProps: (c: CompItem) => CardProps
}) {
  return (
    <div className="relative pb-4">
      {/* 发光轨道 */}
      <div aria-hidden className="pointer-events-none absolute bottom-0 left-[15px] top-2 w-[2px] rounded-full bg-gradient-to-b from-sky-300/90 via-indigo-400/70 to-purple-400/0 md:left-1/2 md:-translate-x-1/2" />
      <div aria-hidden className="pointer-events-none absolute bottom-0 left-[12px] top-2 w-2 rounded-full bg-gradient-to-b from-sky-300/60 via-indigo-400/40 to-purple-400/0 blur-md md:left-1/2 md:-translate-x-1/2" />

      <div className="space-y-10">
        {grouped.map(([y, list]) => (
          <section key={y} className="relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, ease: EASE }}
              className="relative mb-5 flex pl-9 md:justify-center md:pl-0"
            >
              <span className="liquid inline-flex items-center gap-2 rounded-full px-4 py-1.5">
                <span className="num text-lg font-bold tracking-tight"><GradText>{y}</GradText></span>
                <span className="num text-[11px] text-slate-500">{list.length}</span>
              </span>
            </motion.div>

            <ul className="space-y-4 md:space-y-2">
              {list.map((c, i) => {
                const right = i % 2 === 1
                const color = levelDot(c.level)
                return (
                  <motion.li
                    key={c.id}
                    initial={{ opacity: 0, x: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.55, ease: EASE, delay: Math.min(i, 6) * 0.03 }}
                    className={cn('relative pl-9 md:w-1/2', right ? 'md:ml-auto md:pl-8' : 'md:pl-0 md:pr-8')}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'absolute left-[10px] top-6 h-3 w-3 rounded-full ring-4 ring-white',
                        right ? 'md:left-[-6px]' : 'md:left-auto md:right-[-6px]',
                      )}
                      style={{ background: color, boxShadow: `0 0 14px ${color}` }}
                    />
                    <TimelineCard {...cardProps(c)} flip={!right} />
                  </motion.li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function TimelineCard({ c, authed, onOpen, onEdit, onDelete, flip }: CardProps & { flip?: boolean }) {
  const cover = c.attachments.find(isImage)?.file
  const range = dateRange(c)

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={openOnKey(onOpen)}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={cn(
        'liquid liquid-hover spotlight group relative flex cursor-pointer items-center gap-4 rounded-2xl p-3.5',
        flip && 'md:flex-row-reverse md:text-right',
      )}
    >
      {cover ? (
        <img src={fileUrl(cover, true)} alt="" loading="lazy"
             className="h-14 w-14 shrink-0 rounded-xl border border-slate-900/10 object-cover" />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-900/10"
              style={{ background: `radial-gradient(circle at 30% 20%, ${levelDot(c.level)}40, transparent 70%)` }}>
          <Trophy size={17} className="text-slate-900/60" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className={cn('flex flex-wrap items-center gap-2', flip && 'md:justify-end')}>
          <LevelBadge level={c.level} />
          {range && <span className="num text-[11px] text-slate-500">{range}</span>}
        </div>
        <h3 className="mt-1.5 line-clamp-2 text-[14.5px] leading-snug text-slate-900/90">{c.name}</h3>
        <div className={cn('mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500', flip && 'md:justify-end')}>
          {c.result && <span className="flex items-center gap-1 font-semibold"><Award size={11} className="text-indigo-500" /><GradText>{c.result}</GradText></span>}
          <TeamRow c={c} max={3} />
          {c.attachments.length > 0 && <span className="num flex items-center gap-1"><Paperclip size={11} />{c.attachments.length}</span>}
        </div>
      </div>

      {authed && <Actions onEdit={onEdit} onDelete={onDelete} className="shrink-0 flex-col sm:flex-row" />}
    </motion.div>
  )
}

/* ---------------- 详情抽屉 ---------------- */

function DetailSheet({ item, onClose, authed, onEdit }: {
  item: CompItem | null; onClose: () => void; authed: boolean; onEdit: () => void
}) {
  const [lightbox, setLightbox] = useState<number | null>(null)
  // 关闭时保留上一条，让抽屉有退场动画
  const [last, setLast] = useState<CompItem | null>(item)
  useEffect(() => {
    if (item) setLast(item)
    setLightbox(null)
  }, [item])

  const shown = item ?? last
  const images = shown ? shown.attachments.filter(isImage) : []
  const others = shown ? shown.attachments.filter((a) => !isImage(a)) : []
  const team = shown ? teamOf(shown) : []
  const range = shown ? dateRange(shown) : null

  return (
    <>
      <Sheet
        open={!!item}
        onClose={onClose}
        wide
        title={shown && (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <LevelBadge level={shown.level} />
              {range && <span className="num flex items-center gap-1 text-[11px] text-slate-500"><Calendar size={11} />{range}</span>}
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-snug tracking-tight text-slate-900/95">{shown.name}</h2>
          </div>
        )}
      >
        {shown && (
          <motion.div
            className="space-y-6"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } } }}
          >
            {(shown.result || team.length > 0) && (
              <Block className="grid gap-3 sm:grid-cols-2">
                {shown.result && (
                  <div className="liquid grad-border rounded-2xl p-4" data-active="true">
                    <Award size={15} className="mb-2 text-indigo-500" />
                    <p className="text-[17px] font-semibold leading-snug"><GradText animated>{shown.result}</GradText></p>
                  </div>
                )}
                {team.length > 0 && (
                  <div className="liquid rounded-2xl p-4" title="团队">
                    <Users size={15} className="mb-2 text-indigo-500" />
                    <div className="flex flex-wrap gap-1.5">
                      {team.map((m, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-slate-900/10 bg-slate-900/5 py-0.5 pl-0.5 pr-2.5 text-[12.5px] text-slate-900/80">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-sky-300/50 via-indigo-400/50 to-purple-400/50 text-[10px] text-slate-900">
                            {m.slice(0, 1)}
                          </span>
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Block>
            )}

            {shown.description && (
              <Block>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-600">{shown.description}</p>
              </Block>
            )}

            {images.length > 0 && (
              <Block>
                <h4 className="mb-3 flex items-center gap-2 text-indigo-400" title="图片">
                  <ImageIcon size={13} /><span className="num text-[11px]">{images.length}</span>
                  <span className="hairline flex-1" />
                </h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {images.map((a, i) => (
                    <motion.button
                      key={a.id}
                      onClick={() => setLightbox(i)}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      aria-label={a.caption || `图片 ${i + 1}`}
                      className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-900/10"
                    >
                      <img src={fileUrl(a.file!, true)} alt={a.caption ?? ''} loading="lazy"
                           className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.07]" />
                      <span className="absolute inset-0 flex items-center justify-center bg-slate-900/35 opacity-0 transition-opacity group-hover:opacity-100">
                        <ZoomIn size={16} className="text-slate-900/90" />
                      </span>
                    </motion.button>
                  ))}
                </div>
              </Block>
            )}

            {others.length > 0 && (
              <Block>
                <h4 className="mb-3 flex items-center gap-2 text-indigo-400" title="文件">
                  <FileText size={13} /><span className="num text-[11px]">{others.length}</span>
                  <span className="hairline flex-1" />
                </h4>
                <ul className="space-y-2">
                  {others.map((a) => {
                    const pdf = (a.file!.mime ?? '').includes('pdf') || /\.pdf$/i.test(a.file!.originalName)
                    return (
                      <li key={a.id} className="liquid liquid-hover flex items-center gap-3 rounded-xl py-1.5 pl-3.5 pr-1.5">
                        <FileText size={14} className="shrink-0 text-indigo-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-slate-900/85">{a.file!.originalName}</span>
                          <span className="num text-[10.5px] text-slate-500">{formatBytes(a.file!.size)}</span>
                        </span>
                        {pdf && (
                          <a href={fileUrl(a.file!, true)} target="_blank" rel="noreferrer"
                             className="btn btn-ghost btn-icon h-10 w-10" aria-label="预览" title="预览">
                            <ExternalLink size={14} />
                          </a>
                        )}
                        <a href={fileUrl(a.file!)} className="btn btn-ghost btn-icon h-10 w-10" aria-label="下载" title="下载">
                          <Download size={14} />
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </Block>
            )}

            {shown.attachments.length === 0 && !shown.description && !shown.result && team.length === 0 && (
              <Block className="flex justify-center py-6 text-2xl text-indigo-400">∅</Block>
            )}

            {authed && (
              <Block className="flex gap-2 border-t border-slate-900/7 pt-5">
                <button onClick={onEdit} className="btn btn-sm h-10 px-4"><Pencil size={13} /> 编辑</button>
              </Block>
            )}
          </motion.div>
        )}
      </Sheet>

      <Lightbox images={images} index={item ? lightbox : null} onClose={() => setLightbox(null)} onIndex={setLightbox} />
    </>
  )
}

function Block({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      className={className}
      variants={{
        hidden: { opacity: 0, y: 12, filter: 'blur(6px)' },
        show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.45, ease: EASE } },
      }}
    >
      {children}
    </motion.section>
  )
}

/* ---------------- Lightbox ---------------- */

export function Lightbox({ images, index, onClose, onIndex }: {
  images: { id: number; file: FileRow | null; caption: string | null }[]
  index: number | null
  onClose: () => void
  onIndex: (i: number) => void
}) {
  const [zoom, setZoom] = useState(false)
  const active = index !== null && !!images[index]?.file

  useEffect(() => { setZoom(false) }, [index])

  useEffect(() => {
    if (!active || index === null) return
    const go = (d: number) => onIndex((index + d + images.length) % images.length)
    // 捕获阶段处理，Esc 只关灯箱、不连带关掉抽屉
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [active, index, images.length, onIndex, onClose])

  const go = (d: number) => index !== null && onIndex((index + d + images.length) % images.length)
  const cur = active && index !== null ? images[index] : null

  return (
    <AnimatePresence>
      {cur && index !== null && (
        <motion.div
          key="lightbox"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[70] flex flex-col bg-slate-100/90 backdrop-blur-2xl"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5 sm:py-4" onClick={(e) => e.stopPropagation()}>
            <span className="num liquid rounded-full px-3 py-1 text-[12px] text-slate-600">{index + 1} / {images.length}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setZoom((z) => !z)} className="btn btn-ghost btn-icon h-10 w-10"
                      aria-label={zoom ? '缩小' : '放大'} title={zoom ? '缩小' : '放大'}>
                {zoom ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
              </button>
              <a href={fileUrl(cur.file!)} className="btn btn-ghost btn-icon h-10 w-10" aria-label="下载" title="下载">
                <Download size={16} />
              </a>
              <button onClick={onClose} className="btn btn-ghost btn-icon h-10 w-10" aria-label="关闭" title="关闭">
                <X size={16} />
              </button>
            </div>
          </div>

          <div
            className={cn('flex min-h-0 flex-1 px-4 pb-4', zoom ? 'items-start justify-start overflow-auto' : 'items-center justify-center')}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.img
              key={cur.id}
              src={fileUrl(cur.file!, true)}
              alt={cur.caption ?? ''}
              onClick={() => setZoom((z) => !z)}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: EASE }}
              className={cn(
                'rounded-xl shadow-2xl',
                zoom ? 'm-auto max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain',
              )}
            />
          </div>

          {images.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); go(-1) }} aria-label="上一张" title="上一张"
                      className="liquid-strong absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full sm:left-4">
                <ChevronLeft size={18} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); go(1) }} aria-label="下一张" title="下一张"
                      className="liquid-strong absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full sm:right-4">
                <ChevronRight size={18} />
              </button>
            </>
          )}

          {cur.caption && (
            <p className="px-6 pb-6 text-center text-[13px] text-slate-600" onClick={(e) => e.stopPropagation()}>{cur.caption}</p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
