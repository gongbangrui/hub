import { isAuthed, getSetting, ensureInit } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/public/login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await isAuthed()) redirect('/admin')
  await ensureInit()
  const title = (await getSetting('site_title')) ?? 'Foliage'
  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-16">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.22),rgba(56,189,248,0.12)_45%,transparent_70%)]" />
      <LoginForm title={title} />
    </div>
  )
}
