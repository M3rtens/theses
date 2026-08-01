import { NextResponse } from 'next/server'
import { createClient } from '../../../src/lib/supabase/server'
import { makeRetOf, selfStats } from '../../../src/lib/stats.js'
import { listPublicTheses } from '../../../src/lib/publicThesesStore.js'

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

  let publicTheses
  try {
    publicTheses = await listPublicTheses()
  } catch (error) {
    console.error('Leaderboard projection failed', error)
    return NextResponse.json({ error: 'leaderboard unavailable' }, { status: 500 })
  }

  // Group each analyst's theses.
  const byUser = new Map()
  for (const thesis of publicTheses) {
    const list = byUser.get(thesis.ownerId) || []
    list.push(thesis)
    byUser.set(thesis.ownerId, list)
  }

  // Stored returns: closed theses use their sealed close return; active ones use
  // the latest return persisted by the scheduled refresh worker.
  const retOf = makeRetOf(null)

  const board = [...byUser.entries()]
    .map(([uid, theses]) => {
      const identity = theses[0] || {}
      return {
        userId: uid,
        name: identity.author || 'Analyst',
        handle: identity.handle || '',
        avatar: identity.authorAvatar || (identity.author ? identity.author.slice(0, 2).toUpperCase() : '—'),
        isYou: uid === user?.id,
        ...selfStats(theses, retOf),
      }
    })
    .sort((a, b) => b.avgReturn - a.avgReturn)
    .map((row, i) => ({ ...row, rank: i + 1 }))

  return NextResponse.json(board)
}
