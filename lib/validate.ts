import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { normalizeUrl } from '@/lib/links'

/** 读 JSON 并校验。失败直接给出可返回的 400 响应，调用方 `if ('res' in r) return r.res` */
export async function parseBody<S extends z.ZodType>(req: NextRequest, schema: S) {
  let raw: unknown
  try { raw = await req.json() } catch { return { res: NextResponse.json({ error: 'BAD_JSON' }, { status: 400 }) } }
  const r = schema.safeParse(raw)
  if (!r.success) {
    const msg = r.error.issues[0]?.message
    return { res: NextResponse.json({ error: msg && !msg.startsWith('Invalid') ? msg : 'BAD_REQUEST' }, { status: 400 }) }
  }
  return { data: r.data as z.output<S> }
}

/** 可空短文本：'' 与 null 都存成 null；undefined 表示「不改」 */
export const text = (max: number) =>
  z.union([z.string().max(max, `内容过长(最多 ${max} 字)`), z.null()]).optional()
    .transform((v) => (v === undefined ? undefined : v?.trim() || null))

export const int = z.coerce.number().int().finite()
export const nullableId = z.union([z.coerce.number().int().positive(), z.null(), z.literal('').transform(() => null)]).optional()

/** 只接受 http(s)：javascript:、data: 之类一律拒绝 */
export const httpUrl = z.string().trim().min(1, '链接必填').max(2000, '链接过长')
  .transform((v) => normalizeUrl(v))
  .refine((v) => /^https?:\/\//i.test(v), '链接格式不对')

export const attachmentsSchema = z.array(z.object({
  fileId: z.coerce.number().int().positive(),
  caption: text(200),
})).max(50).optional()

/** 去掉 undefined，供 drizzle .set() 使用 */
export function defined<T extends Record<string, unknown>>(o: T) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}
