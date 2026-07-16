// Derive the current user's leaderboard standing from their own theses, so the
// "you" row on the leaderboard (and the profile header, which mirrors it) shows
// real figures rather than the placeholder seed values. The other analysts have
// no backend yet and stay as-is.

// Side-adjusted position return for a thesis. A closed thesis is sealed at its
// close, so we use the stored close return; an open one tracks the live figure
// (falling back to the sealed snapshot until the quote resolves).
export function makeRetOf(live) {
  return (t) =>
    t.status === 'closed'
      ? Number(t.closeReturn ?? t.ret ?? 0)
      : Number(live?.[t.ticker]?.ret ?? t.ret ?? 0)
}

// The stats block for the user's own row, matching a leaderboard row's shape.
export function selfStats(theses, retOf) {
  const total = theses.length
  const closed = theses.filter((t) => t.status === 'closed')
  const wins = closed.filter((t) => retOf(t) > 0).length
  const winRate = closed.length ? Math.round((wins / closed.length) * 100) : 0

  const rets = theses.map(retOf)
  const avgReturn = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0

  const holds = theses.map((t) => Number(t.daysActive) || 0)
  const avgHoldDays = holds.length ? Math.round(holds.reduce((a, b) => a + b, 0) / holds.length) : 0
  // Annualising a sub-month average hold extrapolates noise into an absurd
  // figure, so only compound once the holding period is long enough to mean
  // something; otherwise report the raw average.
  const annualized = avgHoldDays >= 30 ? avgReturn * (365 / avgHoldDays) : avgReturn

  const best = theses.reduce((b, t) => (b == null || retOf(t) > retOf(b) ? t : b), null)
  const bestRet = best ? retOf(best) : 0
  const bestLabel = best
    ? `${best.ticker} · ${best.side === 'bear' ? 'Short' : 'Long'} · ${bestRet >= 0 ? '+' : '−'}${Math.abs(bestRet).toFixed(1)}%`
    : '—'

  return { theses: total, winRate, avgReturn, annualized, avgHold: `${avgHoldDays}d`, best: bestLabel, bestRet }
}

// Merge the user's real stats into the seeded rows and rank the whole board by
// average return, so the user lands in their earned position rather than a fixed
// seed rank.
export function rankedLeaderboard(rows, theses, live) {
  const retOf = makeRetOf(live)
  const stats = selfStats(theses, retOf)
  return rows
    .map((r) => (r.isYou ? { ...r, ...stats } : r))
    .sort((a, b) => b.avgReturn - a.avgReturn)
}
