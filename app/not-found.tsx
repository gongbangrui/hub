import Link from 'next/link'
import { Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-8 overflow-hidden px-6 text-center">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.2),rgba(56,189,248,0.1)_45%,transparent_70%)]" />
      <h1 className="rise num text-grad text-grad-anim select-none text-[clamp(7rem,28vw,15rem)] font-bold leading-none tracking-[-0.06em]">
        404
      </h1>
      <Link href="/" className="rise btn btn-primary shine h-11 px-5" aria-label="首页" title="首页" style={{ animationDelay: '150ms' }}>
        <Home size={16} /> 首页
      </Link>
    </div>
  )
}
