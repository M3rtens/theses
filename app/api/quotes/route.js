import { NextResponse } from 'next/server'
import { getQuotes } from '../../../src/lib/yahoo.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const symbols = (searchParams.get('symbols') || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  if (!symbols.length) {
    return NextResponse.json({ error: 'symbols query param required' }, { status: 400 })
  }
  try {
    const data = await getQuotes(symbols)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
