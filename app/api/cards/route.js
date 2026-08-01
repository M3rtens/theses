import { NextResponse } from 'next/server'
import { getCardData } from '../../../src/lib/yahoo.js'
import {
  readJsonObject,
  REQUEST_LIMITS,
  validateCardItems,
  validationResponse,
} from '../../../src/lib/apiValidation.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { items: [{ symbol, from }] } -> native entry/current/return per symbol.
export async function POST(request) {
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
    return NextResponse.json(data)
  } catch (e) {
    console.error('Card market-data lookup failed', e)
    return NextResponse.json({ error: 'market data provider unavailable' }, { status: 502 })
  }
}
