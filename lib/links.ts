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

/** 解析浏览器导出的 Netscape 书签 HTML */
export function parseBookmarksHtml(html: string): ParsedBookmark[] {
  const out: ParsedBookmark[] = []
  const folderStack: string[] = []
  const re = /<(h3|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi
  let m: RegExpExecArray | null

  while ((m = re.exec(html))) {
    const [, tag, attrs, inner] = m
    if (tag.toLowerCase() === 'h3') {
      folderStack.push(decodeEntities(inner.replace(/<[^>]+>/g, '')).trim())
      // 文件夹闭合靠 </dl>，下面单独处理
    } else {
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]
      if (!href || !/^https?:/i.test(href)) continue
      out.push({
        title: decodeEntities(inner.replace(/<[^>]+>/g, '')).trim() || href,
        url: href,
        folder: folderStack[folderStack.length - 1],
      })
    }
  }
  return out
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
}
