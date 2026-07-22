const rawApiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const API_BASE = rawApiBase && !rawApiBase.startsWith('http') ? `https://${rawApiBase}` : rawApiBase

function buildHeaders(options = {}) {
  if (options.body instanceof FormData) return { ...(options.headers || {}) }
  return {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }
}

export async function apiFetch(path, options = {}) {
  let res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: buildHeaders(options),
    ...options
  })
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    const refreshed = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}'
    })
    if (refreshed.ok) res = await fetch(`${API_BASE}${path}`, { credentials: 'include', headers: buildHeaders(options), ...options })
  }
  const text = await res.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = text }
  if (!res.ok) {
    const message = payload?.error || payload?.details || res.statusText || 'Request failed'
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }
  return payload
}

export async function apiDownload(path, options = {}) {
  let res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: buildHeaders(options),
    ...options
  })
  if (res.status === 401) {
    const refreshed = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}'
    })
    if (refreshed.ok) res = await fetch(`${API_BASE}${path}`, { credentials: 'include', headers: buildHeaders(options), ...options })
  }
  if (!res.ok) {
    const text = await res.text()
    let payload = null
    try { payload = text ? JSON.parse(text) : null } catch { payload = text }
    const message = payload?.error || payload?.details || res.statusText || 'Download failed'
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }
  const disposition = res.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="?([^";]+)"?/i)
  return { blob: await res.blob(), filename: match?.[1] || 'CKAP-report.pptx' }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function formatNumber(value, digits = 2) {
  return toNumber(value).toLocaleString('th-TH', { maximumFractionDigits: digits })
}

export function currentMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return `${values.year}-${values.month}`
}

export function currentDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export const MODULE_LABELS = {
  rdf: 'ขยะ RDF',
  dog_food: 'อาหารหมา',
  pig_feed: 'อาหารหมู',
  wet_waste: 'ขยะเปียก',
  recycle: 'รีไซเคิล',
  tissue: 'กระดาษทิชชู่',
  black_bag: 'ถุงดำ',
  consumable: 'น้ำยาต่างๆ',
  general_waste: 'ขยะทั่วไป'
}

export const MODULE_ORDER = ['rdf', 'dog_food', 'pig_feed', 'wet_waste', 'recycle', 'tissue', 'black_bag', 'consumable']
