import { NextResponse } from 'next/server'
import { getFinancialStatements } from '../../../src/lib/yahoo.js'
import { normalizeSymbol, validationResponse } from '../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
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
    return NextResponse.json(data)
  } catch (e) {
    console.error('Financial statement lookup failed', e)
    return NextResponse.json({ error: 'financial data provider unavailable' }, { status: 502 })
  }
}
