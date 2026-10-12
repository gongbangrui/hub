import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { eq, sql } from 'drizzle-orm'
import { clientIp } from '@/lib/auth'

export const runtime = 'nodejs'

// 普通浏览点不出这么快的频率；这个阈值只挡脚本刷计数
const hits = new Map<string, { n: number; at: number }>()
const MAX_PER_MIN = 60

function throttle(ip: string) {
  const now = Date.now()
  const rec = hits.get(ip)
  if (!rec || now - rec.at > 60_000) {
    if (hits.size > 5000) hits.clear()
    hits.set(ip, { n: 1, at: now })
    return false
  }
  rec.n += 1
  return rec.n > MAX_PER_MIN
}

/** 公开：点一次 +1。收藏夹本来就是公开的，所以不鉴权，只做频率限制。 */
export async function POST(req: NextRequest) {
  if (throttle(clientIp(req.headers))) return NextResponse.json({ ok: false }, { status: 429 })

  const { id } = await req.json().catch(() => ({ id: null }))
  const linkId = Number(id)
  if (!Number.isInteger(linkId) || linkId <= 0) return NextResponse.json({ ok: false }, { status: 400 })

  await db.update(schema.links)
    .set({ clickCount: sql`${schema.links.clickCount} + 1` })
    .where(eq(schema.links.id, linkId))
  return NextResponse.json({ ok: true })
}
