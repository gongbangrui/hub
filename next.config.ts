import type { NextConfig } from 'next'
import path from 'node:path'

const config: NextConfig = {
  output: 'standalone',
  // 固定追踪根为项目目录：上级目录若有 lockfile，standalone 产物会被嵌套到子路径
  outputFileTracingRoot: path.resolve(__dirname),
  outputFileTracingIncludes: {},
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
    // 图标库与动画库按需摘取,减小客户端包
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  serverExternalPackages: ['better-sqlite3', 'sharp'],
}

export default config
