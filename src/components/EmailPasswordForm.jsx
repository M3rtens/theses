'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase/client'

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 14,
  background: '#fff',
  marginBottom: 10,
}

// Email + password sign-in / sign-up. Toggles between the two modes. On sign-up,
// if the project requires email confirmation, Supabase returns no session and we
// prompt the user to check their inbox; otherwise they're signed straight in.
export default function EmailPasswordForm() {
  const router = useRouter()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    const supabase = createClient()
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
            // Stored on the user's metadata; deriveIdentity reads full_name for
            // the display name, matching what Google accounts provide.
            data: { full_name: name.trim() },
          },
        })
        if (error) throw error
        if (data.session) {
          router.refresh() // confirmation disabled — signed in immediately
        } else {
          setNotice('Check your email for a confirmation link to finish signing up.')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.refresh()
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="text-left">
      {mode === 'signup' && (
        <input
          type="text"
          required
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      )}
      <input
        type="email"
        required
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={inputStyle}
      />
      <input
        type="password"
        required
        minLength={6}
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={inputStyle}
      />

      {error && <p className="text-[12px] mb-2" style={{ color: 'var(--bear)' }}>{error}</p>}
      {notice && <p className="text-[12px] mb-2" style={{ color: 'var(--ink-soft)' }}>{notice}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full btn-primary text-sm font-medium py-2.5 rounded-md"
        style={{ opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
      >
        {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
      </button>

      <p className="text-[12px] mt-3 text-center" style={{ color: 'var(--muted)' }}>
        {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
        <button
          type="button"
          onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); setNotice(''); setName('') }}
          style={{ color: 'var(--ink)', fontWeight: 500, cursor: 'pointer', textDecoration: 'underline' }}
        >
          {mode === 'signup' ? 'Sign in' : 'Create one'}
        </button>
      </p>
    </form>
  )
}
