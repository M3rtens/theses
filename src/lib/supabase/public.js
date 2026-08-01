import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Anonymous server client used only for explicitly public views. Unlike the
// admin client, it cannot bypass RLS or select the underlying thesis JSONB.
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Server is missing Supabase public credentials.')
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

