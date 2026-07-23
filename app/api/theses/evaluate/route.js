import { NextResponse } from 'next/server'
import { refreshStoredTriggers } from '../../../../src/lib/evaluateTriggers.js'
import { errorStatus } from '../../../../src/lib/auth.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/theses/evaluate -> recompute + persist every stored thesis's
// financial-trigger statuses against the latest filings, and return the refreshed
// list (same shape as GET /api/theses). Falls back to the stored list on failure.
export async function POST() {
  try {
    return NextResponse.json(await refreshStoredTriggers())
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: errorStatus(e) })
  }
}
