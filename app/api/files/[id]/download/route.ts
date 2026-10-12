import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { UPLOAD_DIR } from '@/lib/storage'
import { eq, sql } from 'drizzle-orm'
import { isAuthed } from '@/lib/auth'
import { guestAccess } from '@/lib/file-access'
import { isSafeToken } from '@/lib/upload'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

export const runtime = 'nodejs'

const MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4',
  mp3: 'audio/mpeg', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8',
  json: 'application/json', zip: 'application/zip',
}

/** 带 Range 的下载流，支持视频拖动与下载器断点续传 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authed = await isAuthed()
  const viaToken = isSafeToken(id)
  // 数字 id 只给登录用户；访客必须持有 12 位随机 token
  if (!viaToken && !(authed && /^\d+$/.test(id))) return new NextResponse('Not found', { status: 404 })

  const row = await db.select().from(schema.files)
    .where(viaToken ? eq(schema.files.token, id) : eq(schema.files.id, Number(id))).get()
  if (!row) return new NextResponse('Not found', { status: 404 })

  if (!authed) {
    const access = await guestAccess(row, viaToken)
    if (access === 'not_found') return new NextResponse('Not found', { status: 404 })
    if (access === 'locked') return new NextResponse('Locked', { status: 401 })
  }

  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return new NextResponse('已过期', { status: 410 })
  }

  const abs = path.resolve(path.join(UPLOAD_DIR, row.storedPath))
  // 防目录穿越：解析后的绝对路径必须仍在 uploads 内
  if (!abs.startsWith(path.resolve(UPLOAD_DIR)) || !fs.existsSync(abs)) {
    return new NextResponse('文件已丢失', { status: 404 })
  }

  const stat = fs.statSync(abs)
  const ext = row.originalName.split('.').pop()?.toLowerCase() ?? ''
  let type = row.mime && row.mime !== 'application/octet-stream' ? row.mime : (MIME[ext] ?? 'application/octet-stream')
  // mime 是上传方自报的：能执行脚本的类型一律当二进制下载，防同源 XSS
  const scriptable = /html|xml|javascript|ecmascript/i.test(type) && !/^image\/svg\+xml$/i.test(type)
  if (scriptable) type = 'application/octet-stream'

  const inline = req.nextUrl.searchParams.get('inline') === '1' && !scriptable && type !== 'application/octet-stream'
  const disposition = inline
    ? `inline; filename*=UTF-8''${encodeURIComponent(row.originalName)}`
    : `attachment; filename*=UTF-8''${encodeURIComponent(row.originalName)}`

  const baseHeaders: Record<string, string> = {
    'Content-Type': type,
    'Content-Disposition': disposition,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  }

  // SVG 直接打开时禁脚本；<img> 引用不受影响（PDF 不能加 sandbox，否则内置阅读器被拦）
  if (/svg/i.test(type)) baseHeaders['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

  const range = req.headers.get('range')
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (m) {
      const start = m[1] ? Number(m[1]) : 0
      const end = m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1
      if (start > end || start >= stat.size) {
        return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
      }
      const stream = fs.createReadStream(abs, { start, end })
      return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': String(end - start + 1),
        },
      })
    }
  }

  // 内联预览（缩略图、灯箱）不计下载
  if (!inline) {
    await db.update(schema.files)
      .set({ downloads: sql`${schema.files.downloads} + 1` })
      .where(eq(schema.files.id, row.id))
  }

  const stream = fs.createReadStream(abs)
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(stat.size) },
  })
}
