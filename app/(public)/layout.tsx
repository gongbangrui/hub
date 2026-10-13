import { isAuthed, getSetting, ensureInit } from '@/lib/auth'
import { SiteNav } from '@/components/public/site-nav'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  await ensureInit()
  const [authed, title, footer] = await Promise.all([isAuthed(), getSetting('site_title'), getSetting('footer_note')])
  return (
    <>
      <SiteNav authed={authed} title={title ?? 'Foliage'} />
      <div className="lg:pl-[100px]">
        <main className="mx-auto w-full max-w-7xl px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">{children}</main>
        {footer?.trim() && (
          <footer className="mx-auto max-w-7xl px-4 pb-28 text-center text-[12px] text-slate-400 sm:px-6 lg:px-10 lg:pb-10">{footer.trim()}</footer>
        )}
      </div>
    </>
  )
}
