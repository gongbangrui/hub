'use client'
import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Loader2, Check, X, FileCode2, ClipboardPaste, FolderTree, RotateCw, ArrowRight, Copy } from 'lucide-react'
import { Modal } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

const EASE = [0.22, 1, 0.36, 1] as const

export function LinkImporter() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pasted, setPasted] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [drag, setDrag] = useState(false)
  const [createFolders, setCreateFolders] = useState(true)
  const [result, setResult] = useState<{ imported: number; skipped: number; folders: number } | null>(null)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function run(html: string) {
    if (!html.trim()) return setErr('∅')
    setBusy(true); setErr(''); setResult(null)
    const res = await fetch('/api/links/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, createFolders }),
    })
    setBusy(false)
    if (!res.ok) return setErr('失败')
    setResult(await res.json())
  }

  async function fromFile(f?: File | null) {
    if (!f) return
    await run(await f.text())
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setResult(null); setErr('') }}
        className="btn btn-sm min-h-10"
        aria-label="导入书签"
        title="导入书签"
      >
        <Upload size={14} /> 导入
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={<span className="flex items-center gap-2"><Upload size={15} className="text-indigo-200/70" /> 导入</span>}
        className="max-w-xl"
      >
        <div className="space-y-4">
          <motion.button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); fromFile(e.dataTransfer.files?.[0]) }}
            whileTap={{ scale: 0.98 }}
            data-active={drag}
            aria-label="选择 bookmarks.html"
            className={cn(
              'liquid liquid-hover spotlight grad-border flex w-full flex-col items-center gap-2 rounded-2xl border-dashed py-10',
              drag && 'scale-[1.01]',
            )}
          >
            <motion.span
              animate={drag ? { y: -4, scale: 1.1 } : { y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18 }}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-300/25 via-indigo-400/20 to-purple-400/25 text-indigo-100"
            >
              <FileCode2 size={22} />
            </motion.span>
            <span className="font-mono text-[12.5px] text-indigo-100/60">bookmarks.html</span>
          </motion.button>
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm,text/html"
            hidden
            onChange={(e) => { fromFile(e.target.files?.[0]); e.target.value = '' }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPaste((v) => !v)}
              data-active={showPaste}
              aria-expanded={showPaste}
              className="chip min-h-10 px-4"
            >
              <ClipboardPaste size={13} /> 粘贴
            </button>
            <button
              type="button"
              onClick={() => setCreateFolders((v) => !v)}
              data-active={createFolders}
              aria-pressed={createFolders}
              aria-label="文件夹建为分类"
              title="文件夹建为分类"
              className="chip min-h-10 px-4"
            >
              <FolderTree size={13} /> → 分类
              {createFolders && <Check size={12} className="text-violet-200" />}
            </button>
          </div>

          <AnimatePresence initial={false}>
            {showPaste && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="relative pt-1">
                  <textarea
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    rows={5}
                    placeholder="<!DOCTYPE NETSCAPE-Bookmark-file-1>"
                    className="field resize-none pr-14 font-mono text-[11px]"
                  />
                  <button
                    onClick={() => run(pasted)}
                    disabled={busy}
                    className="btn btn-primary btn-icon absolute bottom-3 right-3 h-10 w-10"
                    aria-label="导入"
                    title="导入"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={15} />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {busy && (
              <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="shimmer liquid flex h-14 items-center justify-center rounded-2xl text-indigo-100/60">
                <Loader2 size={16} className="animate-spin" />
              </motion.div>
            )}
            {result && !busy && (
              <motion.div
                key="ok"
                initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="liquid flex flex-wrap items-center gap-3 rounded-2xl p-3.5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
                  <Check size={17} />
                </span>
                <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                  <span className="num text-white/90" title="导入">＋{result.imported}</span>
                  {result.folders > 0 && (
                    <span className="num flex items-center gap-1 text-indigo-100/60" title="新分类"><FolderTree size={12} />{result.folders}</span>
                  )}
                  {result.skipped > 0 && (
                    <span className="num flex items-center gap-1 text-indigo-100/35" title="重复跳过"><Copy size={12} />{result.skipped}</span>
                  )}
                </div>
                <button onClick={() => location.reload()} className="btn btn-primary btn-icon h-10 w-10" aria-label="刷新" title="刷新">
                  <RotateCw size={15} />
                </button>
              </motion.div>
            )}
            {err && !busy && (
              <motion.p key="err" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-1.5 text-[12.5px] text-rose-300">
                <X size={12} /> {err}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </Modal>
    </>
  )
}
