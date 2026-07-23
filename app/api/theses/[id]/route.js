import { NextResponse } from 'next/server'
import { getThesis, updateThesis } from '../../../../src/lib/thesesStore.js'
import { errorStatus, requireUserContext } from '../../../../src/lib/auth.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

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
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
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
    const closeDate = String(body?.closeDate || '')
    if (!ISO_DATE.test(closeDate)) {
      return NextResponse.json({ error: 'closeDate must be YYYY-MM-DD' }, { status: 400 })
    }
    const today = new Date().toISOString().slice(0, 10)
    if (closeDate <= today) {
      return NextResponse.json({ error: 'closeDate must be in the future' }, { status: 400 })
    }
    try {
      const saved = await updateThesis(id, { closeDate })
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
      return NextResponse.json({ error: `could not seal closing price: ${e.message}` }, { status: 502 })
    }

    const nowIso = new Date().toISOString()
    const closePrice = lock.price
    const closeReturn = thesis.entry
      ? Number(((thesis.side === 'bear' ? -1 : 1) * ((closePrice - thesis.entry) / thesis.entry) * 100).toFixed(1))
      : thesis.ret
    const daysActive = thesis.entryDate
      ? Math.max(0, Math.round((new Date(nowIso) - new Date(thesis.entryDate)) / 86400000))
      : thesis.daysActive

    try {
      const saved = await updateThesis(id, {
        status: 'closed',
        closedAt: nowIso,
        closePrice,
        closeReturn,
        current: closePrice,
        ret: closeReturn,
        daysActive,
      })
      return NextResponse.json(saved)
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: errorStatus(e) })
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
