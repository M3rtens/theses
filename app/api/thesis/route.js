import { NextResponse } from 'next/server'
import { getThesisData } from '../../../src/lib/yahoo.js'
import {
  normalizeSymbol,
  validateHistoryDate,
  validationResponse,
} from '../../../src/lib/apiValidation.js'
import { checkRateLimit, rateLimitFailure } from '../../../src/lib/rateLimit.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const limited = rateLimitFailure(checkRateLimit(request, { scope: 'thesis', limit: 40 }))
  if (limited) return NextResponse.json(limited.body, limited.init)

  const { searchParams } = new URL(request.url)
  let symbol
  let from
  try {
    symbol = normalizeSymbol(searchParams.get('symbol') || 'ASML')
    from = validateHistoryDate(searchParams.get('from') || '2024-03-14')
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }
  try {
    const data = await getThesisData(symbol, from)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    })
  } catch (e) {
    console.error('Thesis market-data lookup failed', e)
    return NextResponse.json({ error: 'market data provider unavailable' }, { status: 502 })
  }
}
