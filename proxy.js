import { updateSession } from './src/lib/supabase/middleware'
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  createRequestNonce,
} from './src/lib/securityHeaders.js'

export async function proxy(request) {
  const nonce = createRequestNonce()
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy)

  const response = await updateSession(request, requestHeaders)
  return applySecurityHeaders(response, contentSecurityPolicy)
}

export const config = {
  // Run on all application paths except immutable assets and image files.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
