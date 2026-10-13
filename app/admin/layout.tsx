import { redirect } from 'next/navigation'
import { isAuthed, getSetting, ensureInit } from '@/lib/auth'
import { Sidebar } from '@/components/admin/sidebar'
import { Toaster } from '@/components/admin/ui'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // middleware 已拦截，这里是双保险
  if (!(await isAuthed())) redirect('/login?next=/admin')
  await ensureInit()
  const title = (await getSetting('site_title')) ?? 'Foliage'

  return (
    <>
      <Sidebar title={title} />
      <div className="min-w-0 md:pl-[92px] lg:pl-64">
        <main className="mx-auto w-full max-w-[1280px] px-3 pb-32 pt-5 sm:px-6 md:pt-8 lg:px-10 lg:pt-10">{children}</main>
      </div>
      <Toaster />
    </>
  )
}
