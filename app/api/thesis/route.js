import { NextResponse } from 'next/server'
import { getThesisData } from '../../../src/lib/yahoo.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') || 'ASML').toUpperCase()
  const from = searchParams.get('from') || '2024-03-14'
  try {
    const data = await getThesisData(symbol, from)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
