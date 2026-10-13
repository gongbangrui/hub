'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { m as motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import {
  Search, Plus, Pencil, Trash2, Download, FileText, ExternalLink, Copy, Check,
  Quote, BookOpen, CalendarDays, ArrowDownAZ, CircleDot, ArrowUp, ArrowDown, X, AtSign, Paperclip,
} from 'lucide-react'
import type { Paper, Attachment, FileRow } from '@/db/schema'
import { cn, formatBytes, fileKind } from '@/lib/utils'
import { fileUrl } from '@/lib/file-url'
import { EmptyState, Sheet, StatusBadge, STATUSES } from '@/components/ui/primitives'
import { PageTitle } from '@/components/ui/page'
import { EASE } from '@/lib/motion'
import { PaperEditor } from '@/components/public/paper-editor'
import { useRouter } from 'next/navigation'

export type PaperItem = Paper & {
  attachments: (Attachment & { file: FileRow | null })[]
}

type SortKey = 'pubDate' | 'title' | 'venue' | 'status'

const FUNNEL = ['draft', 'submitted', 'accepted', 'published'] as const
const FUNNEL_BG: Record<(typeof FUNNEL)[number], string> = {
  draft: 'linear-gradient(90deg,#bae6fd,#7dd3fc)',
  submitted: 'linear-gradient(90deg,#7dd3fc,#818cf8)',
  accepted: 'linear-gradient(90deg,#818cf8,#a78bfa)',
  published: 'linear-gradient(90deg,#a78bfa,#c084fc)',
}

const SORTS: { key: SortKey; icon: React.ReactNode; label: string }[] = [
  { key: 'pubDate', icon: <CalendarDays size={14} />, label: '时间' },
  { key: 'title', icon: <ArrowDownAZ size={14} />, label: '标题' },
  { key: 'venue', icon: <BookOpen size={14} />, label: '发表处' },
  { key: 'status', icon: <CircleDot size={14} />, label: '状态' },
]

const TYPE_LABEL: Record<string, string> = { journal: '期刊', conference: '会议', preprint: '预印本' }

const pdfOf = (p: PaperItem) =>
  p.attachments.find((a) => fileKind(a.file?.mime ?? '', a.file?.originalName ?? '') === 'pdf')

function useIsLg() {
  const [lg, setLg] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)')
    const on = () => setLg(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return lg
}

