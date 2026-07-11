import { NextResponse } from 'next/server'
import { getFinancialStatements } from '../../../src/lib/yahoo.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') || 'ASML').toUpperCase()
  try {
    const data = await getFinancialStatements(symbol)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
