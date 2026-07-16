import 'server-only'
import { listTheses, updateThesis } from './thesesStore.js'
import { getFinancialStatements } from './yahoo.js'
import { evaluateTrigger } from './triggers.js'

// Recompute each stored thesis's financial-trigger statuses against the latest
// filings and persist any that changed. Called on load so the My Theses dots and
// the Trigger Dashboard reflect live standing, not just the publish-time snapshot.
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

  // Only active theses with metric-based (trackable) triggers need recomputing.
  const targets = all.filter(
    (t) => t.status !== 'closed' && Array.isArray(t.triggers) && t.triggers.some((tr) => tr?.metric),
  )
  if (!targets.length) return all

  const symbols = [...new Set(targets.map((t) => t.resolvedSymbol || t.ticker).filter(Boolean))]
  const bySymbol = {}
  await Promise.all(symbols.map(async (s) => { bySymbol[s] = await statementsFor(s) }))

  await Promise.all(targets.map(async (t) => {
    const statements = bySymbol[t.resolvedSymbol || t.ticker]
    if (!statements) return
    let changed = false
    const triggers = t.triggers.map((tr) => {
      if (!tr?.metric) return tr
      const { status } = evaluateTrigger(tr, statements)
      if (status && status !== tr.s) { changed = true; return { ...tr, s: status } }
      return tr
    })
    if (changed) await updateThesis(t.id, { triggers })
  }))

  return listTheses()
}
