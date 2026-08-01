import { NextResponse } from 'next/server'
import {
  closeThesis,
  getThesis,
  scheduleThesisClose,
} from '../../../../src/lib/thesesStore.js'
import { errorStatus, requireUserContext } from '../../../../src/lib/auth.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateLifecyclePayload,
  validationResponse,
} from '../../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/theses/:id -> mutate a thesis's lifecycle. Two actions:
//   { action: 'schedule-close', closeDate: 'YYYY-MM-DD' }  seal a future close date
//   { action: 'close' }                                    close now, sealing the
//                                                           final price/return live
// Both are one-way: a scheduled close date can't be changed once set, and a
// closed thesis can't be reopened — the same integrity model as the entry lock.
export async function PATCH(request, { params }) {
  try {
    await requireUserContext()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: errorStatus(e) })
  }

  const { id } = await params

  let body
  try {
    body = validateLifecyclePayload(await readJsonObject(request, REQUEST_LIMITS.lifecycle))
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }

  let thesis
  try {
    thesis = await getThesis(id)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: errorStatus(e) })
  }
  if (!thesis) {
    return NextResponse.json({ error: 'thesis not found' }, { status: 404 })
  }
  if (thesis.status === 'closed') {
    return NextResponse.json({ error: 'thesis is already closed' }, { status: 409 })
  }

  const action = String(body?.action || '')

  if (action === 'schedule-close') {
    if (thesis.closeDate) {
      return NextResponse.json({ error: 'a close date is already sealed and cannot be changed' }, { status: 409 })
    }
    try {
      const saved = await scheduleThesisClose(id, body.closeDate)
      if (!saved) return NextResponse.json({ error: 'thesis not found' }, { status: 404 })
      return NextResponse.json(saved)
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: errorStatus(e) })
    }
  }

  if (action === 'close') {
    // Seal the final price from the live feed — never trust a client-supplied
    // price — and derive the position return side-adjusted, mirroring the entry lock.
    let lock
    try {
      const { lockEntryPrice } = await import('../../../../src/lib/yahoo.js')
      lock = await lockEntryPrice(thesis.resolvedSymbol || thesis.ticker)
    } catch (e) {
      console.error('Closing-price lock failed', e)
      return NextResponse.json({ error: 'could not seal closing price' }, { status: 502 })
    }

    const closePrice = lock.price
    try {
      const saved = await closeThesis(id, closePrice)
      if (!saved) return NextResponse.json({ error: 'thesis not found' }, { status: 404 })
      return NextResponse.json(saved)
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: errorStatus(e) })
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
