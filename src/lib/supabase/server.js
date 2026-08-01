import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// Supabase client for Server Components, Route Handlers, and Server Actions.
// Reads/writes the session via Next's cookie store so auth survives navigation.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component where cookies are read-only. Safe to
            // ignore — the request proxy refreshes the session cookie instead.
          }
        },
      },
    },
  )
}
