import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { removeStored, CHUNK_DIR, invalidateDirSize } from '@/lib/storage'
import { lt, isNotNull, and, eq } from 'drizzle-orm'
import fs from 'node:fs'

export const runtime = 'nodejs'

/** 清理过期文件。支持 ?key=CRON_KEY 供宝塔计划任务无人值守调用。 */
export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  const cronOk = !!process.env.CRON_KEY && key === process.env.CRON_KEY
  if (!cronOk && !(await isAuthed())) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const expired = await db.select().from(schema.files)
    .where(and(isNotNull(schema.files.expiresAt), lt(schema.files.expiresAt, new Date())))

  let bytes = 0
  for (const f of expired) {
    bytes += f.size
    await db.delete(schema.attachments).where(eq(schema.attachments.fileId, f.id))
    await db.delete(schema.files).where(eq(schema.files.id, f.id))
    removeStored(f.storedPath)
  }

  // 顺带清掉超过 2 天没人续传的残片
  let orphaned = 0
  if (fs.existsSync(CHUNK_DIR)) {
    const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000
    for (const dir of fs.readdirSync(CHUNK_DIR)) {
      const p = `${CHUNK_DIR}/${dir}`
      try {
        if (fs.statSync(p).mtimeMs < cutoff) { fs.rmSync(p, { recursive: true, force: true }); orphaned++ }
      } catch {}
    }
  }

  if (expired.length) invalidateDirSize()

  return NextResponse.json({ removed: expired.length, bytes, orphaned })
}
