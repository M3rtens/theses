import { NextResponse } from 'next/server'
import { getCardData } from '../../../src/lib/yahoo.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { items: [{ symbol, from }] } -> native entry/current/return per symbol.
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const items = (body?.items || [])
    .map((i) => ({ symbol: String(i?.symbol || '').trim().toUpperCase(), from: i?.from }))
    .filter((i) => i.symbol)
  if (!items.length) {
    return NextResponse.json({ error: 'items array required' }, { status: 400 })
  }
  try {
    const data = await getCardData(items)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
