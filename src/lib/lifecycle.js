import { timingSafeEqual } from 'node:crypto'

const MAX_MARKET_AGE_MS = 30 * 60_000
const MAX_FUTURE_SKEW_MS = 5 * 60_000

export function calendarDateInTimezone(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${byType.year}-${byType.month}-${byType.day}`
  } catch {
    return null
  }
}

export function marketSnapshotEligibility(snapshot, scheduledDate, timeZone, now = Date.now()) {
  if (!snapshot || snapshot.marketState !== 'REGULAR') {
    return { eligible: false, reason: 'market_closed', failure: false }
  }

  const marketTime = new Date(snapshot.marketTime || '')
  const marketMs = marketTime.getTime()
  if (!Number.isFinite(marketMs)
    || marketMs > now + MAX_FUTURE_SKEW_MS
    || now - marketMs > MAX_MARKET_AGE_MS) {
    return { eligible: false, reason: 'stale_market_snapshot', failure: true }
  }

  const marketDate = calendarDateInTimezone(marketTime, timeZone)
  if (!marketDate) return { eligible: false, reason: 'invalid_exchange_timezone', failure: true }
  if (marketDate < scheduledDate) {
    return { eligible: false, reason: 'market_date_before_schedule', failure: false }
  }
  return { eligible: true, reason: null, failure: false, marketDate }
}

export function lifecycleErrorCode(error) {
  const message = String(error?.message || '').toLowerCase()
  if (message.includes('timeout') || error?.name === 'TimeoutError') return 'provider_timeout'
  if (message.includes('no live price') || message.includes('no price')) return 'price_unavailable'
  if (message.includes('timezone')) return 'invalid_exchange_timezone'
  if (message.includes('market_snapshot')) return 'invalid_market_snapshot'
  return 'provider_unavailable'
}

export function verifyWorkerAuthorization(request, secret = process.env.LIFECYCLE_WORKER_SECRET) {
  if (!secret || secret.length < 16) return false
  const authorization = request.headers.get('authorization') || ''
  const actual = Buffer.from(authorization)
  const expected = Buffer.from(`Bearer ${secret}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function hydrateScheduledPublication(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {}
  const text = String(payload.body || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ')
  return {
    ...payload,
    id: `scheduled-${row.id}`,
    scheduledPublicationId: row.id,
    scheduledPublicationDate: row.status === 'draft' ? null : row.scheduled_date,
    lastScheduledPublicationDate: row.scheduled_date,
    scheduleStatus: row.status,
    scheduleAttempts: Number(row.attempt_count || 0),
    scheduleError: row.last_error_code || null,
    savedAt: Date.parse(row.updated_at || row.created_at) || Date.now(),
    createdAt: row.created_at,
    resolvedSymbol: row.resolved_symbol,
    exchange: row.exchange,
    exchangeTimezone: row.exchange_timezone,
    wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
    triggersCount: Array.isArray(payload.triggers) ? payload.triggers.length : 0,
  }
}
