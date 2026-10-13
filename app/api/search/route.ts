import { NextResponse, type NextRequest } from 'next/server'
import { and, desc, eq, gt, isNull, or, sql, notInArray } from 'drizzle-orm'
import { db, schema } from '@/db'
import { clientIp, isAuthed } from '@/lib/auth'
import { rateLimit } from '@/lib/rate'
import { readVisitorId } from '@/lib/file-access'
import { hostOf } from '@/lib/utils'

export const runtime = 'nodejs'

const LIMIT = 5
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)
const like = (col: unknown, pat: string) => sql`${col} LIKE ${pat} ESCAPE '\\'`

/** 全局搜索:链接 / 文件 / 竞赛 / 论文。访客只搜得到公开内容与自己的临时文件 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60)
  if (!q) return NextResponse.json({ links: [], files: [], competitions: [], papers: [] })

  const rl = rateLimit(`search:${clientIp(req.headers)}`, 90, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'TOO_MANY' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })

  const authed = await isAuthed()
  const vid = authed ? null : await readVisitorId()
  const pat = `%${esc(q)}%`
  const now = new Date()

  const links = db.select().from(schema.links)
    .where(or(
      like(schema.links.title, pat), like(schema.links.url, pat),
      like(schema.links.description, pat), like(schema.links.tags, pat),
    ))
    .orderBy(desc(schema.links.pinned), desc(schema.links.clickCount)).limit(LIMIT).all()
    .map((l) => ({ id: l.id, title: l.title, url: l.url, host: hostOf(l.url) }))

  const publicFile = and(
    isNull(schema.files.expiresAt),
    notInArray(schema.files.id, db.select({ id: schema.attachments.fileId }).from(schema.attachments)),
  )
  const visible = authed
    ? or(isNull(schema.files.expiresAt), gt(schema.files.expiresAt, now))
    : vid
      ? or(publicFile, and(eq(schema.files.uploaderId, vid), gt(schema.files.expiresAt, now)))
      : publicFile
  const files = db.select().from(schema.files)
    .where(and(like(schema.files.originalName, pat), visible, isNull(schema.files.sharePassword)))
    .orderBy(desc(schema.files.createdAt)).limit(LIMIT).all()
    .map((f) => ({ id: f.id, name: f.originalName, size: f.size, code: f.shareCode, mine: !!vid && f.uploaderId === vid }))

  let competitions: { id: number; name: string; sub: string | null }[] = []
  let papers: { id: number; title: string; sub: string | null }[] = []
  if (authed) {
    competitions = db.select().from(schema.competitions)
      .where(or(like(schema.competitions.name, pat), like(schema.competitions.result, pat), like(schema.competitions.team, pat)))
      .orderBy(desc(schema.competitions.createdAt)).limit(LIMIT).all()
      .map((c) => ({ id: c.id, name: c.name, sub: c.result }))
    papers = db.select().from(schema.papers)
      .where(or(like(schema.papers.title, pat), like(schema.papers.venue, pat), like(schema.papers.abstract, pat), like(schema.papers.authors, pat)))
      .orderBy(desc(schema.papers.createdAt)).limit(LIMIT).all()
      .map((p) => ({ id: p.id, title: p.title, sub: p.venue }))
  }

  return NextResponse.json({ links, files, competitions, papers })
}
