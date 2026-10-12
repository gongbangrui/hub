import fs from 'node:fs'
import path from 'node:path'
import { DATA_ROOT } from '@/db'

export const UPLOAD_DIR = path.join(DATA_ROOT, 'uploads')
export const CHUNK_DIR = path.join(DATA_ROOT, 'chunks')

export function monthDir(d = new Date()) {
  const dir = path.join(UPLOAD_DIR, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'))
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function safeName(name: string) {
  return name.replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').slice(0, 180)
}

export function chunkDirFor(uploadId: string) {
  const dir = path.join(CHUNK_DIR, uploadId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function uploadedChunkIndexes(uploadId: string, total: number) {
  try {
    return fs.readdirSync(chunkDirFor(uploadId))
      .filter((f) => f.endsWith('.part'))
      .map((f) => Number(f.split('.')[0]))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < total)
  } catch { return [] }
}

export function mergeChunks(uploadId: string, total: number, destPath: string) {
  const dir = chunkDirFor(uploadId)
  const out = fs.openSync(destPath, 'w')
  try {
    for (let i = 0; i < total; i++) {
      const p = path.join(dir, `${i}.part`)
      if (!fs.existsSync(p)) throw new Error(`missing chunk ${i}`)
      fs.writeSync(out, fs.readFileSync(p))
    }
  } finally { fs.closeSync(out) }
  fs.rmSync(dir, { recursive: true, force: true })
}

/**
 * 删除 uploads 下的文件。
 * 用 path.relative 判越界 —— startsWith 会把同前缀的兄弟目录（uploadsX）也放过去。
 */
export function removeStored(storedPath: string) {
  const root = path.resolve(UPLOAD_DIR)
  const abs = path.resolve(root, storedPath)
  const rel = path.relative(root, abs)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return
  if (fs.existsSync(abs)) fs.rmSync(abs, { force: true })
}

const sizeCache = new Map<string, { at: number; size: number }>()
const SIZE_TTL = 30_000

/**
 * 目录占用。递归遍历整个 uploads 是同步 IO，首页和中转站每次渲染都调，
 * 所以按目录缓存 30 秒；上传完成/删除后由调用方 invalidateDirSize。
 */
export function dirSize(dir: string): number {
  const key = path.resolve(dir)
  const hit = sizeCache.get(key)
  if (hit && Date.now() - hit.at < SIZE_TTL) return hit.size
  const size = walk(dir)
  sizeCache.set(key, { at: Date.now(), size })
  return size
}

function walk(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let sum = 0
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    try {
      if (e.isDirectory()) sum += walk(p)
      else if (e.isFile()) sum += fs.statSync(p).size
    } catch { /* 并发删除时条目可能消失，跳过 */ }
  }
  return sum
}

/** 上传完成、删除文件、清理过期后调用，让下次 dirSize 重新统计 */
export function invalidateDirSize() {
  sizeCache.clear()
}
