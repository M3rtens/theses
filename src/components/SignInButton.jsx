'use client'

import { createClient } from '../lib/supabase/client'

// Kicks off the Google OAuth flow. Supabase redirects to Google, then back to
// our /auth/callback route, which finalises the session.
export default function SignInButton() {
  async function signIn() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <button
      type="button"
      onClick={signIn}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        border: '1px solid #ccc',
        borderRadius: 8,
        background: '#fff',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      Sign in with Google
    </button>
  )
}
