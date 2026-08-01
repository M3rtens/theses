const EXPLICIT_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const FRAGMENT = /^#[A-Za-z0-9._~!$&'()*+,;=:@/?%-]*$/
const hasControlCharacters = (value) => [...value].some((character) => {
  const code = character.charCodeAt(0)
  return code <= 31 || code === 127
})

// Normalise user-controlled links before they enter a workbook, leave the API,
// or open in a browser. Existing product behaviour intentionally supports web
// URLs, email/telephone links, and same-document fragments.
export function normalizePublicUrl(value, { assumeHttps = false } = {}) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || hasControlCharacters(trimmed)) return null

  if (trimmed.startsWith('#')) return FRAGMENT.test(trimmed) ? trimmed : null
  if (trimmed.startsWith('//')) return null

  const candidate = assumeHttps && !EXPLICIT_SCHEME.test(trimmed)
    ? `https://${trimmed}`
    : trimmed

  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    return null
  }

  const protocol = parsed.protocol.toLowerCase()
  if (protocol === 'http:' || protocol === 'https:') {
    if (!parsed.hostname || parsed.username || parsed.password) return null
    return parsed.href
  }

  if (protocol === 'mailto:') {
    return parsed.pathname && parsed.pathname.includes('@') ? parsed.href : null
  }

  if (protocol === 'tel:') {
    return /^[+0-9(). -]+$/.test(parsed.pathname) ? parsed.href : null
  }

  return null
}
