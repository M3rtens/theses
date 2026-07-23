import 'server-only'
import { createClient } from './supabase/server'

export class AuthenticationError extends Error {
  constructor(message = 'Not signed in.') {
    super(message)
    this.name = 'AuthenticationError'
    this.status = 401
  }
}

// Authentication is checked in the data layer so protected route handlers stay
// protected even if a guest bypasses the interface and calls an endpoint
// directly.
export async function requireUserContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new AuthenticationError()
  return { supabase, user }
}

export function errorStatus(error, fallback = 500) {
  return error?.status === 401 || error instanceof AuthenticationError ? 401 : fallback
}
