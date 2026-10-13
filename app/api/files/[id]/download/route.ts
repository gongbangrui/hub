import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { eq, sql } from 'drizzle-orm'
import { loadServableFile } from '@/lib/file-serve'
import fs from 'node:fs'
import { Readable } from 'node:stream'

export const runtime = 'nodejs'

const MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4',
  mp3: 'audio/mpeg', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8',
  json: 'application/json', zip: 'application/zip',
}

/** 计数失败不该让下载失败 */
async function countDownload(id: number) {
  try {
    await db.update(schema.files)
      .set({ downloads: sql`${schema.files.downloads} + 1` })
      .where(eq(schema.files.id, id))
  } catch { /* 并发写入冲突时忽略 */ }
}

/** 带 Range 的下载流，支持视频拖动与下载器断点续传 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const f = await loadServableFile(id)
  if ('res' in f) return f.res
  const { row, abs, stat } = f
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`

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
    ETag: etag,
    'Last-Modified': stat.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  }

  // SVG 直接打开时禁脚本；<img> 引用不受影响（PDF 不能加 sandbox，否则内置阅读器被拦）
  if (/svg/i.test(type)) baseHeaders['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

  const range = req.headers.get('range')
  if (!range && req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: baseHeaders })
  }
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (m && (m[1] || m[2])) {
      // bytes=-N 是「最后 N 字节」，不是 0..N
      const suffix = !m[1] && !!m[2]
      const start = suffix ? Math.max(0, stat.size - Number(m[2])) : Number(m[1])
      const end = !suffix && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1
      if (start > end || start >= stat.size) {
        return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
      }
      // 视频拖动、断点续传都走 206；不计的话大文件的下载数会一直是 0
      if (!inline && start === 0) await countDownload(row.id)
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
  if (!inline) await countDownload(row.id)

  const stream = fs.createReadStream(abs)
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(stat.size) },
  })
}
