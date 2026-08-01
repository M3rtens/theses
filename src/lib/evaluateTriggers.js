import 'server-only'
import { listTheses, updateThesisMetrics } from './thesesStore.js'
import { getFinancialStatements, getCardData } from './yahoo.js'
import { evaluateTrigger } from './triggers.js'

// Refresh each of the current user's active theses on load: recompute live
// position return (persisted so it feeds the leaderboard's stored figures) and
// re-evaluate financial-trigger statuses against the latest filings. Only rows
// that actually change are written back.
//
// Statement fetches are cached briefly per symbol so navigating between views
// (each of which loads theses) doesn't re-hit Yahoo every time.
const CACHE_TTL_MS = 5 * 60 * 1000
const statementCache = new Map() // symbol -> { at, data }

async function statementsFor(symbol) {
  const hit = statementCache.get(symbol)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data
  try {
    const data = await getFinancialStatements(symbol)
    statementCache.set(symbol, { at: Date.now(), data })
    return data
  } catch {
    return null
  }
}

export async function refreshStoredTriggers() {
  const all = await listTheses()
  const active = all.filter((t) => t.status !== 'closed')
  if (!active.length) return all

  // --- Live price/return refresh for every active thesis ---
  const cardBySymbol = {}
  try {
    const items = active.map((t) => ({ symbol: t.resolvedSymbol || t.ticker, from: t.entryDate }))
    const cards = await getCardData(items)
    cards.forEach((c) => { if (c && !c.error) cardBySymbol[c.symbol] = c })
  } catch {
    // Prices unavailable — leave stored returns as they are.
  }

  // --- Financial statements for theses with metric-based triggers ---
  const triggerTargets = active.filter(
    (t) => Array.isArray(t.triggers) && t.triggers.some((tr) => tr?.metric),
  )
  const symbols = [...new Set(triggerTargets.map((t) => t.resolvedSymbol || t.ticker).filter(Boolean))]
  const bySymbol = {}
  await Promise.all(symbols.map(async (s) => { bySymbol[s] = await statementsFor(s) }))

  const now = Date.now()
  await Promise.all(active.map(async (t) => {
    const patch = {}

    // Live return: the card gives a raw price move; apply side (bear inverts).
    const card = cardBySymbol[t.resolvedSymbol || t.ticker]
    if (card && card.priceReturn != null) {
      const ret = Number(((t.side === 'bear' ? -1 : 1) * card.priceReturn).toFixed(1))
      const days = t.entryDate
        ? Math.max(0, Math.round((now - new Date(t.entryDate).getTime()) / 86400000))
        : t.daysActive
      if (ret !== t.ret) patch.ret = ret
      if (card.current != null && card.current !== t.current) patch.current = card.current
      if (days !== t.daysActive) patch.daysActive = days
    }

    // Trigger statuses against the latest filings.
    if (Array.isArray(t.triggers) && t.triggers.some((tr) => tr?.metric)) {
      const statements = bySymbol[t.resolvedSymbol || t.ticker]
      if (statements) {
        let changed = false
        const triggers = t.triggers.map((tr) => {
          if (!tr?.metric) return tr
          const { status } = evaluateTrigger(tr, statements)
          if (status && status !== tr.s) { changed = true; return { ...tr, s: status } }
          return tr
        })
        if (changed) patch.triggers = triggers
      }
    }

    if (Object.keys(patch).length) await updateThesisMetrics(t.id, patch)
  }))

  return listTheses()
}
