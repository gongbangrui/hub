import { NextResponse } from 'next/server'
import { db } from '@/db'
import { isAuthed } from '@/lib/auth'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const stamp = (d = new Date()) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

/** 在线快照整个库（WAL 安全），流式返回后删掉临时文件 */
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const tmp = path.join(os.tmpdir(), `foliage-backup-${randomBytes(6).toString('hex')}.db`)
  try {
    await db.$client.backup(tmp)
  } catch {
    fs.rmSync(tmp, { force: true })
    return NextResponse.json({ error: '备份失败' }, { status: 500 })
  }

  const size = fs.statSync(tmp).size
  const stream = fs.createReadStream(tmp)
  const cleanup = () => fs.rm(tmp, { force: true }, () => {})
  stream.on('close', cleanup)
  stream.on('error', cleanup)

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': 'application/vnd.sqlite3',
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="app-${stamp()}.db"`,
      'Cache-Control': 'no-store',
    },
  })
}
