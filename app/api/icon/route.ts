import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

/** favicon 代理：避免前端直连第三方、统一缓存 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')
  if (!u) return new NextResponse(null, { status: 400 })

  let host: string
  try { host = new URL(u).hostname } catch { return new NextResponse(null, { status: 400 }) }

  try {
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${host}&sz=64`, {
      next: { revalidate: 604800 },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) throw new Error('upstream')
    // 只放行图片：上游一旦返回 text/html，就会以本站源的 MIME 渲染，等于 XSS
    const type = res.headers.get('content-type') ?? 'image/png'
    if (!/^image\//i.test(type)) throw new Error('not an image')
    const buf = await res.arrayBuffer()
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
