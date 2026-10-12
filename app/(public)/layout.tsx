import { isAuthed, getSetting } from '@/lib/auth'
import { SiteNav } from '@/components/public/site-nav'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [authed, title] = await Promise.all([isAuthed(), getSetting('site_title')])
  return (
    <>
      <SiteNav authed={authed} title={title ?? 'Foliage'} />
      <div className="lg:pl-[100px]">
        <main className="mx-auto w-full max-w-7xl px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">{children}</main>
      </div>
    </>
  )
}
