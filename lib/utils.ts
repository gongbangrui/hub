import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(u.length - 1, Math.max(0, Math.floor(Math.log(n) / Math.log(1024))))
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}

export function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export function faviconOf(url: string) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64` } catch { return '' }
}

// 站点图标的首字母兜底色(白字,需要足够深)
const TONES = [
  'from-sky-400 to-blue-500',
  'from-indigo-400 to-violet-500',
  'from-violet-400 to-purple-500',
  'from-blue-400 to-indigo-500',
  'from-cyan-400 to-sky-500',
  'from-teal-400 to-cyan-500',
]
export function toneOf(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return TONES[Math.abs(h) % TONES.length]
}

export function fileKind(mime: string, name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'flac', 'm4a'].includes(ext)) return 'audio'
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'json', 'yml', 'yaml', 'html', 'css'].includes(ext)) return 'code'
  if (['doc', 'docx', 'md', 'txt', 'rtf'].includes(ext)) return 'doc'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet'
  return 'other'
}
