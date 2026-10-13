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

export function chunkDirExists(uploadId: string) {
  return fs.existsSync(path.join(CHUNK_DIR, uploadId))
}

export function removeChunks(uploadId: string) {
  fs.rmSync(path.join(CHUNK_DIR, uploadId), { recursive: true, force: true })
}

/**
 * 分片目录里标记「谁传的」。
 * 分片在 complete 之前不进 files 表，所以访客配额必须靠这个文件统计，
 * 否则一个 Cookie 反复 init + chunk 就能把磁盘写满而配额毫无反应。
 */
const VID_MARK = '.vid'

export function markChunkOwner(uploadId: string, vid: string) {
  try { fs.writeFileSync(path.join(CHUNK_DIR, uploadId, VID_MARK), vid) } catch { /* 目录被并发清掉就跳过 */ }
}

function readChunkOwner(dir: string) {
  try { return fs.readFileSync(path.join(dir, VID_MARK), 'utf8').trim() } catch { return '' }
}

/** 某个访客尚未完成上传的分片占用 */
export function pendingBytesOf(vid: string): number {
  if (!fs.existsSync(CHUNK_DIR)) return 0
  let sum = 0
  for (const e of fs.readdirSync(CHUNK_DIR, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const p = path.join(CHUNK_DIR, e.name)
    if (readChunkOwner(p) === vid) sum += walk(p)
  }
  return sum
}

/** 目录里最新的文件 mtime：大文件的分片串行写入只动文件不动目录 mtime */
export function newestMtime(dir: string): number {
  let newest = 0
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    try {
      newest = Math.max(newest, e.isDirectory() ? newestMtime(p) : fs.statSync(p).mtimeMs)
    } catch { /* 并发删除 */ }
  }
  return newest
}

export function uploadedChunkIndexes(uploadId: string, total: number) {
  try {
    return fs.readdirSync(path.join(CHUNK_DIR, uploadId))
      .filter((f) => f.endsWith('.part'))
      .map((f) => Number(f.split('.')[0]))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < total)
  } catch { return [] }
}

/**
 * 按序拼接分片到 destPath。失败时清掉写了一半的目标文件；
 * 分片目录由调用方在入库成功后再删，这样合并失败还能重试。
 */
export function mergeChunks(uploadId: string, total: number, destPath: string) {
  const dir = path.join(CHUNK_DIR, uploadId)
  if (!fs.existsSync(dir)) throw new Error('unknown upload')
  const out = fs.openSync(destPath, 'w')
  try {
    for (let i = 0; i < total; i++) {
      const p = path.join(dir, `${i}.part`)
      if (!fs.existsSync(p)) throw new Error(`missing chunk ${i}`)
      fs.writeSync(out, fs.readFileSync(p))
    }
  } catch (e) {
    fs.closeSync(out)
    fs.rmSync(destPath, { force: true })
    throw e
  }
  fs.closeSync(out)
}

/** 删文件时顺带清掉它的缩略图缓存 */
export function removeThumbs(fileId: number) {
  const dir = path.join(DATA_ROOT, 'thumbs')
  try {
    for (const f of fs.readdirSync(dir)) if (f.startsWith(`${fileId}-`)) fs.rmSync(path.join(dir, f), { force: true })
  } catch { /* 目录不存在 */ }
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
