import { NextResponse, type NextRequest } from 'next/server'
import { clientIp } from '@/lib/auth'
import { rateLimit } from '@/lib/rate'

export const runtime = 'nodejs'

// 不放 svg：同源下直接打开能执行脚本
const OK_TYPE = /^image\/(png|jpe?g|gif|webp|x-icon|vnd\.microsoft\.icon)$/i
const MAX_BYTES = 256 * 1024

/** favicon 代理：避免前端直连第三方、统一缓存 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')
  if (!u) return new NextResponse(null, { status: 400 })

  let host: string
  try { host = new URL(u).hostname } catch { return new NextResponse(null, { status: 400 }) }
  if (!host || host.length > 253) return new NextResponse(null, { status: 400 })

  // 匿名可调的上游代理：限频，免得被拿来刷 Google 的配额或占满连接
  const rl = rateLimit(`icon:${clientIp(req.headers)}`, 240, 60_000)
  if (!rl.ok) return new NextResponse(null, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })

  try {
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`, {
      next: { revalidate: 604800 },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) throw new Error('upstream')
    // 只放行位图：上游一旦返回 text/html，就会以本站源的 MIME 渲染，等于 XSS
    const type = (res.headers.get('content-type') ?? 'image/png').split(';')[0].trim()
    if (!OK_TYPE.test(type)) throw new Error('not an image')
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) throw new Error('too large')
    return new NextResponse(buf, {
      headers: {
        'Content-Type': type,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
