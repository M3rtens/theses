import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '../../../src/lib/supabase/server'

// Deletes the signed-in user's own account. Deleting an auth user requires the
// service-role key, which must never reach the browser — so it happens here,
// server-side, and only ever for the caller's own id (taken from their session,
// never from the request body).
export async function DELETE() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 500 },
    )
  }

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Clear the now-orphaned session cookies so the browser lands on login.
  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
