import { updateSession } from './src/lib/supabase/middleware'

export async function middleware(request) {
  return await updateSession(request)
}

export const config = {
  // Run on all paths except static assets and image files.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
