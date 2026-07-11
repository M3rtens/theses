import { useEffect, useState } from 'react'

// Fetches live native-currency entry/current/return for a set of theses and
// returns a map keyed by ticker. Position return is side-adjusted (a bear thesis
// gains when the price falls). Values are null until the fetch resolves; callers
// fall back to the static numbers so the view is never blank.
export function useLiveTheses(theses) {
  const [live, setLive] = useState({})

  // Re-run only when the set of tickers changes, not on every render.
  const key = theses.map((t) => t.ticker).join(',')

  useEffect(() => {
    let cancelled = false
    const items = theses.map((t) => ({ symbol: t.ticker, from: t.entryDate }))
    if (!items.length) return

    fetch('/api/cards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return
        const bySide = Object.fromEntries(theses.map((t) => [t.ticker, t.side]))
        const map = {}
        rows.forEach((q) => {
          if (!q || q.error || q.priceReturn == null) return
          const ret = bySide[q.symbol] === 'bear' ? -q.priceReturn : q.priceReturn
          map[q.symbol] = {
            currency: q.currency,
            entry: q.entry,
            current: q.current,
            ret: Number(ret.toFixed(1)),
          }
        })
        setLive(map)
      })
      .catch(() => { /* keep fallback values */ })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return live
}
