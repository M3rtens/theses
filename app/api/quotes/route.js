import { NextResponse } from 'next/server'
import { getQuotes } from '../../../src/lib/yahoo.js'
import { normalizeSymbol, validationResponse } from '../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const rawSymbols = (searchParams.get('symbols') || '')
    .split(',')
    .map((symbol) => symbol.trim())
    .filter(Boolean)
  if (!rawSymbols.length) {
    return NextResponse.json({ error: 'symbols query param required' }, { status: 400 })
  }
  if (rawSymbols.length > 50) {
    return NextResponse.json({ error: 'no more than 50 symbols are allowed' }, { status: 400 })
  }

  let symbols
  try {
    symbols = [...new Set(rawSymbols.map((symbol) => normalizeSymbol(symbol)))]
  } catch (error) {
    const validation = validationResponse(error)
    if (validation) return NextResponse.json({ error: validation.message }, { status: validation.status })
    throw error
  }
  try {
    const data = await getQuotes(symbols)
    return NextResponse.json(data)
  } catch (e) {
    console.error('Quote lookup failed', e)
    return NextResponse.json({ error: 'quote provider unavailable' }, { status: 502 })
  }
}