export function PapersView({ items, authed }: { items: PaperItem[]; authed: boolean }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string | 'all'>('all')
  const [author, setAuthor] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('pubDate')
  const [asc, setAsc] = useState(false)
  const [selId, setSelId] = useState<number | null>(items[0]?.id ?? null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<PaperItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [bibtex, setBibtex] = useState(false)
  const isLg = useIsLg()
  const router = useRouter()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = items.filter((p) => {
      if (status !== 'all' && p.status !== status) return false
      if (author && !(p.authors ?? []).includes(author)) return false
      if (!q) return true
      return [p.title, p.venue, p.doi, p.abstract, ...(p.authors ?? [])]
        .some((s) => (s ?? '').toLowerCase().includes(q))
    })
    const dir = asc ? 1 : -1
    return [...list].sort((a, b) => {
      const av = (a[sort] ?? '') as string
      const bv = (b[sort] ?? '') as string
      return av.localeCompare(bv) * dir
    })
  }, [items, query, status, author, sort, asc])

  const funnel = FUNNEL.map((k) => ({ key: k, n: items.filter((p) => p.status === k).length }))

  // 选中项：若被过滤掉则回落到第一项
  const selected = filtered.find((p) => p.id === selId) ?? (isLg ? filtered[0] ?? null : null)

  const select = useCallback((p: PaperItem) => {
    setSelId(p.id)
    if (!isLg) setSheetOpen(true)
  }, [isLg])

  // ↑ ↓ / j k 切换
  useEffect(() => {
    if (!isLg) return
    // 有弹层打开时不响应：否则 j/k 会去切换被弹层盖住的列表并把它滚走
    if (editing || creating || bibtex || sheetOpen) return
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const down = e.key === 'ArrowDown' || e.key === 'j'
      const up = e.key === 'ArrowUp' || e.key === 'k'
      if (!down && !up) return
      if (!filtered.length) return
      e.preventDefault()
      const i = filtered.findIndex((p) => p.id === selected?.id)
      const next = filtered[Math.max(0, Math.min(filtered.length - 1, i + (down ? 1 : -1)))]
      if (next) {
        setSelId(next.id)
        document.getElementById(`paper-${next.id}`)?.scrollIntoView({ block: 'nearest' })
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [filtered, selected, isLg, editing, creating, bibtex, sheetOpen])

  async function remove(p: PaperItem) {
    if (!confirm('删除？')) return
    const r = await fetch(`/api/papers/${p.id}`, { method: 'DELETE' })
    if (!r.ok) { alert('删除失败'); return }
    // 用 refresh 而不是整页重载：保住筛选、排序、滚动位置
    setEditing(null)
    router.refresh()
  }

  function pickSort(k: SortKey) {
    if (sort === k) setAsc(!asc)
    else { setSort(k); setAsc(false) }
  }

  const bib = useMemo(() => buildBibtex(filtered), [filtered])
  const filterAuthor = (a: string) => { setAuthor(author === a ? null : a); setSheetOpen(false) }

  return (
    <div className="space-y-6">
      <PageTitle
        icon={<BookOpen size={19} />}
        title="论文"
        count={items.length}
        right={
          <>
            <button
              onClick={() => setBibtex(true)}
              disabled={!filtered.length}
              className="btn btn-icon h-10 w-10 justify-center"
              aria-label="导出 BibTeX" title="BibTeX"
            >
              <Quote size={15} />
            </button>
            {authed && (
              <button
                onClick={() => setCreating(true)}
                className="btn btn-primary btn-icon shine h-10 w-10 justify-center"
                aria-label="新增" title="新增"
              >
                <Plus size={17} />
              </button>
            )}
          </>
        }
      />

      {items.length > 0 && (
        <Funnel funnel={funnel} total={items.length} status={status} onPick={(k) => setStatus(status === k ? 'all' : k)} />
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={28} />}
          action={authed ? (
            <button onClick={() => setCreating(true)} className="btn btn-primary shine" aria-label="新增" title="新增">
              <Plus size={15} />
            </button>
          ) : undefined}
        />
      ) : (
        <div className="split split-wide">
          {/* 左：列表 */}
          <div className="min-w-0 space-y-3">
            <div className="liquid flex items-center gap-2 rounded-2xl p-2">
              <div className="relative min-w-0 flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索"
                  aria-label="搜索"
                  className="field h-10 pl-9"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-900/40 hover:text-slate-900"
                    aria-label="清除" title="清除"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <LayoutGroup id="paper-sort">
                <div className="liquid flex items-center rounded-xl p-0.5">
                  {SORTS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => pickSort(s.key)}
                      className={cn('relative flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors',
                        sort === s.key ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900/80')}
                      aria-label={s.label} title={s.label}
                    >
                      {sort === s.key && (
                        <motion.span
                          layoutId="paper-sort-pill"
                          className="absolute inset-0 rounded-[10px] bg-gradient-to-br from-sky-300/25 via-indigo-400/25 to-purple-400/25 ring-1 ring-indigo-300/30"
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        />
                      )}
                      <span className="relative">{s.icon}</span>
                    </button>
                  ))}
                </div>
              </LayoutGroup>
              <button
                onClick={() => setAsc(!asc)}
                className="btn btn-ghost h-9 w-9 justify-center p-0"
                aria-label={asc ? '升序' : '降序'} title={asc ? '↑' : '↓'}
              >
                <motion.span key={String(asc)} initial={{ y: asc ? 6 : -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.25, ease: EASE }}>
                  {asc ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                </motion.span>
              </button>

              <AnimatePresence>
                {author && (
                  <motion.button
                    key="author"
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.22, ease: EASE }}
                    onClick={() => setAuthor(null)}
                    className="chip h-9 max-w-[180px]"
                    data-active="true"
                    aria-label="清除作者筛选"
                  >
                    <AtSign size={12} /><span className="truncate">{author}</span><X size={12} />
                  </motion.button>
                )}
              </AnimatePresence>

              <span className="num ml-auto text-[11px] text-slate-500">{filtered.length}</span>
            </div>

            {filtered.length === 0 ? (
              <EmptyState icon={<Search size={24} />} title="∅" />
            ) : (
              <LayoutGroup id="paper-list">
                <motion.ul layout className="liquid overflow-hidden rounded-2xl p-1.5">
                  <AnimatePresence initial={false} mode="popLayout">
                    {filtered.map((p, i) => (
                      <motion.li
                        key={p.id}
                        id={`paper-${p.id}`}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.2), ease: EASE }}
                      >
                        <PaperRow p={p} active={isLg && selected?.id === p.id} onOpen={() => select(p)} />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </motion.ul>
              </LayoutGroup>
            )}
          </div>

          {/* 右：详情 */}
          <div className="hidden min-w-0 lg:block">
            <div className="sticky-col lg:top-24">
              <AnimatePresence mode="wait">
                {selected ? (
                  <motion.div
                    key={selected.id}
                    initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                    transition={{ duration: 0.35, ease: EASE }}
                    className="liquid max-h-[calc(100vh-7.5rem)] overflow-y-auto rounded-3xl p-6"
                  >
                    <PaperDetail
                      item={selected}
                      authed={authed}
                      author={author}
                      onAuthor={filterAuthor}
                      onEdit={() => setEditing(selected)}
                      onDelete={() => remove(selected)}
                    />
                  </motion.div>
                ) : (
                  <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="liquid rounded-3xl">
                    <EmptyState icon={<FileText size={24} />} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* 移动端：Sheet */}
      {!isLg && (
        <Sheet
          open={sheetOpen && !!selected}
          onClose={() => setSheetOpen(false)}
          wide
          title={selected ? <DetailHead item={selected} compact /> : null}
        >
          {selected && (
            <PaperDetail
              item={selected}
              authed={authed}
              author={author}
              onAuthor={filterAuthor}
              onEdit={() => { setEditing(selected); setSheetOpen(false) }}
              onDelete={() => remove(selected)}
              hideHead
            />
          )}
        </Sheet>
      )}

      <PaperEditor
        open={creating || !!editing}
        item={editing}
        onClose={() => { setCreating(false); setEditing(null) }}
      />

      <BibtexModal open={bibtex} onClose={() => setBibtex(false)} bib={bib} count={filtered.length} />
    </div>
  )
}

/* ---------------- 状态漏斗：分段渐变条 ---------------- */

function Funnel({ funnel, total, status, onPick }: {
  funnel: { key: (typeof FUNNEL)[number]; n: number }[]; total: number; status: string; onPick: (k: string) => void
}) {
  return (
    <LayoutGroup id="paper-funnel">
      <div className="liquid rounded-2xl p-2">
        <div className="flex gap-1.5">
          {funnel.map((f, i) => {
            const active = status === f.key
            const dim = status !== 'all' && !active
            return (
              <motion.button
                key={f.key}
                onClick={() => onPick(f.key)}
                whileTap={{ scale: 0.97 }}
                className={cn('group relative flex min-h-[52px] min-w-[58px] flex-col justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-opacity',
                  dim && 'opacity-45 hover:opacity-80')}
                style={{ flex: `${Math.max(f.n, total * 0.12)} 1 0%` }}
                aria-pressed={active}
                aria-label={`${STATUSES[f.key].label} ${f.n}`}
              >
                {active && (
                  <motion.span
                    layoutId="paper-funnel-active"
                    className="absolute inset-0 rounded-xl bg-slate-900/6 ring-1 ring-indigo-300/35"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <motion.span
                  className="relative block h-2 origin-left rounded-full"
                  style={{ background: FUNNEL_BG[f.key], boxShadow: f.n ? '0 0 14px -2px rgb(129 140 248 / 0.55)' : undefined, opacity: f.n ? 1 : 0.25 }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.7, delay: i * 0.08, ease: EASE }}
                />
                <span className="relative flex items-baseline justify-between gap-1.5">
                  <span className="truncate text-[11px] text-slate-600 group-hover:text-slate-700">{STATUSES[f.key].label}</span>
                  <span className="num text-[15px] font-semibold text-slate-900/90">{f.n}</span>
                </span>
              </motion.button>
            )
          })}
        </div>
      </div>
    </LayoutGroup>
  )
}

/* ---------------- 列表行 ---------------- */

function PaperRow({ p, active, onOpen }: { p: PaperItem; active: boolean; onOpen: () => void }) {
  const pdf = pdfOf(p)
  const year = (p.pubDate ?? '').slice(0, 4)
  return (
    <button
      onClick={onOpen}
      data-active={active ? 'true' : undefined}
      className="spotlight group relative flex min-h-[56px] w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left"
      aria-current={active ? 'true' : undefined}
    >
      {active && (
        <motion.span
          layoutId="paper-row-active"
          data-active="true"
          className="grad-border absolute inset-0 rounded-xl bg-gradient-to-r from-sky-300/[0.09] via-indigo-400/[0.09] to-purple-400/[0.09]"
          transition={{ type: 'spring', stiffness: 400, damping: 36 }}
        />
      )}
      <span className="pointer-events-none absolute inset-0 rounded-xl bg-slate-900/4 opacity-0 transition-opacity group-hover:opacity-100" />
      <span className="relative min-w-0 flex-1">
        <span className={cn('line-clamp-2 text-[13.5px] leading-snug transition-colors',
          active ? 'text-slate-900' : 'text-slate-900/80 group-hover:text-slate-900')}>
          {p.title}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-slate-500">
          <span className="truncate">{p.venue || '—'}</span>
          {year && <><span className="opacity-50">·</span><span className="num shrink-0">{year}</span></>}
          {pdf && <FileText size={11} className="shrink-0 text-violet-600" aria-label="PDF" />}
        </span>
      </span>
      <span className="relative shrink-0 pt-0.5"><StatusBadge status={p.status} /></span>
    </button>
  )
}

/* ---------------- 详情 ---------------- */

function DetailHead({ item, compact }: { item: PaperItem; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={item.status} />
        {item.type && <span className="label">{TYPE_LABEL[item.type] ?? item.type}</span>}
        {item.level && <span className="rounded-full border border-indigo-300/25 bg-indigo-400/10 px-2 py-0.5 text-[10.5px] text-slate-700">{item.level}</span>}
        {item.pubDate && <span className="num text-[11px] text-slate-500">{item.pubDate}</span>}
      </div>
      <h2 className={cn('mt-2.5 font-medium leading-snug text-slate-900/95', compact ? 'text-[16px]' : 'text-[20px]')}>{item.title}</h2>
    </div>
  )
}

function CopyBtn({ text, label, children, className }: { text: string; label: string; children?: React.ReactNode; className?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1400) } catch {}
      }}
      className={cn('btn', className)}
      aria-label={label} title={label}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={String(ok)}
          initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="flex items-center"
        >
          {ok ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
        </motion.span>
      </AnimatePresence>
      {children}
    </button>
  )
}

