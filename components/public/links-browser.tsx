'use client'
import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import Link from 'next/link'
import {
  Search, Pin, Hash, X, ArrowUpRight, Plus, Pencil, Trash2, Bookmark, SearchX,
  RotateCcw, LayoutGrid, MousePointerClick, Settings2,
} from 'lucide-react'
import type { Link as LinkRow, Category } from '@/db/schema'
import { cn, hostOf, toneOf } from '@/lib/utils'
import { Tilt } from '@/components/ui/tilt'
import { EmptyState } from '@/components/ui/primitives'
import { Favicon } from '@/components/ui/favicon'
import { stagger, item } from '@/components/motion/reveal'
import { LinksEditor } from '@/components/public/links-editor'

type Props = { links: LinkRow[]; categories: Category[]; authed: boolean }
type CatKey = number | 'all' | 'none'

const EASE = [0.22, 1, 0.36, 1] as const
const SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const
const NOSCROLL = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

function countClick(l: LinkRow) {
  fetch('/api/links/click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: l.id }),
    keepalive: true,
  }).catch(() => {})
}

/** 在瀑布流中按方向找最近的卡片（基于实际位置） */
function spatialNext(from: number, total: number, key: string): number {
  if (total === 0) return -1
  if (from < 0) return 0
  const els = [...document.querySelectorAll<HTMLElement>('[data-link-idx]')]
  const cur = els.find((e) => Number(e.dataset.linkIdx) === from)
  if (!cur) return Math.min(total - 1, from)
  const r0 = cur.getBoundingClientRect()
  const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 }
  let best = from
  let bestScore = Infinity
  for (const el of els) {
    const idx = Number(el.dataset.linkIdx)
    if (idx === from) continue
    const r = el.getBoundingClientRect()
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    const dx = c.x - c0.x
    const dy = c.y - c0.y
    let main = 0
    let cross = 0
    if (key === 'ArrowRight') { main = dx; cross = Math.abs(dy) }
    else if (key === 'ArrowLeft') { main = -dx; cross = Math.abs(dy) }
    else if (key === 'ArrowDown') { main = dy; cross = Math.abs(dx) }
    else if (key === 'ArrowUp') { main = -dy; cross = Math.abs(dx) }
    if (main <= 4) continue
    const score = main + cross * 2.5
    if (score < bestScore) { bestScore = score; best = idx }
  }
  // 横向没有邻居时按顺序前后移动
  if (best === from && (key === 'ArrowRight' || key === 'ArrowLeft')) {
    return key === 'ArrowRight' ? Math.min(total - 1, from + 1) : Math.max(0, from - 1)
  }
  return best
}

