import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../src/lib/supabase/admin.js'
import { makeRetOf } from '../../../src/lib/stats.js'
import { sanitizeThesisHtml } from '../../../src/lib/html.js'

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
  let supabase
  try {
    supabase = createAdminClient()
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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
    const thesis = {
      ...row.data,
      body: sanitizeThesisHtml(row.data?.body),
      id: row.id,
      ownerId: row.user_id,
    }
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
