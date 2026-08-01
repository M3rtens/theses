import { NextResponse } from 'next/server'
import { listTheses, addThesis } from '../../../src/lib/thesesStore.js'
import { errorStatus, requireUserContext } from '../../../src/lib/auth.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateThesisPayload,
  validationResponse,
} from '../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/theses -> user-created theses, newest first.
export async function GET() {
  try {
    return NextResponse.json(await listTheses())
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: errorStatus(e) })
  }
}

// POST /api/theses -> create a thesis. Body: { title, ticker, side, company?,
// sector?, body?, triggers? }. The entry price is sealed server-side at the live
// native-currency price — the client cannot set or backdate it.
export async function POST(request) {
  try {
    await requireUserContext()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: errorStatus(e) })
  }

  let body
  try {
    body = validateThesisPayload(await readJsonObject(request, REQUEST_LIMITS.publish))
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }

  // Seal the entry at the current market price, in the stock's own currency.
  // Imported lazily so the GET (list) path doesn't drag the heavy yahoo-finance2
  // module into its bundle — keeping the thesis list fast to load.
  let lock
  try {
    const { lockEntryPrice } = await import('../../../src/lib/yahoo.js')
    lock = await lockEntryPrice(body.ticker)
  } catch (e) {
    console.error('Entry-price lock failed', e)
    return NextResponse.json({ error: 'could not lock entry price' }, { status: 502 })
  }

  const now = new Date()
  const nowIso = now.toISOString()

  const record = {
    title: body.title,
    ticker: body.ticker,
    company: body.company || lock.company,
    side: body.side,
    sector: body.sector || lock.sector || '—',
    publishDate: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    entryDate: nowIso.slice(0, 10),
    daysActive: 0,
    entry: lock.price,
    current: lock.price,
    ret: 0,
    status: 'active',
    updates: 0,
    triggers: body.triggers,
    currency: lock.currency,
    resolvedSymbol: lock.resolvedSymbol,
    exchange: lock.exchange,
    body: body.body,
    citations: body.citations,
    // The financial model built in the editor's spreadsheet. Sealed with the
    // thesis so it renders read-only on the published page, like the entry price.
    model: body.model,
    createdAt: nowIso,
  }

  try {
    const saved = await addThesis(record)
    return NextResponse.json(saved, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: errorStatus(e) })
  }
}
