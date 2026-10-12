import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify } from 'jose/jwt/verify'

const COOKIE = 'hub_session'

async function authed(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value
  if (!token) return false
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-change-me'))
    return true
  } catch { return false }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/admin')) {
    if (!(await authed(req))) {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
  }

  if (pathname.startsWith('/api/private')) {
    if (!(await authed(req))) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/private/:path*'],
}
