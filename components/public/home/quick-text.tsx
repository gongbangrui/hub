'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ClipboardPaste, Copy, Loader2, RotateCcw, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX = 20000

/** 文本快传:把一段文字生成临时文件,拿到取件码/链接即可在别的设备取。访客 24 小时后清理 */
export function QuickText({ className, compact }: { className?: string; compact?: boolean }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)

  async function send() {
    const body = text.trim()
    if (!body || state === 'sending') return
    setState('sending'); setErr('')
    try {
      const first = body.split('\n')[0].replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 24) || '文本'
      const file = new File([body], `${first}.txt`, { type: 'text/plain' })
      const { uploadFileDirect } = await import('@/lib/upload-direct')
      const out = await uploadFileDirect(file)
      if (!out.shareCode) throw new Error('no code')
      setCode(out.shareCode)
      setState('done')
      router.refresh()
    } catch {
      setErr('发送失败,请重试')
      setState('error')
    }
  }

  async function copy() {
    const link = `${location.origin}/s/${code}`
    try { await navigator.clipboard.writeText(link) } catch { /* 非 https 下不可用 */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  async function paste() {
    try {
      const t = await navigator.clipboard.readText()
      if (t) setText((v) => (v + t).slice(0, MAX))
    } catch { area.current?.focus() }
  }

  if (state === 'done') {
    return (
      <div className={cn('liquid liquid-blur flex flex-col items-center gap-4 rounded-3xl p-6 text-center', className)}>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-600"><Check size={22} strokeWidth={2.4} /></span>
        <div>
          <div className="text-[12px] text-slate-500">取件码</div>
          <div className="num mt-1 select-all font-mono text-4xl font-semibold tracking-[0.18em] text-grad">{code}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={copy} className="btn btn-primary shine h-10 px-4">
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? '已复制' : '复制链接'}
          </button>
          <button onClick={() => { setText(''); setCode(''); setState('idle') }} className="btn h-10 px-4">
            <RotateCcw size={14} /> 再来一条
          </button>
        </div>
        <p className="text-[11.5px] text-slate-400">在「中转站」页面输入取件码即可取回</p>
      </div>
    )
  }

  return (
    <div className={cn('liquid liquid-blur rounded-3xl p-4', className)}>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[13px] font-medium text-slate-700">文本快传</span>
        <button onClick={paste} className="btn btn-ghost btn-sm h-8 gap-1 text-[12px]" title="粘贴剪贴板">
          <ClipboardPaste size={13} /> 粘贴
        </button>
      </div>
      <textarea
        ref={area}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX))}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void send() } }}
        placeholder="粘贴或输入文字,⌘/Ctrl + Enter 发送"
        aria-label="文本内容"
        rows={compact ? 4 : 6}
        className="field resize-none text-[14px] leading-relaxed"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={cn('num text-[11.5px]', text.length > MAX * 0.9 ? 'text-amber-600' : 'text-slate-400')}>{text.length} / {MAX}</span>
        <div className="flex items-center gap-2">
          {err && <span className="text-[12px] text-rose-600">{err}</span>}
          <button onClick={send} disabled={!text.trim() || state === 'sending'} className="btn btn-primary shine h-10 px-4">
            {state === 'sending' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} 生成取件码
          </button>
        </div>
      </div>
    </div>
  )
}
