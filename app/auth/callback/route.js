import { NextResponse } from 'next/server'
import { createClient } from '../../../src/lib/supabase/server'

// OAuth redirect target. Google sends the user to Supabase, Supabase redirects
// here with a one-time `code`, and we exchange it for a session cookie, then
// send the user on to their final destination.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong exchanging the code — send the user back to the login
  // dedicated sign-in route.
  return NextResponse.redirect(`${origin}/sign-in`)
}