export function LinksBrowser({ links, categories, authed }: Props) {
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<CatKey>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [focusIdx, setFocusIdx] = useState(-1)
  const [editing, setEditing] = useState<LinkRow | null>(null)
  const [creating, setCreating] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const allTags = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of links) for (const t of l.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [links])

  const catCounts = useMemo(() => {
    const m = new Map<number | null, number>()
    for (const l of links) m.set(l.categoryId ?? null, (m.get(l.categoryId ?? null) ?? 0) + 1)
    return m
  }, [links])
  const uncategorized = useMemo(
    () => links.filter((l) => l.categoryId == null || !categories.some((c) => c.id === l.categoryId)).length,
    [links, categories],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return links.filter((l) => {
      if (cat === 'none') {
        if (l.categoryId != null && categories.some((c) => c.id === l.categoryId)) return false
      } else if (cat !== 'all' && l.categoryId !== cat) return false
      if (tag && !(l.tags ?? []).includes(tag)) return false
      if (!q) return true
      return (
        l.title.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q) ||
        (l.description ?? '').toLowerCase().includes(q) ||
        (l.tags ?? []).some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [links, categories, query, cat, tag])

  const pinned = useMemo(() => filtered.filter((l) => l.pinned), [filtered])
  const rest = useMemo(() => filtered.filter((l) => !l.pinned), [filtered])
  const ordered = useMemo(() => [...pinned, ...rest], [pinned, rest])

  useEffect(() => { setFocusIdx(-1) }, [query, cat, tag])

  const open = useCallback((l: LinkRow) => {
    window.open(l.url, '_blank', 'noopener')
    countClick(l)
  }, [])

  const editorOpen = creating || !!editing

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editorOpen || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable

      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === 'Escape') {
        if (typing) { (t as HTMLInputElement).blur(); return }
        setQuery(''); setTag(null); setFocusIdx(-1)
        return
      }
      if (typing) {
        // 搜索框内 ↓ 直接跳到卡片
        if (t !== searchRef.current || e.key !== 'ArrowDown') return
        t.blur()
      }

      if (e.key === 'Enter') {
        if (focusIdx < 0 || t.tagName === 'A' || t.tagName === 'BUTTON') return
        const l = ordered[focusIdx]
        if (l) { e.preventDefault(); open(l) }
        return
      }
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
      e.preventDefault()
      const next = spatialNext(focusIdx, ordered.length, e.key)
      if (next < 0) return
      setFocusIdx(next)
      const el = document.querySelector<HTMLElement>(`[data-link-idx="${next}"]`)
      // 必须真的移焦点，只加 ring 的话读屏不会播报当前卡片
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ordered, focusIdx, open, editorOpen])

  async function remove(l: LinkRow) {
    if (!confirm(`删除「${l.title}」？`)) return
    await fetch(`/api/links/${l.id}`, { method: 'DELETE' })
    location.reload()
  }

  const filteredOut = query || tag || cat !== 'all'
  const reset = () => { setQuery(''); setTag(null); setCat('all') }

  return (
    <div className="split">
      {/* ── 左栏：分类 / 标签 ── */}
      <aside className="min-w-0 space-y-3 lg:sticky lg:top-24 lg:self-start">
        <LayoutGroup id="links-rail">
          <motion.nav
            aria-label="分类"
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, ease: EASE }}
            className="liquid rounded-2xl p-1.5 lg:rounded-3xl lg:p-2"
          >
            <div className={cn('flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible', NOSCROLL)}>
              <RailItem active={cat === 'all'} onClick={() => setCat('all')} count={links.length} icon={<LayoutGrid size={14} />}>
                全部
              </RailItem>
              {categories.map((c) => (
                <RailItem key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} count={catCounts.get(c.id) ?? 0} color={c.color}>
                  {c.name}
                </RailItem>
              ))}
              {categories.length > 0 && uncategorized > 0 && (
                <RailItem active={cat === 'none'} onClick={() => setCat('none')} count={uncategorized} title="未分类">
                  <span className="font-mono">∅</span>
                </RailItem>
              )}
            </div>
          </motion.nav>

          {allTags.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, delay: 0.08, ease: EASE }}
              className="liquid rounded-2xl p-1.5 lg:rounded-3xl lg:p-3"
            >
              <div className={cn('flex items-center gap-1.5 overflow-x-auto lg:max-h-[38vh] lg:flex-wrap lg:overflow-y-auto lg:overflow-x-visible', NOSCROLL)}>
                <Hash size={13} className="hidden shrink-0 text-indigo-200/35 lg:block" aria-hidden />
                {allTags.map(([t, n]) => (
                  <button
                    key={t}
                    onClick={() => setTag(tag === t ? null : t)}
                    data-active={tag === t}
                    aria-pressed={tag === t}
                    title={`${n}`}
                    className="chip min-h-10 shrink-0 lg:min-h-0 lg:px-2.5 lg:py-1 lg:text-[11.5px]"
                  >
                    <span className="opacity-45">#</span>{t}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <div className="hidden items-center gap-1 px-2 pt-1 text-indigo-100/30 lg:flex" aria-hidden>
            <span className="kbd">←</span><span className="kbd">↑</span><span className="kbd">↓</span><span className="kbd">→</span>
            <span className="mx-1 opacity-50">·</span>
            <span className="kbd">↵</span>
            <span className="mx-1 opacity-50">·</span>
            <span className="kbd">/</span>
          </div>
        </LayoutGroup>
      </aside>

      {/* ── 右栏：搜索 + 卡片 ── */}
      <section className="min-w-0 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="liquid sticky top-3 z-30 flex items-center gap-2 rounded-2xl p-2 md:top-[76px]"
        >
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-200/40" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索"
              aria-label="搜索"
              className="field h-11 pl-10 pr-11"
            />
            <AnimatePresence mode="wait" initial={false}>
              {query ? (
                <motion.button
                  key="x"
                  initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
                  onClick={() => { setQuery(''); searchRef.current?.focus() }}
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-indigo-100/50 hover:bg-white/[0.07] hover:text-white"
                  aria-label="清除" title="清除"
                >
                  <X size={14} />
                </motion.button>
              ) : (
                <motion.span
                  key="k"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="kbd pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 sm:inline-flex"
                >
                  /
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <span className="num hidden shrink-0 px-1.5 text-[12px] text-indigo-100/40 sm:inline" aria-live="polite">
            {filtered.length}<span className="opacity-50">/{links.length}</span>
          </span>

          {authed && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setCreating(true)}
              className="btn btn-primary shine btn-icon h-11 w-11 shrink-0"
              aria-label="新增" title="新增"
            >
              <Plus size={17} />
            </motion.button>
          )}
        </motion.div>

        <AnimatePresence initial={false}>
          {tag && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="-mt-2 overflow-hidden"
            >
              <button onClick={() => setTag(null)} data-active="true" className="chip min-h-10" aria-label="清除标签">
                <Hash size={12} /> {tag} <X size={12} className="opacity-60" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {filtered.length === 0 ? (
          links.length === 0 ? (
            <EmptyState
              icon={<Bookmark size={28} />}
              action={authed ? (
                <button onClick={() => setCreating(true)} className="btn btn-primary shine min-h-10" aria-label="新增"><Plus size={15} /> 新增</button>
              ) : undefined}
            />
          ) : (
            <EmptyState
              icon={<SearchX size={28} />}
              action={filteredOut ? (
                <button onClick={reset} className="btn min-h-10" aria-label="清除筛选" title="清除筛选"><RotateCcw size={14} /></button>
              ) : undefined}
            />
          )
        ) : (
          <>
            <AnimatePresence initial={false}>
              {pinned.length > 0 && (
                <motion.section
                  key="pinned"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="space-y-3"
                >
                  <h2 className="label flex items-center gap-1.5">
                    <Pin size={12} className="text-violet-200/70" />
                    <span className="num">{pinned.length}</span>
                  </h2>
                  <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                    <AnimatePresence>
                      {pinned.map((l, i) => (
                        <Card key={l.id} link={l} idx={i} focused={focusIdx === i} featured
                              authed={authed} onEdit={setEditing} onDelete={remove} />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </motion.section>
              )}
            </AnimatePresence>

            {rest.length > 0 && (
              <section className="space-y-3">
                {pinned.length > 0 && <div className="hairline" />}
                <motion.div variants={stagger} initial="hidden" animate="show" className="masonry">
                  <AnimatePresence>
                    {rest.map((l, i) => (
                      <Card key={l.id} link={l} idx={pinned.length + i} focused={focusIdx === pinned.length + i}
                            authed={authed} onEdit={setEditing} onDelete={remove} />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </section>
            )}
          </>
        )}
      </section>

      <LinksEditor
        open={editorOpen}
        link={editing}
        categories={categories}
        onClose={() => { setCreating(false); setEditing(null) }}
      />
    </div>
  )
}

function RailItem({ active, onClick, children, count, color, icon, title }: {
  active: boolean; onClick: () => void; children: React.ReactNode; count: number
  color?: string | null; icon?: React.ReactNode; title?: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={title}
      title={title}
      className={cn(
        'relative flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[13px] transition-colors duration-300 lg:w-full lg:px-3',
        active ? 'text-white' : 'text-indigo-100/50 hover:bg-white/[0.04] hover:text-white/85',
      )}
    >
      {active && (
        <motion.span
          layoutId="links-rail-pill"
          transition={SPRING}
          className="absolute inset-0 rounded-xl border border-indigo-300/30 shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_0_22px_-8px_rgb(129_140_248/0.7)]"
          style={{ background: 'var(--grad-soft)' }}
        />
      )}
      <span className="relative z-10 flex shrink-0 items-center">
        {icon ?? (
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: color || 'var(--grad)', boxShadow: active ? `0 0 10px ${color || '#818cf8'}` : undefined }}
          />
        )}
      </span>
      <span className="relative z-10 truncate whitespace-nowrap">{children}</span>
      <span className={cn('num relative z-10 ml-auto pl-2 text-[11px]', active ? 'text-white/70' : 'text-indigo-100/30')}>{count}</span>
    </button>
  )
}

function Card({ link, idx, focused, featured, authed, onEdit, onDelete }: {
  link: LinkRow
  idx: number
  focused: boolean
  featured?: boolean
  authed: boolean
  onEdit: (l: LinkRow) => void
  onDelete: (l: LinkRow) => void
}) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; s: number }[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const tags = link.tags ?? []

  function ripple(e: React.PointerEvent) {
    const r = boxRef.current?.getBoundingClientRect()
    if (!r) return
    const s = Math.max(r.width, r.height) * 2.2
    setRipples((rs) => [...rs, { id: Date.now() + Math.random(), x: e.clientX - r.left, y: e.clientY - r.top, s }])
  }

  return (
    <motion.div
      variants={item}
      exit={{ opacity: 0, scale: 0.94, filter: 'blur(4px)', transition: { duration: 0.22 } }}
      layout="position"
      transition={{ layout: { duration: 0.45, ease: EASE } }}
      whileTap={{ scale: 0.97 }}
      data-link-idx={idx}
      tabIndex={-1}
      className="group/card relative outline-none"
    >
      <Tilt
        intensity={featured ? 6 : 7}
        lift={3}
        active={featured || focused ? true : undefined}
        className={cn(
          'rounded-2xl',
          (featured || focused) && 'grad-border',
          focused && 'ring-2 ring-indigo-300/55 ring-offset-2 ring-offset-[#060818]',
        )}
      >
        <div
          ref={boxRef}
          className={cn(
            'liquid liquid-hover spotlight relative flex flex-col gap-3 overflow-hidden rounded-2xl p-4',
            featured && 'bg-gradient-to-br from-sky-400/[0.06] via-indigo-400/[0.05] to-purple-400/[0.08]',
          )}
        >
          {/* 整卡链接 */}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={ripple}
            onClick={() => countClick(link)}
            onAuxClick={(e) => { if (e.button === 1) countClick(link) }}
            aria-label={link.title}
            className="absolute inset-0 z-[1] rounded-[inherit] focus-visible:outline-offset-[-2px]"
          />

          {/* 涟漪 */}
          <span aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]">
            <AnimatePresence>
              {ripples.map((r) => (
                <motion.span
                  key={r.id}
                  className="absolute rounded-full"
                  style={{
                    left: r.x - r.s / 2, top: r.y - r.s / 2, width: r.s, height: r.s,
                    background: 'radial-gradient(circle, rgb(165 180 252 / 0.35), rgb(192 132 252 / 0.12) 45%, transparent 70%)',
                  }}
                  initial={{ scale: 0, opacity: 0.9 }}
                  animate={{ scale: 1, opacity: 0 }}
                  transition={{ duration: 0.65, ease: EASE }}
                  onAnimationComplete={() => setRipples((rs) => rs.filter((x) => x.id !== r.id))}
                />
              ))}
            </AnimatePresence>
          </span>

          <div className="pointer-events-none relative flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.06]">
              <Favicon url={link.url} title={link.title} size={22} radius="rounded-md" />
            </span>

            <div className="min-w-0 flex-1">
              <h3 className="flex items-center gap-1.5 text-[14px] font-medium text-white/90">
                {link.pinned && !featured && <Pin size={11} className="shrink-0 text-violet-300/80" />}
                <span className="truncate">{link.title}</span>
              </h3>
              <p className="truncate font-mono text-[11px] text-indigo-100/35">{hostOf(link.url)}</p>
            </div>

            <ArrowUpRight
              size={15}
              className="shrink-0 text-indigo-100/20 transition-all duration-300 group-hover/card:-translate-y-0.5 group-hover/card:translate-x-0.5 group-hover/card:text-indigo-100/80"
            />
          </div>

          {link.description && (
            <p className={cn('pointer-events-none relative text-[12.5px] leading-relaxed text-indigo-100/45', featured ? 'line-clamp-2' : 'line-clamp-4')}>
              {link.description}
            </p>
          )}

          {(tags.length > 0 || link.clickCount > 0 || authed) && (
            <div className="relative flex flex-wrap items-center gap-1.5">
              {tags.slice(0, 3).map((t) => (
                <span key={t} className="pointer-events-none rounded-md border border-indigo-300/10 bg-indigo-400/[0.06] px-1.5 py-0.5 text-[10.5px] text-indigo-100/50">
                  <span className="opacity-50">#</span>{t}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="num pointer-events-none text-[10.5px] text-indigo-100/30">+{tags.length - 3}</span>
              )}

              <span className="ml-auto flex items-center gap-1">
                {link.clickCount > 0 && (
                  <span className="num pointer-events-none flex items-center gap-1 pr-1 text-[10.5px] text-indigo-100/30" title={`${link.clickCount}`}>
                    <MousePointerClick size={10} />{link.clickCount}
                  </span>
                )}
                {authed && (
                  <span className="relative z-[3] flex items-center gap-1 transition-opacity duration-200 group-focus-within/card:opacity-100 group-hover/card:opacity-100 [@media(hover:hover)]:opacity-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(link) }}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-black/40 backdrop-blur-md transition-colors hover:border-indigo-300/40 hover:bg-indigo-400/15 [@media(hover:hover)]:h-8 [@media(hover:hover)]:w-8"
                      aria-label="编辑" title="编辑"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(link) }}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-black/40 backdrop-blur-md transition-colors hover:border-rose-400/50 hover:bg-rose-500/20 [@media(hover:hover)]:h-8 [@media(hover:hover)]:w-8"
                      aria-label="删除" title="删除"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </Tilt>
    </motion.div>
  )
}

/** 小型入口：后台管理 */
export function AddLinkHint() {
  return (
    <Link href="/admin/links" className="btn btn-sm min-h-10" aria-label="管理" title="管理">
      <Settings2 size={14} />
    </Link>
  )
}
