import { NextResponse } from 'next/server'
import { createClient } from '../../../src/lib/supabase/server'
import { makeRetOf } from '../../../src/lib/stats.js'

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

// GET /api/discover -> the community feed: every published thesis across all
// users (public read policy → all rows), joined to its author's public profile
// for identity. Newest first. Shape matches what the Discover cards expect.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  }

  const [thesesRes, profilesRes] = await Promise.all([
    supabase
      .from('theses')
      .select('id, user_id, data, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
    supabase.from('profiles').select('id, name, handle, avatar'),
  ])
  if (thesesRes.error) {
    return NextResponse.json({ error: thesesRes.error.message }, { status: 500 })
  }

  const profileById = Object.fromEntries((profilesRes.data || []).map((p) => [p.id, p]))

  // Stored returns: closed theses use their sealed close return; active ones use
  // the last-persisted live return (refreshed on the owner's visits).
  const retOf = makeRetOf(null)

  const feed = (thesesRes.data || []).map((row) => {
    const thesis = { ...row.data, id: row.id }
    const p = profileById[row.user_id] || {}
    return {
      // Carry the whole thesis so opening a card can route to the real detail.
      ...thesis,
      ret: retOf(thesis),
      author: p.name || 'Analyst',
      handle: p.handle || '',
      date: thesis.publishDate,
      snippet: snippetFrom(thesis.body),
    }
  })

  return NextResponse.json(feed)
}
