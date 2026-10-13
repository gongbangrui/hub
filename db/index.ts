import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data')
const DB_PATH = path.join(DATA_DIR, 'app.db')

fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true })
fs.mkdirSync(path.join(DATA_DIR, 'chunks'), { recursive: true })

const g = globalThis as unknown as { __sqlite?: Database.Database }

function open() {
  const conn = new Database(DB_PATH)
  conn.pragma('journal_mode = WAL')
  conn.pragma('synchronous = NORMAL')
  conn.pragma('busy_timeout = 5000')
  conn.pragma('foreign_keys = ON')
  return conn
}

// dev 热更新会反复执行本模块，缓存在 globalThis 上避免泄漏连接
const sqlite = g.__sqlite ?? (g.__sqlite = open())

sqlite.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'link', color TEXT, sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL, description TEXT,
  icon_url TEXT, category_id INTEGER, tags TEXT DEFAULT '[]', pinned INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL, mime TEXT NOT NULL DEFAULT 'application/octet-stream', size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL, owner TEXT NOT NULL DEFAULT 'guest', share_code TEXT UNIQUE, share_password TEXT,
  delete_key TEXT, uploader_id TEXT, width INTEGER, height INTEGER, downloads INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, level TEXT, category_id INTEGER,
  date_start TEXT, date_end TEXT, result TEXT, team TEXT, description TEXT,
  sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, authors TEXT DEFAULT '[]', venue TEXT,
  type TEXT, status TEXT NOT NULL DEFAULT 'draft', level TEXT, doi TEXT, url TEXT, pub_date TEXT,
  abstract TEXT, sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, owner_type TEXT NOT NULL, owner_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL, caption TEXT, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_files_expires ON files(expires_at);
CREATE INDEX IF NOT EXISTS idx_files_share ON files(share_code);
CREATE INDEX IF NOT EXISTS idx_files_sha ON files(sha256);
CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments(owner_type, owner_id);
`)

// 没有迁移体系：旧库的 files 表缺列时就地补上，必须在建索引之前
const fileCols = sqlite.prepare('PRAGMA table_info(files)').all() as { name: string }[]
if (!fileCols.some((c) => c.name === 'uploader_id')) {
  sqlite.exec('ALTER TABLE files ADD COLUMN uploader_id TEXT')
}
for (const col of ['width', 'height']) {
  if (!fileCols.some((c) => c.name === col)) sqlite.exec(`ALTER TABLE files ADD COLUMN ${col} INTEGER`)
}
sqlite.exec(`
CREATE INDEX IF NOT EXISTS idx_files_uploader ON files(uploader_id);
CREATE INDEX IF NOT EXISTS idx_files_created ON files(created_at);
`)

export const db = drizzle(sqlite, { schema })
export const DATA_ROOT = DATA_DIR
export { schema }
