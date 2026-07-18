import { createBrowserClient } from '@supabase/ssr'

// Supabase client for use in Client Components ('use client'). Reads the public
// env vars, which are safe to ship to the browser — the anon key only grants
// what your Row Level Security policies allow.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}
