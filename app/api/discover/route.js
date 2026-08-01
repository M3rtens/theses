import { NextResponse } from 'next/server'
import { makeRetOf } from '../../../src/lib/stats.js'
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

// GET /api/discover -> a deliberately public, read-only projection of every
// published thesis, joined to its author's public profile. Newest first.
export async function GET() {
  let theses
  try {
    theses = await listPublicTheses()
  } catch (error) {
    console.error('Discover projection failed', error)
    return NextResponse.json({ error: 'community feed unavailable' }, { status: 500 })
  }

  // Stored returns: closed theses use their sealed close return; active ones use
  // the last-persisted live return (refreshed on the owner's visits).
  const retOf = makeRetOf(null)

  const feed = theses.map((thesis) => ({
    ...thesis,
    ret: retOf(thesis),
    date: thesis.publishDate,
    snippet: snippetFrom(thesis.body),
  }))

  return NextResponse.json(feed)
}
