import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST() {
  await destroySession()
  // 用相对地址：反代后 req.url 可能是 127.0.0.1:3000，绝对重定向会跳到内网地址
  return new NextResponse(null, { status: 303, headers: { Location: '/' } })
}
