import { NextResponse, type NextRequest } from 'next/server'
import { getSetting, isAuthed, setSetting, verifyPassword, hashPassword } from '@/lib/auth'

export const runtime = 'nodejs'

const PUBLIC_KEYS = ['site_title', 'site_subtitle', 'hero_line', 'footer_note']
const MAX_LEN = 300

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const b = await req.json()

  // ---- 改口令 ----
  if (b.newPassword) {
    const current = await getSetting('password_hash')
    if (!current || !verifyPassword(String(b.currentPassword ?? ''), current)) {
      return NextResponse.json({ error: '当前口令不对' }, { status: 401 })
    }
    if (String(b.newPassword).length < 6) {
      return NextResponse.json({ error: '新口令太短' }, { status: 400 })
    }
    await setSetting('password_hash', hashPassword(String(b.newPassword)))
    return NextResponse.json({ ok: true, passwordChanged: true })
  }

  // ---- 改站点文案 ----
  const changed: string[] = []
  for (const k of PUBLIC_KEYS) {
    if (typeof b[k] === 'string') {
      await setSetting(k, b[k].slice(0, MAX_LEN))
      changed.push(k)
    }
  }
  if (!changed.length) return NextResponse.json({ error: '没有要保存的内容' }, { status: 400 })
  return NextResponse.json({ ok: true, changed })
}
