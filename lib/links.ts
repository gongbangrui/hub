export function faviconFallback(title: string) {
  return title.trim().charAt(0).toUpperCase() || '?'
}

/** 规范化 URL：补协议、去尾部斜杠 */
export function normalizeUrl(raw: string) {
  let s = raw.trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  try {
    const u = new URL(s)
    return u.toString().replace(/\/$/, '')
  } catch { return '' }
}

export type ParsedBookmark = { title: string; url: string; folder?: string }

/**
 * 解析浏览器导出的 Netscape 书签 HTML。
 * 结构是 <DT><H3>文件夹</H3><DL> …条目… </DL>：H3 给出名字，紧随其后的 <DL> 才是它的内容，
 * 所以用栈跟踪 <DL>/</DL>，条目归属于栈顶（最内层）文件夹；根部的 <DL> 压入空名。
 */
export function parseBookmarksHtml(html: string): ParsedBookmark[] {
  const out: ParsedBookmark[] = []
  const stack: string[] = []
  let pending: string | null = null
  // 内容长度设上限：未闭合的 <a> 否则会让懒匹配扫到文件末尾，8MB 输入下是平方级
  const re = /<(h3|a)\b([^>]*)>([\s\S]{0,2000}?)<\/\1\s*>|<dl\b[^>]*>|<\/dl\s*>/gi
  let m: RegExpExecArray | null

  while ((m = re.exec(html))) {
    const tag = m[1]?.toLowerCase()
    if (tag === 'h3') {
      pending = decodeEntities(m[3].replace(/<[^>]+>/g, '')).trim()
    } else if (tag === 'a') {
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(m[2])?.[1]
      if (!href || !/^https?:/i.test(href)) continue
      out.push({
        title: decodeEntities(m[3].replace(/<[^>]+>/g, '')).trim() || href,
        url: href,
        folder: stack[stack.length - 1] || undefined,
      })
    } else if (/^<dl/i.test(m[0])) {
      stack.push(pending ?? '')
      pending = null
    } else {
      stack.pop()
    }
  }
  return out
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
}
