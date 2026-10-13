import { z } from 'zod'
import { text, nullableId, attachmentsSchema, httpUrl } from '@/lib/validate'

const emptyToNull = <T extends z.ZodType>(s: T) =>
  z.union([s, z.null(), z.literal('').transform(() => null)]).optional()

// ---- 竞赛 ----
export const competitionFields = {
  level: emptyToNull(z.enum(['school', 'province', 'national', 'international'])),
  categoryId: nullableId,
  dateStart: text(20),
  dateEnd: text(20),
  result: text(300),
  team: text(1000),
  description: text(10000),
}
export const competitionCreate = z.object({
  name: z.string().trim().min(1, '名称必填').max(300, '名称过长'),
  ...competitionFields,
  attachments: attachmentsSchema,
})
export const competitionPatch = z.object({
  name: z.string().trim().min(1, '名称必填').max(300, '名称过长').optional(),
  ...competitionFields,
  sort: z.coerce.number().int().optional(),
  attachments: attachmentsSchema,
})

// ---- 论文 ----
export const paperFields = {
  authors: z.array(z.string().trim().max(200)).max(40).optional()
    .transform((v) => v?.filter(Boolean)),
  venue: text(300),
  type: emptyToNull(z.enum(['journal', 'conference', 'preprint'])),
  level: text(50),
  doi: text(200),
  // 论文链接会被渲染成 <a href>：只放行 http(s)
  url: z.union([httpUrl, z.null(), z.literal('').transform(() => null)]).optional(),
  pubDate: text(20),
  abstract: text(10000),
}
const paperStatus = z.enum(['draft', 'submitted', 'accepted', 'published'])
export const paperCreate = z.object({
  title: z.string().trim().min(1, '标题必填').max(400, '标题过长'),
  status: paperStatus.optional(),
  ...paperFields,
  attachments: attachmentsSchema,
})
export const paperPatch = z.object({
  title: z.string().trim().min(1, '标题必填').max(400, '标题过长').optional(),
  status: paperStatus.optional(),
  ...paperFields,
  sort: z.coerce.number().int().optional(),
  attachments: attachmentsSchema,
})

// ---- 链接 / 分类 ----
export const linkFields = {
  description: text(1000),
  categoryId: nullableId,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  pinned: z.boolean().optional(),
}
export const linkCreate = z.object({
  title: z.string().trim().min(1, '标题必填').max(200, '标题过长'),
  url: httpUrl,
  ...linkFields,
})
export const linkPatch = z.object({
  title: z.string().trim().min(1, '标题必填').max(200, '标题过长').optional(),
  url: httpUrl.optional(),
  ...linkFields,
  sort: z.coerce.number().int().optional(),
})

export const categoryKind = z.enum(['link', 'competition', 'paper'])
const color = z.union([z.string().regex(/^#[0-9a-fA-F]{3,8}$/, '颜色格式不对'), z.null(), z.literal('').transform(() => null)]).optional()
export const categoryCreate = z.object({
  name: z.string().trim().min(1, '名称必填').max(80),
  slug: z.string().trim().max(60).optional(),
  kind: categoryKind.optional(),
  color,
})
export const categoryPatch = z.object({
  name: z.string().trim().min(1, '名称必填').max(80).optional(),
  color,
  sort: z.coerce.number().int().optional(),
})
