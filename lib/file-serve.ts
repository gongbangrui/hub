import { NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { eq } from 'drizzle-orm'
import { isAuthed } from '@/lib/auth'
import { guestAccess } from '@/lib/file-access'
import { isSafeToken } from '@/lib/upload'
import { UPLOAD_DIR } from '@/lib/storage'
import type { FileRow } from '@/db/schema'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 下载 / 缩略图共用的取文件逻辑:鉴权 → 过期 → 路径安全 → 存在性。
 * 访客只认 12 位随机 token;数字 id 只给登录用户。
 */
export async function loadServableFile(
  id: string,
): Promise<{ res: NextResponse } | { row: FileRow; abs: string; stat: fs.Stats; authed: boolean }> {
  const authed = await isAuthed()
  const viaToken = isSafeToken(id)
  if (!viaToken && !(authed && /^\d+$/.test(id))) return { res: new NextResponse('Not found', { status: 404 }) }

  const row = await db.select().from(schema.files)
    .where(viaToken ? eq(schema.files.token, id) : eq(schema.files.id, Number(id))).get()
  if (!row) return { res: new NextResponse('Not found', { status: 404 }) }

  if (!authed) {
    const access = await guestAccess(row, viaToken)
    if (access === 'not_found') return { res: new NextResponse('Not found', { status: 404 }) }
    if (access === 'locked') return { res: new NextResponse('Locked', { status: 401 }) }
  }

  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return { res: new NextResponse('已过期', { status: 410 }) }
  }

  const root = path.resolve(UPLOAD_DIR)
  const abs = path.resolve(root, row.storedPath)
  // 防目录穿越:用 relative 判,startsWith 会把 uploadsX 这种同前缀兄弟目录放过去
  const rel = path.relative(root, abs)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(abs)) {
    return { res: new NextResponse('文件已丢失', { status: 404 }) }
  }
  return { row, abs, stat: fs.statSync(abs), authed }
}
