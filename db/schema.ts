import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

const now = () => integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  kind: text('kind', { enum: ['link', 'competition', 'paper'] }).notNull().default('link'),
  color: text('color'),
  sort: integer('sort').notNull().default(0),
  createdAt: now(),
})

export const links = sqliteTable('links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  description: text('description'),
  iconUrl: text('icon_url'),
  categoryId: integer('category_id'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  clickCount: integer('click_count').notNull().default(0),
  sort: integer('sort').notNull().default(0),
  createdAt: now(),
})

export const files = sqliteTable('files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token: text('token').notNull().unique(),
  originalName: text('original_name').notNull(),
  storedPath: text('stored_path').notNull(),
  mime: text('mime').notNull().default('application/octet-stream'),
  size: integer('size').notNull().default(0),
  sha256: text('sha256').notNull(),
  owner: text('owner', { enum: ['guest', 'admin'] }).notNull().default('guest'),
  shareCode: text('share_code').unique(),
  sharePassword: text('share_password'),
  deleteKey: text('delete_key'),
  downloads: integer('downloads').notNull().default(0),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: now(),
})

export const competitions = sqliteTable('competitions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  level: text('level', { enum: ['school', 'province', 'national', 'international'] }),
  categoryId: integer('category_id'),
  dateStart: text('date_start'),
  dateEnd: text('date_end'),
  result: text('result'),
  team: text('team'),
  description: text('description'),
  sort: integer('sort').notNull().default(0),
  createdAt: now(),
})

export const papers = sqliteTable('papers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  authors: text('authors', { mode: 'json' }).$type<string[]>().default([]),
  venue: text('venue'),
  type: text('type', { enum: ['journal', 'conference', 'preprint'] }),
  status: text('status', { enum: ['draft', 'submitted', 'accepted', 'published'] }).notNull().default('draft'),
  level: text('level'),
  doi: text('doi'),
  url: text('url'),
  pubDate: text('pub_date'),
  abstract: text('abstract'),
  sort: integer('sort').notNull().default(0),
  createdAt: now(),
})

export const attachments = sqliteTable('attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerType: text('owner_type', { enum: ['competition', 'paper'] }).notNull(),
  ownerId: integer('owner_id').notNull(),
  fileId: integer('file_id').notNull(),
  caption: text('caption'),
  sort: integer('sort').notNull().default(0),
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export type Link = typeof links.$inferSelect
export type FileRow = typeof files.$inferSelect
export type Competition = typeof competitions.$inferSelect
export type Paper = typeof papers.$inferSelect
export type Category = typeof categories.$inferSelect
export type Attachment = typeof attachments.$inferSelect
