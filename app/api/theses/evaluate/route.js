import { NextResponse } from 'next/server'
import { refreshStoredTriggers } from '../../../../src/lib/evaluateTriggers.js'
import { errorStatus } from '../../../../src/lib/auth.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Compatibility route for older clients. Durable evaluation now runs through
// the secured background worker, so this returns the currently stored rows.
export async function POST() {
  try {
    return NextResponse.json(await refreshStoredTriggers())
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: errorStatus(e) })
  }
}
