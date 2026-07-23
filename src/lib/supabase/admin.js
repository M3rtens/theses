import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Server-only client for deliberately public, read-only projections such as the
// Discover feed and leaderboard. The service-role key bypasses RLS, so this
// client must never be imported into browser code or returned to the client.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Server is missing Supabase public-read credentials.')
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
