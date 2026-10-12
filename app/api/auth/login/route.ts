import { NextResponse, type NextRequest } from 'next/server'
import { checkRate, clearFails, clientIp, createSession, getSetting, recordFail, verifyPassword } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers)

  const locked = checkRate(ip)
  if (locked > 0) {
    return NextResponse.json({ error: `再等 ${locked} 秒` }, { status: 429 })
  }

  const { password } = await req.json().catch(() => ({ password: '' }))
  if (typeof password !== 'string' || !password) {
    return NextResponse.json({ error: '请输入口令' }, { status: 400 })
  }

  const hash = await getSetting('password_hash')
  if (!hash || !verifyPassword(password, hash)) {
    recordFail(ip)
    return NextResponse.json({ error: '口令不对' }, { status: 401 })
  }

  clearFails(ip)
  await createSession()
  return NextResponse.json({ ok: true })
}
