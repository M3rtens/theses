import { NextResponse } from 'next/server'
import { createClient } from '../../../src/lib/supabase/server'
import { buildLeaderboardPage, parseLeaderboardQuery } from '../../../src/lib/community.js'
import { listPublicTheses } from '../../../src/lib/publicThesesStore.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/leaderboard -> a ranked analyst page. Filters first select matching
// theses from each complete public portfolio, then statistics and ranks are
// recalculated from those matching positions.
export async function GET(request) {
  let options
  try {
    options = parseLeaderboardQuery(new URL(request.url).searchParams)
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

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

  return NextResponse.json(buildLeaderboardPage(publicTheses, options, user?.id))
}
