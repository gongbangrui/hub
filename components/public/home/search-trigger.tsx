'use client'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 假搜索框:点击即唤起全局 ⌘K 面板(SiteNav 里监听 open-search) */
export function SearchTrigger({ className, label }: { className?: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-search'))}
      className={cn(
        'liquid liquid-blur liquid-hover group flex h-14 w-full items-center gap-3 rounded-2xl px-5 text-left text-slate-500',
        className,
      )}
      aria-label={label}
    >
      <Search size={18} className="shrink-0 text-indigo-500 transition-transform duration-300 group-hover:scale-110" />
      <span className="flex-1 truncate text-[14.5px]">{label}</span>
      <span className="hidden items-center gap-1 sm:flex"><kbd className="kbd">⌘</kbd><kbd className="kbd">K</kbd></span>
    </button>
  )
}
