/**
 * 演示数据。每张表为空时才插入，可重复运行。
 * 运行：npm run db:seed（读取 DATA_DIR，默认 ./data）
 */
import { db } from '../db'
import { categories, links, competitions, papers } from '../db/schema'
import { eq, sql } from 'drizzle-orm'

type Kind = 'link' | 'competition' | 'paper'

const count = (t: typeof links | typeof competitions | typeof papers) =>
  db.select({ n: sql<number>`count(*)` }).from(t).get()?.n ?? 0

const kindCount = (kind: Kind) =>
  db.select({ n: sql<number>`count(*)` }).from(categories).where(eq(categories.kind, kind)).get()?.n ?? 0

/** 分类为空才插；返回 slug → id，供后续行引用 */
function ensureCategories(kind: Kind, rows: { name: string; slug: string; color: string }[]) {
  if (kindCount(kind) === 0) {
    db.insert(categories)
      .values(rows.map((r, i) => ({ ...r, kind, sort: i + 1 })))
      .onConflictDoNothing({ target: categories.slug })
      .run()
  }
  const all = db.select().from(categories).where(eq(categories.kind, kind)).all()
  return new Map(all.map((c) => [c.slug, c.id]))
}

const done: string[] = []

// —— 书签 ——
const lc = ensureCategories('link', [
  { name: '开发', slug: 'dev', color: '#22d3ee' },
  { name: '学术', slug: 'research', color: '#818cf8' },
  { name: '设计', slug: 'design', color: '#e879f9' },
])

if (count(links) === 0) {
  const L = (title: string, url: string, description: string, cat: string, tags: string[], pinned = false) =>
    ({ title, url, description, categoryId: lc.get(cat) ?? null, tags, pinned })
  const rows = [
    L('GitHub', 'https://github.com', '代码托管', 'dev', ['代码'], true),
    L('MDN', 'https://developer.mozilla.org/zh-CN/', 'Web 文档', 'dev', ['前端', '文档']),
    L('Next.js 文档', 'https://nextjs.org/docs', 'App Router', 'dev', ['前端', '文档'], true),
    L('LeetCode', 'https://leetcode.cn', '算法题', 'dev', ['算法']),
    L('Vercel', 'https://vercel.com', '部署', 'dev', ['部署']),
    L('arXiv', 'https://arxiv.org', '预印本', 'research', ['论文'], true),
    L('Google Scholar', 'https://scholar.google.com', '文献检索', 'research', ['论文', '检索']),
    L('知网', 'https://www.cnki.net', '中文文献', 'research', ['论文', '检索']),
    L('Figma', 'https://www.figma.com', '界面设计', 'design', ['设计']),
    L('Tailwind CSS', 'https://tailwindcss.com', '原子化 CSS', 'design', ['前端', '样式']),
  ]
  db.insert(links).values(rows.map((r, i) => ({ ...r, sort: i + 1 }))).run()
  done.push(`links ${rows.length}`)
}

// —— 竞赛 ——
const cc = ensureCategories('competition', [
  { name: '数学建模', slug: 'modeling', color: '#22d3ee' },
  { name: '程序设计', slug: 'programming', color: '#e879f9' },
])

if (count(competitions) === 0) {
  const rows = [
    {
      name: '美国大学生数学建模竞赛 MCM/ICM', level: 'international' as const, categoryId: cc.get('modeling') ?? null,
      dateStart: '2025-01-23', dateEnd: '2025-01-27', result: 'Meritorious Winner', team: '张三、李四、王五',
      description: '交通网络韧性评估。',
    },
    {
      name: '全国大学生数学建模竞赛', level: 'national' as const, categoryId: cc.get('modeling') ?? null,
      dateStart: '2024-09-05', dateEnd: '2024-09-08', result: '国家级二等奖', team: '张三、李四、王五',
      description: '光伏电站功率预测。',
    },
    {
      name: '中国大学生程序设计竞赛 CCPC', level: 'national' as const, categoryId: cc.get('programming') ?? null,
      dateStart: '2024-10-19', dateEnd: '2024-10-20', result: '铜奖', team: '张三、赵六、钱七',
      description: null,
    },
    {
      name: '省大学生程序设计竞赛', level: 'province' as const, categoryId: cc.get('programming') ?? null,
      dateStart: '2023-05-13', dateEnd: '2023-05-13', result: '省级一等奖', team: '张三、赵六、钱七',
      description: null,
    },
    {
      name: '校数学建模竞赛', level: 'school' as const, categoryId: cc.get('modeling') ?? null,
      dateStart: '2022-11-12', dateEnd: '2022-11-14', result: '校级特等奖', team: '张三、李四',
      description: '食堂排队优化。',
    },
  ]
  db.insert(competitions).values(rows.map((r, i) => ({ ...r, sort: i + 1 }))).run()
  done.push(`competitions ${rows.length}`)
}

// —— 论文 ——
if (count(papers) === 0) {
  const rows = [
    {
      title: 'Graph-Aware Retrieval for Long-Context Question Answering', authors: ['San Zhang', 'Si Li', 'Wu Wang'],
      venue: 'AAAI', type: 'conference' as const, status: 'published' as const, level: 'CCF-A',
      doi: '10.1609/aaai.v39i1.00001', url: null, pubDate: '2025-02-25',
      abstract: '在长上下文问答中引入图结构检索，降低无关段落干扰。',
    },
    {
      title: '基于时空图网络的城市交通流预测', authors: ['张三', '李四'],
      venue: '计算机学报', type: 'journal' as const, status: 'accepted' as const, level: 'CCF-A 中文',
      doi: null, url: null, pubDate: '2025-06-01',
      abstract: '融合路网拓扑与时间周期性的交通流预测模型。',
    },
    {
      title: 'Lightweight Diffusion Priors for Low-Light Image Enhancement', authors: ['San Zhang', 'Liu Zhao'],
      venue: 'arXiv', type: 'preprint' as const, status: 'submitted' as const, level: null,
      doi: null, url: 'https://arxiv.org/abs/2501.00001', pubDate: '2025-01-03',
      abstract: '以轻量扩散先验提升低照度图像的细节与噪声抑制。',
    },
    {
      title: '多目标约束下的应急物资调度模型', authors: ['张三'],
      venue: null, type: 'journal' as const, status: 'draft' as const, level: null,
      doi: null, url: null, pubDate: null,
      abstract: null,
    },
  ]
  db.insert(papers).values(rows.map((r, i) => ({ ...r, sort: i + 1 }))).run()
  done.push(`papers ${rows.length}`)
}

console.log(done.length ? `seeded: ${done.join(', ')}` : 'seed: nothing to do')
