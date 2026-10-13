import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { eq } from 'drizzle-orm'
import { isAuthed } from '@/lib/auth'
import { readVisitorId } from '@/lib/file-access'
import { GUEST_TTL_MS } from '@/lib/upload'

export const runtime = 'nodejs'

const MAX_LIFETIME_MS = 3 * GUEST_TTL_MS // 自创建起最多保留 72 小时

/** 访客给自己的临时文件续期 24 小时(上限 72 小时) */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fileId = Number(id)
  if (!Number.isInteger(fileId) || fileId <= 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const row = await db.select().from(schema.files).where(eq(schema.files.id, fileId)).get()
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })

  const authed = await isAuthed()
  const vid = authed ? null : await readVisitorId()
  const mine = !!vid && row.owner === 'guest' && row.uploaderId === vid
  if (!authed && !mine) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  if (!row.expiresAt) return NextResponse.json({ error: '这个文件没有过期时间' }, { status: 400 })

  const now = Date.now()
  if (row.expiresAt.getTime() < now) return NextResponse.json({ error: '已过期' }, { status: 410 })

  const cap = authed ? Infinity : row.createdAt.getTime() + MAX_LIFETIME_MS
  const next = new Date(Math.min(row.expiresAt.getTime() + GUEST_TTL_MS, cap))
  if (next.getTime() <= row.expiresAt.getTime()) {
    return NextResponse.json({ error: '已达到最长保留时间' }, { status: 400 })
  }
  await db.update(schema.files).set({ expiresAt: next }).where(eq(schema.files.id, fileId))
  return NextResponse.json({ ok: true, expiresAt: next.toISOString() })
}
