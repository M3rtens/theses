import { NextResponse } from 'next/server'
import { createClient } from '../../../src/lib/supabase/server'

// Target for the email-confirmation link sent on sign-up. Supabase appends a
// one-time token_hash; we verify it to establish the session, then redirect on.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Invalid or expired link — back to login.
  return NextResponse.redirect(`${origin}/`)
}
