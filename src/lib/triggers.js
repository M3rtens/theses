// Structured invalidation triggers tied to a security's fetched financial
// statements. A trigger names a statement line item (e.g. "Total Revenue"), a
// reporting period, a comparison operator, and a threshold the author enters.
// Because it carries the metric identity, it can be re-evaluated against live
// financials at any time — the thesis "breaks" when the condition holds true.

export const TRIGGER_OPERATORS = [
  { op: '<', label: '<' },
  { op: '<=', label: '≤' },
  { op: '>', label: '>' },
  { op: '>=', label: '≥' },
  { op: '==', label: '=' },
]

export const TRIGGER_STATEMENTS = [
  { key: 'income', label: 'Income Statement' },
  { key: 'balance', label: 'Balance Sheet' },
  { key: 'cashflow', label: 'Cash Flow' },
]

export const TRIGGER_PERIODS = [
  { key: 'annual', label: 'Annual' },
  { key: 'quarterly', label: 'Quarterly' },
]

// Magnitude scales offered for money and share-count metrics, so a threshold can
// be entered in the natural size for the company (thousands, millions, billions).
export const MONEY_SCALES = [
  { key: 'K', suffix: 'K', divisor: 1e3, precision: 0 },
  { key: 'M', suffix: 'M', divisor: 1e6, precision: 0 },
  { key: 'B', suffix: 'B', divisor: 1e9, precision: 2 },
]
const DEFAULT_SCALE = 'M'
const scaleInfo = (scale) => MONEY_SCALES.find((s) => s.key === scale) || MONEY_SCALES.find((s) => s.key === DEFAULT_SCALE)

// Raw-unit multiplier for a threshold entered at a given scale (per-share is 1:1).
export const scaleDivisor = (kind, scale) => (kind === 'perShare' ? 1 : scaleInfo(scale).divisor)

// Operators surfaced in the composer with plain-language synonyms, so typing
// "greater", "over", ">" all resolve to the same comparison.
export const OPERATOR_SUGGESTIONS = [
  { op: '<', symbol: '<', label: 'less than', terms: ['less than', 'below', 'under', 'lt'] },
  { op: '<=', symbol: '≤', label: 'at most', terms: ['at most', 'less than or equal', 'no more than', 'lte'] },
  { op: '>', symbol: '>', label: 'greater than', terms: ['greater than', 'above', 'over', 'more than', 'gt'] },
  { op: '>=', symbol: '≥', label: 'at least', terms: ['at least', 'greater than or equal', 'no less than', 'gte'] },
  { op: '==', symbol: '=', label: 'equals', terms: ['equals', 'equal to', 'is'] },
]

// The natural scale for a raw value, so the default threshold reads sensibly
// (e.g. a mega-cap's revenue defaults to billions, a small-cap's to millions).
export const suggestScale = (raw) => {
  const n = Math.abs(Number(raw))
  if (!Number.isFinite(n) || n === 0) return DEFAULT_SCALE
  if (n >= 1e9) return 'B'
  if (n >= 1e6) return 'M'
  return 'K'
}

// Display units for a metric kind at a given scale, matching the Financials
// tables: money/shares are scaled; per-share values are shown as-is.
const unitInfo = (kind, scale) => {
  if (kind === 'perShare') return { divisor: 1, suffix: '', precision: 2 }
  const s = scaleInfo(scale)
  return { divisor: s.divisor, suffix: s.suffix, precision: s.precision }
}

const CURRENCY_SYMBOL = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' }
const csym = (c) => CURRENCY_SYMBOL[c] || (c ? `${c} ` : '')

// The unit hint shown next to the value input, e.g. "€B" or "M shares".
export const unitHint = (kind, currency, scale) => {
  if (kind === 'perShare') return `${csym(currency)}/share`
  if (kind === 'shares') return `${scaleInfo(scale).suffix} shares`
  return `${csym(currency)}${scaleInfo(scale).suffix}`
}

// The rows available to pick from for a given statement + period.
export const metricRows = (statements, statement, period) =>
  statements?.[statement]?.[period]?.rows || []

// Whether the company actually reports a statement at a given cadence — some
// securities return only annual (or only quarterly) filings from the data feed.
export const periodHasData = (statements, statement, period) => {
  const table = statements?.[statement]?.[period]
  return Boolean(table && Array.isArray(table.rows) && table.rows.length > 0)
}

// The reporting cadences actually available for a statement, in Annual→Quarterly
// order. Used to offer only the periods the company files.
export const availablePeriods = (statements, statement) =>
  TRIGGER_PERIODS.filter((p) => periodHasData(statements, statement, p.key))

