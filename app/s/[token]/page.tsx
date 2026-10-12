import { db, schema } from '@/db'
import { eq, or } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { ShareLanding } from '@/components/public/share-landing'
import type { Metadata } from 'next'
import { isAuthed } from '@/lib/auth'
import { hasGrant, isAttached } from '@/lib/file-access'

export const dynamic = 'force-dynamic'

async function lookup(token: string) {
  return db.select().from(schema.files)
    .where(or(eq(schema.files.shareCode, token), eq(schema.files.token, token)))
    .get()
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const row = await lookup(token)
  // 加锁文件不在标题里暴露文件名
  return { title: row && !row.sharePassword ? row.originalName : '分享' }
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await lookup(token)
  if (!row) notFound()

  const authed = await isAuthed()
  if (!authed && (await isAttached(row.id))) notFound()
  const locked = !authed && !!row.sharePassword && !(await hasGrant(row.id))

  const expired = row.expiresAt ? row.expiresAt.getTime() < Date.now() : false

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
      <ShareLanding
        file={{
          id: row.id,
          token: row.token,
          code: token,
          // 未解锁时不下发文件名
          name: locked ? '' : row.originalName,
          size: row.size,
          mime: row.mime,
          downloads: row.downloads,
          expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
        }}
        expired={expired}
        locked={locked}
      />
    </div>
  )
}
