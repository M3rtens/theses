import { NextResponse } from 'next/server'
import { getCardData } from '../../../src/lib/yahoo.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateCardItems,
  validationResponse,
} from '../../../src/lib/apiValidation.js'
import { checkRateLimit, rateLimitFailure } from '../../../src/lib/rateLimit.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { items: [{ symbol, from }] } -> native entry/current/return per symbol.
export async function POST(request) {
  const limited = rateLimitFailure(checkRateLimit(request, { scope: 'cards', limit: 30 }))
  if (limited) return NextResponse.json(limited.body, limited.init)

  let body
  try {
    body = validateCardItems(await readJsonObject(request, REQUEST_LIMITS.cards))
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }
  try {
    const data = await getCardData(body)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    })
  } catch (e) {
    console.error('Card market-data lookup failed', e)
    return NextResponse.json({ error: 'market data provider unavailable' }, { status: 502 })
  }
}
