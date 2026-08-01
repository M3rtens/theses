import { NextResponse } from 'next/server'
import { getFinancialStatements } from '../../../src/lib/yahoo.js'
import { normalizeSymbol, validationResponse } from '../../../src/lib/apiValidation.js'
import { checkRateLimit, rateLimitFailure } from '../../../src/lib/rateLimit.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const limited = rateLimitFailure(await checkRateLimit(request, { scope: 'financials', limit: 20 }))
  if (limited) return NextResponse.json(limited.body, limited.init)

  const { searchParams } = new URL(request.url)
  let symbol
  try {
    symbol = normalizeSymbol(searchParams.get('symbol') || 'ASML')
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }
  try {
    const data = await getFinancialStatements(symbol)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
    })
  } catch (e) {
    console.error('Financial statement lookup failed', e)
    return NextResponse.json({ error: 'financial data provider unavailable' }, { status: 502 })
  }
}
