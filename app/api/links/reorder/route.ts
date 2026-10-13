import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { eq } from 'drizzle-orm'
import { parseBody } from '@/lib/validate'

export const runtime = 'nodejs'

const body = z.object({ ids: z.array(z.coerce.number().int().positive()).max(5000) })

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const r = await parseBody(req, body)
  if ('res' in r) return r.res
  const { ids } = r.data

  // 一个事务：中途失败不会留下排了一半的顺序，也只做一次 fsync
  db.transaction((tx) => {
    ids.forEach((id, i) => tx.update(schema.links).set({ sort: i }).where(eq(schema.links.id, id)).run())
  })
  return NextResponse.json({ ok: true })
}
