import { Megaphone, History, Keyboard } from 'lucide-react'
import { isAuthed, getSetting } from '@/lib/auth'
import { dirSize, UPLOAD_DIR } from '@/lib/storage'
import { STORAGE_QUOTA } from '@/lib/upload'
import { getHomeData } from '@/lib/stats'
import { Hero } from '@/components/public/home/hero'
import { Stats } from '@/components/public/home/stats'
import { Bento } from '@/components/public/home/bento'
import { Timeline } from '@/components/public/home/timeline'
import { QuickText } from '@/components/public/home/quick-text'

export const dynamic = 'force-dynamic'

function Section({ icon: Icon, title, children, className, i = 0, id }: {
  icon: React.ElementType; title: string; children: React.ReactNode; className?: string; i?: number; id?: string
}) {
  return (
    <section id={id} className={className}>
      <h2 className="enter mb-4 flex items-center gap-2 text-[15px] font-semibold text-slate-800" style={{ ['--i' as string]: i }}>
        <Icon size={16} className="text-indigo-500" /> {title}
      </h2>
      {children}
    </section>
  )
}

export default async function Home() {
  const authed = await isAuthed()
  const [line, title, subtitle, notice] = await Promise.all([
    getSetting('hero_line'), getSetting('site_title'), getSetting('site_subtitle'), getSetting('announcement'),
  ])
  const d = getHomeData(authed)
  const used = dirSize(UPLOAD_DIR)
  const now = Date.now()

  return (
    <div className="space-y-12 md:space-y-16">
      {notice?.trim() && (
        <div className="enter liquid flex items-start gap-3 rounded-2xl px-4 py-3 text-[13.5px] text-slate-700">
          <Megaphone size={16} className="mt-0.5 shrink-0 text-violet-500" />
          <span className="whitespace-pre-line">{notice.trim()}</span>
        </div>
      )}

      <Hero
        title={title ?? 'Foliage'}
        line={line ?? ''}
        subtitle={subtitle ?? ''}
        links={d.links.top.map((l) => ({ id: l.id, title: l.title, url: l.url }))}
        files={d.files.recent.map((f) => ({ id: f.id, name: !authed && f.sharePassword ? '••••••' : f.originalName, size: f.size }))}
        counts={{ links: d.links.count, files: d.files.count, used }}
      />

      <Stats
        links={{ count: d.links.count, week: d.links.week }}
        files={{ count: d.files.count, bytes: d.files.bytes }}
        used={used}
        quota={STORAGE_QUOTA()}
        trend={d.trend}
        clicks={d.links.clicks}
      />

      <Bento
        data={{
          authed,
          links: { count: d.links.count, top: d.links.top.map((l) => ({ id: l.id, title: l.title, url: l.url })) },
          files: {
            count: d.files.count,
            recent: d.files.recent.map((f) => ({ id: f.id, name: !authed && f.sharePassword ? '••••••' : f.originalName, size: f.size })),
          },
          competitions: d.competitions,
          papers: d.papers,
        }}
      />

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <Section icon={History} title="最近动态">
          <div className="liquid rounded-3xl p-3 sm:p-4">
            <Timeline items={d.activity} now={now} />
          </div>
        </Section>
        <div className="space-y-6">
          <Section icon={Keyboard} title="快传一段文字" i={1} id="quick">
            <QuickText />
          </Section>
        </div>
      </div>
    </div>
  )
}
