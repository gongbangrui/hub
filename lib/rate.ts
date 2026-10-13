/**
 * 进程内滑动窗口限流。单实例（SQLite）部署够用；重启会清零。
 * key 建议拼上用途前缀，例如 `upload:${ip}`。
 */
const hits = new Map<string, number[]>()
const MAX_KEYS = 10_000

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  if (hits.size > MAX_KEYS) {
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k)
    if (hits.size > MAX_KEYS) hits.clear()
  }
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (arr.length >= limit) {
    hits.set(key, arr)
    return { ok: false as const, retryAfter: Math.ceil((windowMs - (now - arr[0])) / 1000) }
  }
  arr.push(now)
  hits.set(key, arr)
  return { ok: true as const, retryAfter: 0 }
}
