'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { m as motion } from 'framer-motion'
import {
  Bookmark, ArrowLeftRight, Trophy, FileText, Home, LayoutGrid, LogIn, LogOut, Search, CornerDownLeft,
  UploadCloud, Plus, Link2, Keyboard, Clock, ExternalLink, Loader2, SearchX,
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { Modal } from '@/components/ui/primitives'

const SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const
const RECENT_KEY = 'hub.recent.v1'

type Cmd = {
  key: string; group: string; label: string; hint?: string; icon: React.ElementType; run: () => void; keywords?: string
}
type Results = {
  links: { id: number; title: string; url: string; host: string }[]
  files: { id: number; name: string; size: number; code: string | null; mine: boolean }[]
  competitions: { id: number; name: string; sub: string | null }[]
  papers: { id: number; title: string; sub: string | null }[]
}

type Recent = { key: string; label: string; href: string; kind: string }
function readRecent(): Recent[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}

export default function CommandPalette({ open, onClose, authed }: { open: boolean; onClose: () => void; authed: boolean }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const [res, setRes] = useState<Results | null>(null)
  const [loading, setLoading] = useState(false)
  const [recent, setRecent] = useState<Recent[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const go = useCallback((href: string) => { onClose(); router.push(href) }, [onClose, router])

  const remember = useCallback((item: Recent) => {
    try {
      const old = readRecent()
      const next = [item, ...old.filter((x) => x.key !== item.key)].slice(0, 5)
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch { /* 隐私模式 */ }
  }, [])

  // ---- 静态命令 ----
  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { key: 'go:/', group: '跳转', label: '首页', hint: 'g h', icon: Home, run: () => go('/'), keywords: 'home shouye' },
      { key: 'go:/links', group: '跳转', label: '收藏夹', hint: 'g l', icon: Bookmark, run: () => go('/links'), keywords: 'links shoucang' },
      { key: 'go:/files', group: '跳转', label: '中转站', hint: 'g f', icon: ArrowLeftRight, run: () => go('/files'), keywords: 'files zhongzhuan' },
      { key: 'go:/competitions', group: '跳转', label: '竞赛', hint: 'g c', icon: Trophy, run: () => go('/competitions'), keywords: 'competitions jingsai' },
      { key: 'go:/papers', group: '跳转', label: '论文', hint: 'g p', icon: FileText, run: () => go('/papers'), keywords: 'papers lunwen' },
      { key: 'act:upload', group: '操作', label: '上传文件', icon: UploadCloud, run: () => go('/files?upload=1'), keywords: 'upload shangchuan' },
      { key: 'act:text', group: '操作', label: '文本快传', icon: Keyboard, run: () => go('/#quick'), keywords: 'text paste' },
      {
        key: 'act:copy', group: '操作', label: '复制站点链接', icon: Link2, keywords: 'copy url',
        run: () => { onClose(); navigator.clipboard?.writeText(location.origin).catch(() => {}) },
      },
    ]
    if (authed) {
      list.push(
        { key: 'act:newlink', group: '操作', label: '新建收藏', icon: Plus, run: () => go('/links?new=1'), keywords: 'new link' },
        { key: 'go:/admin', group: '账号', label: '后台', icon: LayoutGrid, run: () => go('/admin'), keywords: 'admin houtai' },
        {
          key: 'act:logout', group: '账号', label: '退出登录', icon: LogOut, keywords: 'logout',
          run: async () => { onClose(); await fetch('/api/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/' },
        },
      )
    } else {
      list.push({ key: 'go:/login', group: '账号', label: '登录', icon: LogIn, run: () => go('/login'), keywords: 'login denglu' })
    }
    return list
  }, [authed, go, onClose])

  // ---- 打开时重置 ----
  useEffect(() => {
    if (!open) return
    setQ(''); setIdx(0); setRes(null)
    setRecent(readRecent())
    const t = setTimeout(() => inputRef.current?.focus(), 40)
    return () => clearTimeout(t)
  }, [open])

  // ---- 防抖搜索 ----
  useEffect(() => {
    const s = q.trim()
    if (!s) { setRes(null); setLoading(false); return }
    setLoading(true)
    const ac = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(s)}`, { signal: ac.signal })
        if (r.ok) setRes(await r.json())
      } catch { /* 被新查询取消 */ }
      if (!ac.signal.aborted) setLoading(false)
    }, 170)
    return () => { clearTimeout(t); ac.abort() }
  }, [q])

  // ---- 组装可选项 ----
  const items = useMemo<Cmd[]>(() => {
    const s = q.trim().toLowerCase()
    if (!s) {
      const rec: Cmd[] = recent.map((r) => ({
        key: `rec:${r.key}`, group: '最近', label: r.label, icon: Clock, hint: r.kind,
        run: () => (r.href.startsWith('http') ? window.open(r.href, '_blank', 'noopener') : go(r.href)),
      }))
      return [...rec, ...commands]
    }
    const out: Cmd[] = []
    for (const l of res?.links ?? []) {
      out.push({
        key: `link:${l.id}`, group: '收藏', label: l.title, hint: l.host, icon: Bookmark,
        run: () => {
          remember({ key: `link:${l.id}`, label: l.title, href: l.url, kind: l.host })
          fetch('/api/links/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id }), keepalive: true }).catch(() => {})
          onClose(); window.open(l.url, '_blank', 'noopener')
        },
      })
    }
    for (const f of res?.files ?? []) {
      out.push({
        key: `file:${f.id}`, group: '文件', label: f.name, hint: `${f.mine ? '我的 · ' : ''}${formatBytes(f.size)}`, icon: ArrowLeftRight,
        run: () => { remember({ key: `file:${f.id}`, label: f.name, href: f.code ? `/s/${f.code}` : '/files', kind: '文件' }); go(f.code ? `/s/${f.code}` : '/files') },
      })
    }
    for (const c of res?.competitions ?? []) {
      out.push({ key: `comp:${c.id}`, group: '竞赛', label: c.name, hint: c.sub ?? undefined, icon: Trophy, run: () => go('/competitions') })
    }
    for (const p of res?.papers ?? []) {
      out.push({ key: `paper:${p.id}`, group: '论文', label: p.title, hint: p.sub ?? undefined, icon: FileText, run: () => go('/papers') })
    }
    const cmds = commands.filter((c) => (c.label + ' ' + (c.keywords ?? '')).toLowerCase().includes(s))
    return [...out, ...cmds]
  }, [q, res, recent, commands, go, onClose, remember])

  useEffect(() => { setIdx(0) }, [q, res])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); items[idx]?.run() }
  }

  // 分组标题只在组首出现
  let lastGroup = ''

  return (
    <Modal open={open} onClose={onClose} className="max-w-xl">
      <div className="-mx-2 -my-1" onKeyDown={onKey}>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索链接、文件、竞赛、论文,或输入命令…"
            aria-label="搜索"
            className="field h-12 pl-10 pr-14 text-[15px]"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {loading ? <Loader2 size={15} className="animate-spin text-indigo-500" /> : <kbd className="kbd">esc</kbd>}
          </span>
        </div>

        <ul ref={listRef} className="mt-3 max-h-[52vh] overflow-y-auto pr-1" role="listbox">
          {items.map((c, i) => {
            const head = c.group !== lastGroup
            lastGroup = c.group
            return (
              <li key={c.key} role="option" aria-selected={i === idx}>
                {head && <div className="label px-3 pb-1 pt-3">{c.group}</div>}
                <button
                  data-i={i}
                  onMouseMove={() => idx !== i && setIdx(i)}
                  onClick={() => c.run()}
                  className={cn(
                    'relative flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] transition-colors',
                    i === idx ? 'text-slate-900' : 'text-slate-600',
                  )}
                >
                  {i === idx && (
                    <motion.span layoutId="palette-hl" transition={SPRING}
                      className="absolute inset-0 -z-10 rounded-xl border border-indigo-300/40 bg-[image:var(--grad-soft)]" />
                  )}
                  <c.icon size={16} className={cn('shrink-0', i === idx ? 'text-indigo-600' : 'text-slate-400')} />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.hint && <span className="shrink-0 font-mono text-[11px] text-slate-400">{c.hint}</span>}
                  {i === idx && (c.key.startsWith('link:') ? <ExternalLink size={13} className="text-slate-400" /> : <CornerDownLeft size={13} className="text-slate-400" />)}
                </button>
              </li>
            )
          })}
          {q.trim() && !loading && items.length === 0 && (
            <li className="flex flex-col items-center gap-2 py-10 text-slate-400">
              <SearchX size={26} strokeWidth={1.5} />
              <span className="text-[13px]">没有找到「{q.trim()}」</span>
            </li>
          )}
        </ul>

        <div className="mt-3 flex items-center justify-between border-t border-slate-900/[0.06] px-2 pt-3 text-[11.5px] text-slate-400">
          <span className="flex items-center gap-3">
            <span><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> 选择</span>
            <span><kbd className="kbd">↵</kbd> 打开</span>
          </span>
          <span>按 <kbd className="kbd">?</kbd> 查看快捷键</span>
        </div>
      </div>
    </Modal>
  )
}