// A flat, de-duplicated index of every line item the composer can autocomplete,
// carrying the statement it belongs to (and thus which statement a typed metric
// resolves to) and its kind. Preserves statement + reporting order.
export const metricIndex = (statements) => {
  const out = []
  const seen = new Set()
  for (const s of TRIGGER_STATEMENTS) {
    for (const p of availablePeriods(statements, s.key)) {
      for (const row of metricRows(statements, s.key, p.key)) {
        const key = `${s.key}:${row.label}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ label: row.label, statement: s.key, statementLabel: s.label, kind: row.kind })
      }
    }
  }
  return out
}

// A trigger's comparisons as an array, tolerating the legacy single-comparison
// shape. Each entry: { op, value, scale, connector } (connector joins to the
// previous comparison; null on the first).
export const comparisonsOf = (t) => {
  if (Array.isArray(t?.comparisons) && t.comparisons.length) return t.comparisons
  if (t?.op && t?.value != null) return [{ op: t.op, value: t.value, scale: t.scale, connector: null }]
  return []
}

// The latest reported value for a statement row, converted to display units at
// the given scale. Returns { value, raw, kind, period } or null when unreadable.
export function latestMetric(statements, statement, period, metricLabel, scale) {
  const table = statements?.[statement]?.[period]
  const row = table?.rows?.find((r) => r.label === metricLabel)
  if (!row) return null
  const raw = [...row.values].reverse().find((v) => v != null)
  if (raw == null) return null
  const { divisor } = unitInfo(row.kind, scale)
  return {
    value: raw / divisor,
    raw,
    kind: row.kind,
    period: table.periods?.[table.periods.length - 1]?.label || null,
  }
}

// Format a display-unit value with its unit + currency at the given scale.
export function formatMetricValue(value, kind, currency, scale) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const { suffix, precision } = unitInfo(kind, scale)
  const num = Number(value).toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision })
  if (kind === 'shares') return `${num}${suffix}`
  return `${csym(currency)}${num}${suffix}`
}

// A human-readable condition label, e.g.
// "Total Revenue < $300B and > $200B · quarterly".
export function triggerLabel(t) {
  const comps = comparisonsOf(t)
  if (!t?.metric || !comps.length) return t?.metric || ''
  const parts = comps.map((c, i) => {
    const opLabel = (TRIGGER_OPERATORS.find((o) => o.op === c.op) || {}).label || c.op
    const val = formatMetricValue(c.value, t.kind, t.currency, c.scale)
    return `${i > 0 ? `${c.connector || 'and'} ` : ''}${opLabel} ${val}`
  })
  const period = t.period ? ` · ${t.period === 'quarterly' ? 'quarterly' : 'annual'}` : ''
  return `${t.metric} ${parts.join(' ')}${period}`
}

const compare = (op, a, b) => {
  switch (op) {
    case '<': return a < b
    case '<=': return a <= b
    case '>': return a > b
    case '>=': return a >= b
    // Financial figures rarely land exactly equal; treat within 0.5% as equal.
    case '==': return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 0.005)
    default: return false
  }
}

const isNear = (op, actual, threshold) => {
  const margin = Math.abs(threshold) * 0.05
  if (op === '<' || op === '<=') return actual <= threshold + margin
  if (op === '>' || op === '>=') return actual >= threshold - margin
  return Math.abs(actual - threshold) <= margin
}

// Evaluate a structured trigger against fetched statements. Returns
// { current, period, status }:
//   breached — the invalidation condition holds (thesis broken)
//   warning  — a comparison is within 5% of its threshold, on the breach side
//   clear    — comfortably within safe parameters
// Comparisons are folded left-to-right with their and/or connectors, all against
// the same latest reported figure. Falls back to stored status when unreadable.
export function evaluateTrigger(t, statements) {
  if (!t?.metric || !statements) return { current: null, period: null, status: t?.s || 'clear' }
  const latest = latestMetric(statements, t.statement, t.period, t.metric, t.scale)
  if (!latest) return { current: null, period: null, status: t?.s || 'clear' }
  const raw = latest.raw
  const comps = comparisonsOf(t)
  if (!comps.length) return { current: latest.value, period: latest.period, status: 'clear' }

  let breached = null
  let warning = false
  for (let i = 0; i < comps.length; i += 1) {
    const c = comps[i]
    const value = Number(c.value)
    if (!Number.isFinite(value)) continue
    const threshold = value * scaleDivisor(t.kind, c.scale)
    const hit = compare(c.op, raw, threshold)
    if (!hit && isNear(c.op, raw, threshold)) warning = true
    if (breached === null) breached = hit
    else breached = c.connector === 'or' ? (breached || hit) : (breached && hit)
  }

  const status = breached ? 'breached' : warning ? 'warning' : 'clear'
  return { current: latest.value, period: latest.period, status }
}
