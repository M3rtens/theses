import { NextResponse } from 'next/server'
import { errorStatus } from '../../../src/lib/auth.js'
import { buildPortfolioAnalytics } from '../../../src/lib/portfolioAnalytics.js'
import { listTheses } from '../../../src/lib/thesesStore.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ANALYTICS_THESES = 50

export async function GET() {
  try {
    const theses = await listTheses()
    const allEligible = theses
      .filter((thesis) => thesis.id != null && thesis.ticker && thesis.entryDate && Number(thesis.entry) > 0)
    const eligible = allEligible.slice(0, MAX_ANALYTICS_THESES)
    if (!eligible.length) return NextResponse.json(buildPortfolioAnalytics([], {}))

    const { getPortfolioMarketData } = await import('../../../src/lib/yahoo.js')
    const market = await getPortfolioMarketData(eligible.map((thesis) => ({
      id: thesis.id,
      symbol: thesis.resolvedSymbol || thesis.ticker,
      from: thesis.entryDate,
    })))
    return NextResponse.json({
      ...buildPortfolioAnalytics(eligible, market),
      coverage: { included: eligible.length, total: allEligible.length, truncated: allEligible.length > eligible.length },
    }, {
      headers: { 'Cache-Control': 'private, max-age=0, no-store' },
    })
  } catch (error) {
    console.error('Portfolio analytics failed', error)
    return NextResponse.json({ error: error.message }, { status: errorStatus(error) })
  }
}
