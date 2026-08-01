import { NextResponse } from 'next/server'
import { verifyWorkerAuthorization } from '../../../../src/lib/lifecycle.js'
import { runRefreshWorker } from '../../../../src/lib/lifecycleWorker.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request) {
  if (!verifyWorkerAuthorization(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await runRefreshWorker()) })
  } catch (error) {
    console.error('Refresh worker failed', error)
    return NextResponse.json({ error: 'refresh worker failed' }, { status: 500 })
  }
}
