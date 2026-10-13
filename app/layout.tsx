import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Backdrop } from '@/components/motion/backdrop'
import { PointerFx } from '@/components/motion/pointer-fx'
import { MotionProvider } from '@/components/motion/motion-provider'
import { RouteProgress } from '@/components/motion/route-progress'

export const metadata: Metadata = {
  title: 'Foliage',
  description: '链接、文件、竞赛与论文',
}

export const viewport: Viewport = { themeColor: '#f3f8ff', colorScheme: 'light' }

// 根布局不再碰数据库：不强制动态渲染；读 cookie / 查库的页面各自会变成动态
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <Backdrop />
        <PointerFx />
        <MotionProvider>
          <RouteProgress />
          <div className="relative z-[2]">{children}</div>
        </MotionProvider>
      </body>
    </html>
  )
}
