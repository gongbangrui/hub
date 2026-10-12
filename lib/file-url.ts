/** 文件地址：优先用随机 token；数字 id 只在登录后可用 */
export function fileUrl(f: { id: number; token?: string | null }, inline = false) {
  return `/api/files/${f.token || f.id}/download${inline ? '?inline=1' : ''}`
}
