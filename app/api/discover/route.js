import { NextResponse } from 'next/server'
import { buildDiscoverPage, parseDiscoverQuery } from '../../../src/lib/community.js'
import { listPublicTheses } from '../../../src/lib/publicThesesStore.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The thesis body is stored as HTML. Strip tags and collapse whitespace to a
// plain-text preview sized for a feed card.
function snippetFrom(html) {
  const text = String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= 180) return text
  return text.slice(0, 180).replace(/\s+\S*$/, '') + '…'
}

// GET /api/discover -> a filtered, sorted page from the deliberately public,
// read-only projection of published theses and author profiles.
export async function GET(request) {
  let options
  try {
    options = parseDiscoverQuery(new URL(request.url).searchParams)
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  let theses
  try {
    theses = await listPublicTheses()
  } catch (error) {
    console.error('Discover projection failed', error)
    return NextResponse.json({ error: 'community feed unavailable' }, { status: 500 })
  }

  const feed = theses.map((thesis) => ({ ...thesis, snippet: snippetFrom(thesis.body) }))
  return NextResponse.json(buildDiscoverPage(feed, options))
}
