import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Aurora } from '@/components/motion/aurora'
import { PointerFx } from '@/components/motion/pointer-fx'
import { ensureInit } from '@/lib/auth'

// 根布局查库（ensureInit），整站动态渲染，构建期不预渲染、不碰 data 目录
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Foliage',
  description: '链接、文件、竞赛与论文',
}

export const viewport: Viewport = { themeColor: '#060818', colorScheme: 'dark' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await ensureInit()
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="noise min-h-dvh antialiased">
        <Aurora />
        <PointerFx />
        <div className="relative z-[2]">{children}</div>
      </body>
    </html>
  )
}
