import fs from 'node:fs'
import { redirect } from 'next/navigation'
import { and, asc, desc, eq, gt, isNotNull, lt, lte, sql } from 'drizzle-orm'
import { db, schema, DATA_ROOT } from '@/db'
import { isAuthed } from '@/lib/auth'
import { dirSize, UPLOAD_DIR } from '@/lib/storage'
import { hostOf, formatBytes } from '@/lib/utils'
import { Dashboard, type DashboardData, type Activity } from '@/components/admin/dashboard'

export const dynamic = 'force-dynamic'

const DAY = 24 * 60 * 60 * 1000
const count = sql<number>`count(*)`

/** 磁盘总量 / 可用；不支持 statfs 时返回 null */
function diskOf(dir: string) {
  try {
    const s = fs.statfsSync(dir)
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize }
  } catch {
    return null
  }
}

const LEVEL_LABEL: Record<string, string> = { school: '校级', province: '省级', national: '国家级', international: '国际级' }
const STATUS_LABEL: Record<string, string> = { draft: '草稿', submitted: '投稿中', accepted: '已接收', published: '已发表' }

export default async function AdminHome() {
  if (!(await isAuthed())) redirect('/login?next=/admin')

  const now = new Date()
  const soon = new Date(now.getTime() + DAY)
  const { links, files, competitions, papers } = schema

  /* ---------- 计数 ---------- */
  const linkAgg = await db.select({ n: count, clicks: sql<number>`coalesce(sum(${links.clickCount}), 0)` }).from(links).get()
  const fileAgg = await db.select({ n: count, bytes: sql<number>`coalesce(sum(${files.size}), 0)` }).from(files).get()
  const tempAgg = await db.select({ n: count }).from(files)
    .where(and(eq(files.owner, 'guest'), gt(files.expiresAt, now))).get()
  const expiredAgg = await db.select({ n: count, bytes: sql<number>`coalesce(sum(${files.size}), 0)` }).from(files)
    .where(and(isNotNull(files.expiresAt), lt(files.expiresAt, now))).get()

  const levelRows = await db.select({ key: competitions.level, n: count }).from(competitions).groupBy(competitions.level)
  const statusRows = await db.select({ key: papers.status, n: count }).from(papers).groupBy(papers.status)
  const levels = Object.fromEntries(levelRows.map((r) => [r.key ?? 'none', Number(r.n)]))
  const statuses = Object.fromEntries(statusRows.map((r) => [r.key, Number(r.n)]))

  /* ---------- 即将过期 ---------- */
  const expiring = await db.select({
    id: files.id, name: files.originalName, size: files.size, expiresAt: files.expiresAt,
  }).from(files)
    .where(and(gt(files.expiresAt, now), lte(files.expiresAt, soon)))
    .orderBy(asc(files.expiresAt))
    .limit(8)

  /* ---------- Top 5 ---------- */
  const top = await db.select({
    id: links.id, title: links.title, url: links.url, iconUrl: links.iconUrl, clicks: links.clickCount,
  }).from(links)
    .where(gt(links.clickCount, 0))
    .orderBy(desc(links.clickCount), asc(links.sort))
    .limit(5)

  /* ---------- 最近动态 ---------- */
  const [rl, rf, rc, rp] = [
    await db.select({ id: links.id, title: links.title, url: links.url, at: links.createdAt })
      .from(links).orderBy(desc(links.createdAt)).limit(8),
    await db.select({ id: files.id, title: files.originalName, size: files.size, owner: files.owner, at: files.createdAt })
      .from(files).orderBy(desc(files.createdAt)).limit(8),
    await db.select({ id: competitions.id, title: competitions.name, level: competitions.level, result: competitions.result, at: competitions.createdAt })
      .from(competitions).orderBy(desc(competitions.createdAt)).limit(8),
    await db.select({ id: papers.id, title: papers.title, status: papers.status, venue: papers.venue, at: papers.createdAt })
      .from(papers).orderBy(desc(papers.createdAt)).limit(8),
  ]

  const recent: Activity[] = [
    ...rl.map((r) => ({ kind: 'link' as const, id: r.id, title: r.title, sub: hostOf(r.url), at: r.at.getTime() })),
    ...rf.map((r) => ({
      kind: 'file' as const, id: r.id, title: r.title,
      sub: `${formatBytes(r.size)}${r.owner === 'guest' ? ' · 访客' : ''}`, at: r.at.getTime(),
    })),
    ...rc.map((r) => ({
      kind: 'competition' as const, id: r.id, title: r.title,
      sub: [r.level ? LEVEL_LABEL[r.level] : null, r.result].filter(Boolean).join(' · '), at: r.at.getTime(),
    })),
    ...rp.map((r) => ({
      kind: 'paper' as const, id: r.id, title: r.title,
      sub: [STATUS_LABEL[r.status], r.venue].filter(Boolean).join(' · '), at: r.at.getTime(),
    })),
  ].sort((a, b) => b.at - a.at).slice(0, 8)

  /* ---------- 存储 ---------- */
  const used = dirSize(UPLOAD_DIR)
  const disk = diskOf(DATA_ROOT)

  const data: DashboardData = {
    now: now.getTime(),
    links: { count: Number(linkAgg?.n ?? 0), clicks: Number(linkAgg?.clicks ?? 0) },
    files: { count: Number(fileAgg?.n ?? 0), bytes: Number(fileAgg?.bytes ?? 0) },
    temp: { count: Number(tempAgg?.n ?? 0) },
    expired: { count: Number(expiredAgg?.n ?? 0), bytes: Number(expiredAgg?.bytes ?? 0) },
    expiring: expiring.map((f) => ({ id: f.id, name: f.name, size: f.size, expiresAt: f.expiresAt!.getTime() })),
    competitions: { count: Object.values(levels).reduce((a, b) => a + b, 0), levels },
    papers: { count: Object.values(statuses).reduce((a, b) => a + b, 0), statuses },
    top: top.map((l) => ({ ...l, clicks: Number(l.clicks) })),
    recent,
    storage: { used, total: disk?.total ?? null, free: disk?.free ?? null },
  }

  return <Dashboard data={data} />
}
