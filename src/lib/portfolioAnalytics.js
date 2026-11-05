const DAY_MS = 86_400_000

const dateKey = (value) => {
  if (!value) return null
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
  }
  if (typeof value === 'object' && value.year && value.month && value.day) {
    return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

const finite = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const seriesMap = (rows) => new Map((Array.isArray(rows) ? rows : [])
  .map((row) => [dateKey(row?.time || row?.date), finite(row?.value ?? row?.close)])
  .filter(([date, value]) => date && value != null && value > 0))

const latestOnOrBefore = (rows, target) => {
  let latest = null
  for (const [date, value] of rows) {
    if (date > target) break
    latest = value
  }
  return latest
}

const holdingDays = (thesis) => {
  const explicit = finite(thesis.daysActive)
  if (explicit != null && explicit >= 0) return Math.round(explicit)
  const start = Date.parse(thesis.entryDate)
  const end = Date.parse(thesis.closedAt || thesis.closeDate || new Date().toISOString())
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / DAY_MS)) : 0
}

const holdingBucket = (days) => {
  if (days <= 30) return '0–30d'
  if (days <= 90) return '31–90d'
  if (days <= 180) return '91–180d'
  return '181d+'
}

function exposure(theses, field, fallback) {
  if (!theses.length) return []
  const counts = new Map()
  theses.forEach((thesis) => {
    const label = String(thesis[field] || fallback).trim() || fallback
    counts.set(label, (counts.get(label) || 0) + 1)
  })
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, percentage: Number(((count / theses.length) * 100).toFixed(1)) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function maxDrawdown(curve) {
  let peak = 100
  let worst = 0
  curve.forEach(({ value }) => {
    peak = Math.max(peak, value)
    worst = Math.min(worst, ((value / peak) - 1) * 100)
  })
  return Number(worst.toFixed(1))
}

// Builds a time-weighted portfolio index. Every thesis is one equal-weight
// sleeve while open, rebalanced daily; closed theses leave the next session.
// This makes native-currency positions comparable without pretending that the
// journal tracks deposits, position sizes, or FX exposure.
export function buildPortfolioAnalytics(theses, market = {}) {
  const valid = (Array.isArray(theses) ? theses : []).filter((thesis) => (
    thesis?.id != null && dateKey(thesis.entryDate) && finite(thesis.entry) > 0
  ))
  const active = valid.filter((thesis) => thesis.status !== 'closed')
  const closed = valid.filter((thesis) => thesis.status === 'closed')
  const benchmarkRows = [...seriesMap(market.benchmark)].sort(([a], [b]) => a.localeCompare(b))
  const histories = market.histories || {}
  const positions = valid.map((thesis) => {
    const entryDate = dateKey(thesis.entryDate)
    const closeDate = thesis.status === 'closed' ? dateKey(thesis.closedAt || thesis.closeDate) : null
    const history = [...seriesMap(histories[thesis.id] || histories[String(thesis.id)])]
      .filter(([date]) => date >= entryDate && (!closeDate || date <= closeDate))
      .sort(([a], [b]) => a.localeCompare(b))
    const benchmarkEntry = latestOnOrBefore(benchmarkRows, entryDate)
      || benchmarkRows.find(([date]) => date >= entryDate)?.[1]
    return {
      thesis,
      entryDate,
      closeDate,
      entry: finite(thesis.entry),
      closeReturn: finite(thesis.closeReturn ?? thesis.ret),
      history: new Map(history),
      benchmarkEntry,
      previousIndex: 100,
      previousBenchmarkIndex: 100,
      seen: false,
      benchmarkSeen: false,
    }
  })

  const dates = [...new Set(positions.flatMap((position) => [...position.history.keys()]))].sort()
  const equityCurve = []
  const benchmarkCurve = []
  let equity = 100
  let benchmarkEquity = 100

  dates.forEach((date) => {
    const members = positions.filter((position) => (
      date >= position.entryDate && (!position.closeDate || date <= position.closeDate)
    ))
    const returns = []
    const benchmarkReturns = []

    members.forEach((position) => {
      const price = position.history.get(date)
      if (price != null) {
        const isClose = position.closeDate === date && position.closeReturn != null
        const priceMove = ((price / position.entry) - 1) * 100
        const currentIndex = 100 + (isClose
          ? position.closeReturn
          : (position.thesis.side === 'bear' ? -priceMove : priceMove))
        if (position.seen && position.previousIndex > 0) returns.push((currentIndex / position.previousIndex) - 1)
        else returns.push(0)
        position.previousIndex = currentIndex
        position.seen = true
      } else if (position.seen) {
        // A closed exchange contributes a flat sleeve instead of silently
        // changing portfolio weights when another market remains open.
        returns.push(0)
      }

      if (position.seen && position.benchmarkEntry) {
        const benchmarkPrice = latestOnOrBefore(benchmarkRows, date)
        if (benchmarkPrice) {
          const currentBenchmarkIndex = 100 * (benchmarkPrice / position.benchmarkEntry)
          benchmarkReturns.push(position.benchmarkSeen && position.previousBenchmarkIndex > 0
            ? (currentBenchmarkIndex / position.previousBenchmarkIndex) - 1
            : 0)
          position.previousBenchmarkIndex = currentBenchmarkIndex
          position.benchmarkSeen = true
        }
      }
    })

    if (!returns.length) return
    equity *= 1 + (returns.reduce((sum, value) => sum + value, 0) / returns.length)
    if (benchmarkReturns.length) {
      benchmarkEquity *= 1 + (benchmarkReturns.reduce((sum, value) => sum + value, 0) / benchmarkReturns.length)
    }
    equityCurve.push({ time: date, value: Number(equity.toFixed(2)) })
    if (benchmarkReturns.length) benchmarkCurve.push({ time: date, value: Number(benchmarkEquity.toFixed(2)) })
  })

  const hitRates = ['0–30d', '31–90d', '91–180d', '181d+'].map((label) => {
    const rows = closed.filter((thesis) => holdingBucket(holdingDays(thesis)) === label)
    const wins = rows.filter((thesis) => finite(thesis.closeReturn ?? thesis.ret) > 0).length
    return { label, theses: rows.length, wins, winRate: rows.length ? Math.round((wins / rows.length) * 100) : null }
  })
  const totalReturn = equityCurve.length ? equityCurve.at(-1).value - 100 : 0
  const benchmarkReturn = benchmarkCurve.length ? benchmarkCurve.at(-1).value - 100 : null

  return {
    methodology: 'Time-weighted, daily equal-weighted across open theses; returns are side-adjusted and normalized across native currencies.',
    summary: {
      totalReturn: Number(totalReturn.toFixed(1)),
      benchmarkReturn: benchmarkReturn == null ? null : Number(benchmarkReturn.toFixed(1)),
      alpha: benchmarkReturn == null ? null : Number((totalReturn - benchmarkReturn).toFixed(1)),
      maxDrawdown: maxDrawdown(equityCurve),
      activeTheses: active.length,
      closedTheses: closed.length,
    },
    equityCurve,
    benchmarkCurve,
    sectorExposure: exposure(active, 'sector', 'Other'),
    sideExposure: exposure(active.map((thesis) => ({ ...thesis, side: thesis.side === 'bear' ? 'Short' : 'Long' })), 'side', 'Long'),
    hitRates,
  }
}
