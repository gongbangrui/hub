import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data')
const DB_PATH = path.join(DATA_DIR, 'app.db')

fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true })
fs.mkdirSync(path.join(DATA_DIR, 'chunks'), { recursive: true })

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

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
  delete_key TEXT, downloads INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, created_at INTEGER NOT NULL);
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

export const db = drizzle(sqlite, { schema })
export const DATA_ROOT = DATA_DIR
export { schema }
