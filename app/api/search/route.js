import { NextResponse } from 'next/server'
import { searchSecurities } from '../../../src/lib/yahoo.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/search?q=asml -> up to ~10 matching securities.
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  if (!q) return NextResponse.json([])
  try {
    return NextResponse.json(await searchSecurities(q))
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
