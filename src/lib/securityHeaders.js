const DEVELOPMENT = process.env.NODE_ENV !== 'production'

export function createRequestNonce() {
  return Buffer.from(crypto.randomUUID()).toString('base64')
}

export function buildContentSecurityPolicy(nonce, { development = DEVELOPMENT } = {}) {
  if (!nonce || !/^[A-Za-z0-9+/=_-]+$/.test(nonce)) throw new Error('a valid CSP nonce is required')
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export function applySecurityHeaders(response, contentSecurityPolicy, { production = process.env.VERCEL_ENV === 'production' } = {}) {
  response.headers.set('Content-Security-Policy', contentSecurityPolicy)
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()')
  if (production) response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  return response
}
