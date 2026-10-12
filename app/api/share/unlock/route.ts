import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { eq, or } from 'drizzle-orm'
import { checkRate, clearFails, clientIp, recordFail } from '@/lib/auth'
import { checkSharePassword, isAttached, setGrant } from '@/lib/file-access'

export const runtime = 'nodejs'

/** 分享口令解锁：通过后种下载凭证 Cookie */
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers)
  const key = `share:${ip}`
  const wait = checkRate(key)
  if (wait > 0) return NextResponse.json({ error: `${wait}s` }, { status: 429 })

  const { code, password } = await req.json().catch(() => ({}))
  if (typeof code !== 'string' || typeof password !== 'string' || !code || !password) {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 })
  }

  const row = await db.select().from(schema.files)
    .where(or(eq(schema.files.shareCode, code), eq(schema.files.token, code))).get()
  if (!row || (await isAttached(row.id))) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  if (!row.sharePassword) return NextResponse.json({ ok: true })

  if (!checkSharePassword(password, row.sharePassword)) {
    recordFail(key)
    return NextResponse.json({ error: 'WRONG' }, { status: 401 })
  }
  clearFails(key)
  await setGrant(row.id)
  return NextResponse.json({ ok: true })
}
