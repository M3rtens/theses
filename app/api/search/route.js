import { NextResponse } from 'next/server'
import { searchSecurities } from '../../../src/lib/yahoo.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/search?q=asml -> up to ~10 matching securities.
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  if (!q) return NextResponse.json([])
  const hasControlCharacters = [...q].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
  if (q.length > 100 || hasControlCharacters) {
    return NextResponse.json({ error: 'q must be 100 characters or fewer' }, { status: 400 })
  }
  try {
    return NextResponse.json(await searchSecurities(q))
  } catch (e) {
    console.error('Security search failed', e)
    return NextResponse.json({ error: 'search provider unavailable' }, { status: 502 })
  }
}
