import { NextResponse } from 'next/server'
import { createClient } from '../../../src/lib/supabase/server'
import { createAdminClient } from '../../../src/lib/supabase/admin.js'
import { refreshStoredTriggers } from '../../../src/lib/evaluateTriggers.js'
import { makeRetOf, selfStats } from '../../../src/lib/stats.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/leaderboard -> ranked analysts computed from every user's stored
// theses, joined to their public profile for identity. Returns rows in the same
// shape the leaderboard/profile views expect.
export async function GET() {
  const sessionClient = await createClient()
  const {
    data: { user },
  } = await sessionClient.auth.getUser()

  let supabase
  try {
    supabase = createAdminClient()
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Refresh the caller's own theses first (user-scoped), so their row reflects
  // current prices. Other analysts refresh when they next visit. Non-fatal.
  if (user) {
    try {
      await refreshStoredTriggers()
    } catch {
      /* leave stored figures as-is */
    }
  }

  const [thesesRes, profilesRes] = await Promise.all([
    supabase.from('theses').select('user_id, data'),
    supabase.from('profiles').select('id, name, handle, avatar'),
  ])
  if (thesesRes.error) {
    return NextResponse.json({ error: thesesRes.error.message }, { status: 500 })
  }

  const profileById = Object.fromEntries((profilesRes.data || []).map((p) => [p.id, p]))

  // Group each analyst's theses.
  const byUser = new Map()
  for (const row of thesesRes.data || []) {
    const list = byUser.get(row.user_id) || []
    list.push(row.data)
    byUser.set(row.user_id, list)
  }

  // Stored returns: closed theses use their sealed close return; active use the
  // last-persisted live return (refreshed on the owner's visits).
  const retOf = makeRetOf(null)

  const board = [...byUser.entries()]
    .map(([uid, theses]) => {
      const p = profileById[uid] || {}
      return {
        userId: uid,
        name: p.name || 'Analyst',
        handle: p.handle || '',
        avatar: p.avatar || (p.name ? p.name.slice(0, 2).toUpperCase() : '—'),
        isYou: uid === user?.id,
        ...selfStats(theses, retOf),
      }
    })
    .sort((a, b) => b.avgReturn - a.avgReturn)
    .map((row, i) => ({ ...row, rank: i + 1 }))

  return NextResponse.json(board)
}
