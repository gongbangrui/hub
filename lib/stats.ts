import { db, schema } from '@/db'
import { and, desc, eq, gt, isNull, notInArray, sql } from 'drizzle-orm'

/** 访客可见的文件：长期公开、未被竞赛/论文引用（与 /files 一致）；访客自己上传的另算 */
export function guestVisible() {
  return and(
    isNull(schema.files.expiresAt),
    notInArray(schema.files.id, db.select({ id: schema.attachments.fileId }).from(schema.attachments)),
  )
}

const DAY = 86400
const nowSec = () => Math.floor(Date.now() / 1000)

export type Activity = {
  kind: 'link' | 'file' | 'competition' | 'paper'
  id: number
  title: string
  sub?: string
  at: number // ms
  href: string
}

/** 近 14 天按天的新增数(链接 + 可见文件 + 登录后的竞赛/论文),用于迷你趋势图 */
function trend(authed: boolean) {
  const since = nowSec() - 14 * DAY
  const day = (col: any) => sql<number>`cast((${col} - ${since}) / ${DAY} as integer)`
  const buckets = new Array(14).fill(0) as number[]
  const add = (rows: { d: number; n: number }[]) => rows.forEach((r) => { if (r.d >= 0 && r.d < 14) buckets[r.d] += r.n })

  add(db.select({ d: day(schema.links.createdAt), n: sql<number>`count(*)` }).from(schema.links)
    .where(gt(schema.links.createdAt, new Date(since * 1000))).groupBy(sql`1`).all())
  add(db.select({ d: day(schema.files.createdAt), n: sql<number>`count(*)` }).from(schema.files)
    .where(and(gt(schema.files.createdAt, new Date(since * 1000)), authed ? undefined : guestVisible())).groupBy(sql`1`).all())
  if (authed) {
    add(db.select({ d: day(schema.competitions.createdAt), n: sql<number>`count(*)` }).from(schema.competitions)
      .where(gt(schema.competitions.createdAt, new Date(since * 1000))).groupBy(sql`1`).all())
    add(db.select({ d: day(schema.papers.createdAt), n: sql<number>`count(*)` }).from(schema.papers)
      .where(gt(schema.papers.createdAt, new Date(since * 1000))).groupBy(sql`1`).all())
  }
  return buckets
}

/** 首页所需的全部数据。全是同步 SQLite 小查询,合起来一般 <5ms */
export function getHomeData(authed: boolean) {
  const week = new Date((nowSec() - 7 * DAY) * 1000)
  const count = (table: any, where?: any) =>
    (db.select({ n: sql<number>`count(*)` }).from(table).where(where).get()?.n ?? 0)

  const visibleFiles = authed ? undefined : guestVisible()

  const links = {
    count: count(schema.links),
    week: count(schema.links, gt(schema.links.createdAt, week)),
    clicks: db.select({ s: sql<number>`coalesce(sum(click_count),0)` }).from(schema.links).get()?.s ?? 0,
    top: db.select().from(schema.links).orderBy(desc(schema.links.clickCount), desc(schema.links.id)).limit(6).all(),
  }

  const fileAgg = db.select({ n: sql<number>`count(*)`, s: sql<number>`coalesce(sum(size),0)` }).from(schema.files)
    .where(visibleFiles).get()
  const recentFiles = db.select().from(schema.files)
    .where(and(eq(schema.files.owner, 'admin'), visibleFiles))
    .orderBy(desc(schema.files.createdAt)).limit(4).all()

  const comps = authed ? count(schema.competitions) : 0
  const papers = authed ? count(schema.papers) : 0

  // 动态时间线:各取最近几条,合并后按时间倒序
  const acts: Activity[] = []
  for (const l of db.select().from(schema.links).orderBy(desc(schema.links.createdAt)).limit(6).all())
    acts.push({ kind: 'link', id: l.id, title: l.title, sub: l.url, at: l.createdAt.getTime(), href: '/links' })
  for (const f of db.select().from(schema.files).where(and(eq(schema.files.owner, 'admin'), visibleFiles))
    .orderBy(desc(schema.files.createdAt)).limit(6).all())
    acts.push({ kind: 'file', id: f.id, title: !authed && f.sharePassword ? '••••••' : f.originalName, sub: fmtSize(f.size), at: f.createdAt.getTime(), href: '/files' })
  if (authed) {
    for (const c of db.select().from(schema.competitions).orderBy(desc(schema.competitions.createdAt)).limit(5).all())
      acts.push({ kind: 'competition', id: c.id, title: c.name, sub: c.result ?? undefined, at: c.createdAt.getTime(), href: '/competitions' })
    for (const p of db.select().from(schema.papers).orderBy(desc(schema.papers.createdAt)).limit(5).all())
      acts.push({ kind: 'paper', id: p.id, title: p.title, sub: p.venue ?? undefined, at: p.createdAt.getTime(), href: '/papers' })
  }
  acts.sort((a, b) => b.at - a.at)

  return {
    links,
    files: { count: fileAgg?.n ?? 0, bytes: fileAgg?.s ?? 0, recent: recentFiles },
    competitions: comps,
    papers,
    activity: acts.slice(0, 8),
    trend: trend(authed),
  }
}

function fmtSize(n: number) {
  const u = ['B', 'KB', 'MB', 'GB']
  const i = n > 0 ? Math.min(3, Math.floor(Math.log(n) / Math.log(1024))) : 0
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`
}

export function timeAgo(ms: number, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ms) / 1000))
  if (s < 60) return '刚刚'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  const mo = Math.floor(d / 30)
  return mo < 12 ? `${mo} 个月前` : `${Math.floor(mo / 12)} 年前`
}