function PaperDetail({ item, authed, author, onAuthor, onEdit, onDelete, hideHead }: {
  item: PaperItem; authed: boolean; author: string | null; onAuthor: (a: string) => void
  onEdit: () => void; onDelete: () => void; hideHead?: boolean
}) {
  const pdf = pdfOf(item)
  const others = item.attachments.filter((a) => a.id !== pdf?.id && a.file)

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        {!hideHead && <div className="min-w-0 flex-1"><DetailHead item={item} /></div>}
        <div className={cn('flex shrink-0 items-center gap-1', hideHead && 'ml-auto')}>
          <CopyBtn text={buildBibtex([item])} label="复制 BibTeX" className="btn-ghost h-10 w-10 justify-center p-0" />
          {authed && (
            <>
              <button onClick={onEdit} className="btn btn-ghost h-10 w-10 justify-center p-0" aria-label="编辑" title="编辑">
                <Pencil size={14} />
              </button>
              <button onClick={onDelete} className="btn btn-ghost btn-danger h-10 w-10 justify-center p-0" aria-label="删除" title="删除">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {item.authors && item.authors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.authors.map((a) => (
            <button
              key={a}
              onClick={() => onAuthor(a)}
              className="chip min-h-[32px]"
              data-active={author === a ? 'true' : undefined}
              title={`@${a}`}
            >
              <AtSign size={11} className="opacity-60" />{a}
            </button>
          ))}
        </div>
      )}

      {(item.venue || item.doi || item.url) && (
        <dl className="grid gap-2 sm:grid-cols-2">
          {item.venue && (
            <div className="liquid flex min-w-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 sm:col-span-2">
              <BookOpen size={14} className="shrink-0 text-sky-600" aria-label="发表处" />
              <dd className="min-w-0 truncate text-[13.5px] text-slate-900/85">{item.venue}</dd>
            </div>
          )}
          {item.doi && (
            <div className="liquid flex min-w-0 items-center gap-2 rounded-xl py-1 pl-3.5 pr-1">
              <span className="shrink-0 text-[10.5px] font-semibold tracking-wider text-indigo-500">DOI</span>
              <a
                href={`https://doi.org/${item.doi}`}
                target="_blank" rel="noreferrer"
                className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-900/75 hover:text-slate-900"
              >
                {item.doi}
              </a>
              <CopyBtn text={item.doi} label="复制 DOI" className="btn-ghost h-9 w-9 shrink-0 justify-center p-0" />
            </div>
          )}
          {item.url && (
            <a
              href={item.url}
              target="_blank" rel="noreferrer"
              className="liquid liquid-hover flex min-h-[44px] min-w-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5"
            >
              <ExternalLink size={14} className="shrink-0 text-violet-600" />
              <span className="min-w-0 truncate text-[12.5px] text-slate-700">{item.url.replace(/^https?:\/\//, '')}</span>
            </a>
          )}
        </dl>
      )}

      {item.abstract && (
        <section>
          <div className="hairline mb-4" />
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-600">{item.abstract}</p>
        </section>
      )}

      {pdf?.file && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-violet-600" />
            <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600">{pdf.file.originalName}</span>
            <a href={fileUrl(pdf.file, true)} target="_blank" rel="noreferrer" className="btn btn-ghost h-10 w-10 justify-center p-0" aria-label="新窗口打开" title="↗">
              <ExternalLink size={14} />
            </a>
            <a href={fileUrl(pdf.file)} className="btn btn-sm shine h-10 justify-center" aria-label="下载 PDF" title="下载 PDF">
              <Download size={14} /> PDF
            </a>
          </div>
          <iframe
            src={fileUrl(pdf.file, true)}
            className="h-[60vh] w-full rounded-2xl border border-slate-900/10 bg-white lg:h-[70vh]"
            title={pdf.file.originalName}
          />
        </section>
      )}

      {others.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Paperclip size={13} /><span className="num text-[11px]">{others.length}</span>
          </div>
          <ul className="space-y-2">
            {others.map((a) => (
              <li key={a.id}>
                <a
                  href={fileUrl(a.file!)}
                  className="liquid liquid-hover spotlight flex min-h-[48px] items-center gap-3 rounded-xl px-3.5 py-2.5"
                  aria-label={`下载 ${a.file!.originalName}`}
                >
                  <FileText size={14} className="shrink-0 text-sky-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-slate-900/80">{a.caption || a.file!.originalName}</span>
                    <span className="num text-[10.5px] text-slate-500">{formatBytes(a.file!.size)}</span>
                  </span>
                  <Download size={14} className="shrink-0 text-slate-600" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/* ---------------- BibTeX ---------------- */

export function buildBibtex(list: PaperItem[]): string {
  return list.map((p) => {
    const first = (p.authors?.[0] ?? 'unknown').split(/\s+/).pop() ?? 'unknown'
    const key = `${first}${(p.pubDate ?? '').slice(0, 4)}${p.id}`
      .replace(/[^A-Za-z0-9]/g, '')
    const type = p.type === 'conference' ? 'inproceedings' : p.type === 'preprint' ? 'misc' : 'article'
    const lines = [
      `@${type}{${key},`,
      `  title     = {${p.title}},`,
      p.authors?.length ? `  author    = {${p.authors.join(' and ')}},` : null,
      p.venue ? `  ${p.type === 'conference' ? 'booktitle' : 'journal'} = {${p.venue}},` : null,
      p.pubDate ? `  year      = {${p.pubDate.slice(0, 4)}},` : null,
      p.doi ? `  doi       = {${p.doi}},` : null,
      p.url ? `  url       = {${p.url}},` : null,
      `}`,
    ].filter(Boolean)
    return lines.join('\n')
  }).join('\n\n')
}

function BibtexModal({ open, onClose, bib, count }: { open: boolean; onClose: () => void; bib: string; count: number }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Quote size={16} className="text-indigo-500" />
          BibTeX
          <span className="num rounded-full border border-indigo-300/20 bg-indigo-400/10 px-2 py-0.5 text-[11px] text-slate-600">{count}</span>
        </h2>
      }
    >
      <div className="space-y-4">
        <textarea
          readOnly value={bib} rows={18}
          aria-label="BibTeX"
          className="field resize-none font-mono text-[11.5px] leading-relaxed"
        />
        <div className="flex gap-2">
          <CopyBtn text={bib} label="复制全部" className="btn-primary shine h-10 w-10 justify-center p-0" />
          <a
            href={`data:application/x-bibtex;charset=utf-8,${encodeURIComponent(bib)}`}
            download="references.bib"
            className="btn h-10 justify-center"
            aria-label="下载 .bib" title="下载 .bib"
          >
            <Download size={14} /> .bib
          </a>
        </div>
      </div>
    </Sheet>
  )
}
