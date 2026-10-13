import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { isAuthed } from '@/lib/auth'
import { removeStored, removeThumbs, CHUNK_DIR, invalidateDirSize, newestMtime } from '@/lib/storage'
import { lt, isNotNull, and, eq } from 'drizzle-orm'
import fs from 'node:fs'
import { timingSafeEqual } from 'node:crypto'

function sameKey(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export const runtime = 'nodejs'

/** 清理过期文件。支持 ?key=CRON_KEY 供宝塔计划任务无人值守调用。 */
export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  const cronOk = !!process.env.CRON_KEY && !!key && sameKey(key, process.env.CRON_KEY)
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
    removeThumbs(f.id)
  }

  // 顺带清掉超过 2 天没人续传的残片
  let orphaned = 0
  if (fs.existsSync(CHUNK_DIR)) {
    const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000
    for (const dir of fs.readdirSync(CHUNK_DIR)) {
      const p = `${CHUNK_DIR}/${dir}`
      try {
        // 用目录内最新的分片 mtime，而不是目录自身的 mtime：
        // 单个大文件的分片是往已存在的文件上写，目录 mtime 一直停在创建时刻，
        // 会把这个还在续传的会话当成残片删掉
        const last = newestMtime(p) || fs.statSync(p).mtimeMs
        if (last < cutoff) { fs.rmSync(p, { recursive: true, force: true }); orphaned++ }
      } catch {}
    }
  }

  // 分片也可能被清掉，同样要让目录大小缓存失效
  if (expired.length || orphaned) invalidateDirSize()

  return NextResponse.json({ removed: expired.length, bytes, orphaned })
}
