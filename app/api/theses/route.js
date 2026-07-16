import { NextResponse } from 'next/server'
import { listTheses, addThesis } from '../../../src/lib/thesesStore.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/theses -> user-created theses, newest first.
export async function GET() {
  try {
    return NextResponse.json(await listTheses())
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

const SIDES = new Set(['bull', 'bear'])
const TRIGGER_STATUS = new Set(['clear', 'warning', 'breached'])

// POST /api/theses -> create a thesis. Body: { title, ticker, side, company?,
// sector?, body?, triggers? }. The entry price is sealed server-side at the live
// native-currency price — the client cannot set or backdate it.
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const title = String(body?.title || '').trim()
  const ticker = String(body?.ticker || '').trim().toUpperCase()
  const side = String(body?.side || '').trim().toLowerCase()

  const errors = []
  if (!title) errors.push('title is required')
  if (!ticker) errors.push('ticker is required')
  if (!SIDES.has(side)) errors.push('side must be "bull" or "bear"')
  if (errors.length) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
  }

  // Seal the entry at the current market price, in the stock's own currency.
  // Imported lazily so the GET (list) path doesn't drag the heavy yahoo-finance2
  // module into its bundle — keeping the thesis list fast to load.
  let lock
  try {
    const { lockEntryPrice } = await import('../../../src/lib/yahoo.js')
    lock = await lockEntryPrice(ticker)
  } catch (e) {
    return NextResponse.json({ error: `could not lock entry price: ${e.message}` }, { status: 502 })
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const triggers = Array.isArray(body?.triggers)
    ? body.triggers
        .map((t) => ({
          c: String(t?.c ?? t?.condition ?? '').trim(),
          s: TRIGGER_STATUS.has(t?.s) ? t.s : 'clear',
        }))
        .filter((t) => t.c)
    : []

  const record = {
    title,
    ticker,
    company: String(body?.company || '').trim() || lock.company,
    side,
    sector: String(body?.sector || '').trim() || lock.sector || '—',
    publishDate: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    entryDate: nowIso.slice(0, 10),
    daysActive: 0,
    entry: lock.price,
    current: lock.price,
    ret: 0,
    status: 'active',
    updates: 0,
    triggers,
    currency: lock.currency,
    resolvedSymbol: lock.resolvedSymbol,
    exchange: lock.exchange,
    body: typeof body?.body === 'string' ? body.body : '',
    // The financial model built in the editor's spreadsheet. Sealed with the
    // thesis so it renders read-only on the published page, like the entry price.
    model: body?.model && typeof body.model === 'object' ? body.model : null,
    createdAt: nowIso,
  }

  try {
    const saved = await addThesis(record)
    return NextResponse.json(saved, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
