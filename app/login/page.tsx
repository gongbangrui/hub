import { isAuthed, getSetting } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/public/login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await isAuthed()) redirect('/admin')
  const title = (await getSetting('site_title')) ?? 'Foliage'
  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-16">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_90deg,rgba(125,211,252,0.25),rgba(129,140,248,0.2),rgba(192,132,252,0.25),rgba(125,211,252,0.25))] blur-[90px]" />
      <LoginForm title={title} />
    </div>
  )
}
