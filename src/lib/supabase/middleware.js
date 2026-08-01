import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// Refreshes the auth session on every request and rewrites the session cookies
// onto the response, so Server Components always see a valid session. Adapted
// from the Supabase Next.js SSR guide.
export async function updateSession(request, requestHeaders = request.headers) {
  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: refreshes the token. Do not run other logic between creating the
  // client and this call, or you risk logging users out at random.
  await supabase.auth.getUser()

  return supabaseResponse
}
