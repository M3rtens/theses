import { NextResponse } from 'next/server'
import { getThesisData } from '../../../src/lib/yahoo.js'
import {
  normalizeSymbol,
  validateHistoryDate,
  validationResponse,
} from '../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
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
    return NextResponse.json(data)
  } catch (e) {
    console.error('Thesis market-data lookup failed', e)
    return NextResponse.json({ error: 'market data provider unavailable' }, { status: 502 })
  }
}
