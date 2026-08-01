import { evaluateTrigger } from './triggers.js'

export function buildThesisRefreshPatch(thesis, card, statements, now = Date.now()) {
  const patch = {}
  const current = Number(card?.current ?? card?.price)
  const entry = Number(thesis.entry)
  if (card && !card.error && Number.isFinite(current) && current > 0
    && Number.isFinite(entry) && entry > 0) {
    const priceReturn = ((current - entry) / entry) * 100
    const ret = Number(((thesis.side === 'bear' ? -1 : 1) * priceReturn).toFixed(1))
    const days = thesis.entryDate
      ? Math.max(0, Math.round((now - new Date(thesis.entryDate).getTime()) / 86400000))
      : thesis.daysActive
    if (ret !== thesis.ret) patch.ret = ret
    if (current !== thesis.current) patch.current = current
    if (days !== thesis.daysActive) patch.daysActive = days
  }

  if (statements && Array.isArray(thesis.triggers) && thesis.triggers.some((trigger) => trigger?.metric)) {
    let changed = false
    const triggers = thesis.triggers.map((trigger) => {
      if (!trigger?.metric) return trigger
      const { status } = evaluateTrigger(trigger, statements)
      if (status && status !== trigger.s) {
        changed = true
        return { ...trigger, s: status }
      }
      return trigger
    })
    if (changed) patch.triggers = triggers
  }
  return patch
}
