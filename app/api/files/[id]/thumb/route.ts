import { NextResponse, type NextRequest } from 'next/server'
import { db, schema } from '@/db'
import { eq } from 'drizzle-orm'
import { loadServableFile } from '@/lib/file-serve'
import { DATA_ROOT } from '@/db'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'

const THUMB_DIR = path.join(DATA_ROOT, 'thumbs')
const WIDTHS = [240, 480, 800, 1280]
// 同一张图同时被多个请求触发时只生成一次
const inflight = new Map<string, Promise<void>>()

/** 图片缩略图(webp,按宽度分档缓存到磁盘)。鉴权与下载接口一致;非位图或 sharp 不可用时回退为原图 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const f = await loadServableFile(id)
  if ('res' in f) return f.res
  const { row, abs, stat } = f

  // 相对地址:反代后 req.url 可能是内网地址
  const fallback = () => new NextResponse(null, { status: 307, headers: { Location: `/api/files/${id}/download?inline=1` } })
  if (!/^image\/(png|jpe?g|webp|gif|avif|tiff?)$/i.test(row.mime)) return fallback()

  const asked = Number(req.nextUrl.searchParams.get('w')) || 480
  const w = WIDTHS.find((x) => x >= asked) ?? WIDTHS[WIDTHS.length - 1]
  const out = path.join(THUMB_DIR, `${row.id}-${w}.webp`)
  const etag = `W/"t-${row.id}-${w}-${Math.floor(stat.mtimeMs).toString(16)}"`

  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } })
  }

  try {
    const fresh = fs.existsSync(out) && fs.statSync(out).mtimeMs >= stat.mtimeMs
    if (!fresh) {
      let job = inflight.get(out)
      if (!job) {
        job = (async () => {
          const sharp = (await import('sharp')).default
          fs.mkdirSync(THUMB_DIR, { recursive: true })
          const tmp = `${out}.${process.pid}.tmp`
          const img = sharp(abs, { failOn: 'none', limitInputPixels: 268_000_000 }).rotate()
          const meta = await sharp(abs, { failOn: 'none' }).metadata()
          await img.resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(tmp)
          fs.renameSync(tmp, out)
          // 顺手补齐旧文件缺失的尺寸
          if (!row.width && meta.width && meta.height) {
            const swap = (meta.orientation ?? 1) >= 5
            await db.update(schema.files)
              .set({ width: swap ? meta.height : meta.width, height: swap ? meta.width : meta.height })
              .where(eq(schema.files.id, row.id))
          }
        })().finally(() => inflight.delete(out))
        inflight.set(out, job)
      }
      await job
    }
    const buf = fs.readFileSync(out)
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(buf.length),
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        ETag: etag,
      },
    })
  } catch {
    return fallback()
  }
}
