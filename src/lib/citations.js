import { normalizePublicUrl } from './urls.js'

export const MAX_CITATIONS = 50
export const CITATION_ID = /^src-[a-z0-9][a-z0-9-]{0,63}$/

export function normalizeCitationUrl(value) {
  const normalized = normalizePublicUrl(value, { assumeHttps: true })
  return normalized && /^https?:/i.test(normalized) ? normalized : null
}

export function citationIdsInHtml(html) {
  const ids = []
  const pattern = /data-thesis-citation-id=["']([^"']+)["']/gi
  let match
  while ((match = pattern.exec(String(html || '')))) ids.push(match[1])
  return ids
}

export function newCitationId() {
  return `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
