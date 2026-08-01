import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import nextConfig from '../next.config.mjs'
import {
  cleanWorkbookModel,
  isCalendarDate,
  readJsonObject,
  validateCardItems,
  validateHistoryDate,
  validateLifecyclePayload,
  validateNotificationReadPayload,
  validateScheduledPublicationPayload,
  validateThesisPayload,
  validateUpdatePayload,
} from '../src/lib/apiValidation.js'
import { sanitizeThesisHtml } from '../src/lib/html.js'
import { normalizePublicUrl } from '../src/lib/urls.js'
import { createAsyncCache } from '../src/lib/asyncCache.js'
import { hydrateProjectedThesis } from '../src/lib/publicTheses.js'
import {
  calendarDateInTimezone,
  marketSnapshotEligibility,
  verifyWorkerAuthorization,
} from '../src/lib/lifecycle.js'
import { buildThesisRefreshPatch } from '../src/lib/refreshMetrics.js'
import {
  checkRateLimit,
  rateLimitFailure,
  resetRateLimitsForTests,
} from '../src/lib/rateLimit.js'

const minimalModel = (link) => ({
  filename: 'Model.xlsx',
  sheets: [{
    name: 'Model',
    model: {
      headers: ['2026'],
      rows: [{ label: 'Revenue', values: ['100'] }],
      formats: link ? { '0,0': { b: true, link } } : {},
      comments: {},
      merges: [],
    },
  }],
})

test('thesis HTML sanitizer preserves editor markup and removes active content', () => {
  const dirty = [
    '<h1 onclick="alert(1)">Heading</h1>',
    '<img src=x onerror="alert(1)">',
    '<svg onload="alert(1)"><script>alert(1)</script></svg>',
    '<a href="jAvAsCrIpT:alert(1)" target="_blank">bad</a>',
    '<a href="https://example.com" target="_blank" rel="opener">safe</a>',
    '<p style="background:url(javascript:alert(1))">Body</p>',
  ].join('')
  const clean = sanitizeThesisHtml(dirty)

  assert.match(clean, /<h1>Heading<\/h1>/)
  assert.match(clean, /<p>Body<\/p>/)
  assert.match(clean, /href="https:\/\/example.com"/)
  assert.match(clean, /rel="noopener noreferrer"/)
  assert.doesNotMatch(clean, /onclick|onerror|onload|javascript:|<script|<svg|<img|style=/i)
})

test('public URL normalization accepts supported destinations only', () => {
  assert.equal(normalizePublicUrl('HTTPS://Example.com/model'), 'https://example.com/model')
  assert.equal(normalizePublicUrl('example.com/model', { assumeHttps: true }), 'https://example.com/model')
  assert.equal(normalizePublicUrl('#assumptions'), '#assumptions')
  assert.equal(normalizePublicUrl('mailto:analyst@example.com'), 'mailto:analyst@example.com')
  assert.equal(normalizePublicUrl('tel:+61234567890'), 'tel:+61234567890')
  for (const unsafe of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,alert(1)',
    'file:///etc/passwd',
    '//example.com/path',
    'https://user:password@example.com',
    'https://example.com/\u0000bad',
    '%6a%61vascript:alert(1)',
  ]) assert.equal(normalizePublicUrl(unsafe), null, unsafe)
})

test('published workbook validation normalizes safe links and rejects unsafe links', () => {
  const clean = cleanWorkbookModel(minimalModel('https://example.com/model'))
  assert.equal(clean.sheets[0].model.formats['0,0'].link, 'https://example.com/model')
  assert.throws(
    () => cleanWorkbookModel(minimalModel('javascript:alert(1)')),
    /unsafe hyperlink/,
  )
})

test('thesis payload validation applies limits, sanitization, and unknown-field rejection', () => {
  const clean = validateThesisPayload({
    title: ' Durable growth ',
    ticker: 'asml.as',
    company: 'ASML',
    sector: 'Semiconductors',
    side: 'bull',
    body: '<p onclick="bad()">Thesis</p>',
    triggers: [],
    model: null,
    draftId: 'local-only',
  })
  assert.equal(clean.title, 'Durable growth')
  assert.equal(clean.ticker, 'ASML.AS')
  assert.equal(clean.body, '<p>Thesis</p>')
  assert.throws(() => validateThesisPayload({ title: 'x', ticker: 'AAPL', side: 'bull', unexpected: true }), /unsupported field/)
  assert.throws(() => validateThesisPayload({ title: 'x'.repeat(201), ticker: 'AAPL', side: 'bull' }), /200 characters/)
})

test('date and lifecycle validation rejects impossible and stale dates', () => {
  assert.equal(isCalendarDate('2028-02-29'), true)
  assert.equal(isCalendarDate('2027-02-29'), false)
  assert.equal(isCalendarDate('2027-99-99'), false)
  assert.equal(validateHistoryDate('1970-01-01'), '1970-01-01')
  assert.throws(() => validateHistoryDate('1969-12-31'), /supported history range/)
  assert.throws(() => validateLifecyclePayload({ action: 'schedule-close', closeDate: '2027-99-99' }), /real calendar date/)
  assert.deepEqual(validateLifecyclePayload({ action: 'close' }), { action: 'close' })
})

test('scheduled publication and notification requests validate durable inputs', () => {
  const scheduledDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const scheduled = validateScheduledPublicationPayload({
    title: 'Scheduled thesis',
    ticker: 'aapl',
    side: 'bull',
    scheduledPublicationDate: scheduledDate,
    scheduledPublicationId: 12,
  })
  assert.equal(scheduled.scheduledDate, scheduledDate)
  assert.equal(scheduled.thesis.ticker, 'AAPL')
  assert.deepEqual(validateNotificationReadPayload({ ids: [3, 3, 7] }), {
    all: false,
    ids: [3, 7],
  })
  assert.deepEqual(validateNotificationReadPayload({ all: true }), { all: true, ids: [] })
  assert.throws(() => validateNotificationReadPayload({ ids: [0] }), /positive integers/)
})

test('exchange-local scheduling requires a fresh regular-session snapshot', () => {
  const now = Date.parse('2026-08-03T15:00:00.000Z')
  assert.equal(calendarDateInTimezone('2026-08-01T00:30:00.000Z', 'America/New_York'), '2026-07-31')
  assert.equal(calendarDateInTimezone('2026-08-01T00:30:00.000Z', 'Australia/Sydney'), '2026-08-01')

  const snapshot = {
    marketState: 'REGULAR',
    marketTime: '2026-08-03T14:59:00.000Z',
  }
  assert.deepEqual(
    marketSnapshotEligibility(snapshot, '2026-08-03', 'America/New_York', now),
    { eligible: true, reason: null, failure: false, marketDate: '2026-08-03' },
  )
  assert.deepEqual(
    marketSnapshotEligibility({ ...snapshot, marketState: 'CLOSED' }, '2026-08-03', 'America/New_York', now),
    { eligible: false, reason: 'market_closed', failure: false },
  )
  assert.deepEqual(
    marketSnapshotEligibility({ ...snapshot, marketTime: '2026-08-03T13:00:00.000Z' }, '2026-08-03', 'America/New_York', now),
    { eligible: false, reason: 'stale_market_snapshot', failure: true },
  )
  assert.deepEqual(
    marketSnapshotEligibility(snapshot, '2026-08-04', 'America/New_York', now),
    { eligible: false, reason: 'market_date_before_schedule', failure: false },
  )
})

test('worker authentication uses the configured bearer secret', () => {
  const secret = 'test-worker-secret-1234567890'
  const valid = new Request('https://example.test/api/internal/lifecycle', {
    headers: { authorization: `Bearer ${secret}` },
  })
  const invalid = new Request('https://example.test/api/internal/lifecycle', {
    headers: { authorization: 'Bearer wrong-secret-value' },
  })
  assert.equal(verifyWorkerAuthorization(valid, secret), true)
  assert.equal(verifyWorkerAuthorization(invalid, secret), false)
  assert.equal(verifyWorkerAuthorization(valid, 'short'), false)
})

test('background return refreshes use the sealed entry price', () => {
  const now = Date.parse('2026-08-11T00:00:00.000Z')
  const bull = buildThesisRefreshPatch({
    side: 'bull', entry: 100, current: 100, ret: 0, entryDate: '2026-08-01', daysActive: 0,
  }, { current: 112 }, null, now)
  assert.deepEqual(bull, { ret: 12, current: 112, daysActive: 10 })

  const bear = buildThesisRefreshPatch({
    side: 'bear', entry: 100, current: 100, ret: 0, entryDate: '2026-08-01', daysActive: 0,
  }, { price: 90 }, null, now)
  assert.deepEqual(bear, { ret: 10, current: 90, daysActive: 10 })
})

test('updates and card batches enforce field and fan-out limits', () => {
  assert.deepEqual(validateUpdatePayload({ text: '  New evidence  ' }), { text: 'New evidence' })
  assert.throws(() => validateUpdatePayload({ text: 'x'.repeat(5_001) }), /5000 characters/)

  const items = validateCardItems({ items: [
    { symbol: 'aapl', from: '2026-01-02' },
    { symbol: 'AAPL', from: '2026-01-02' },
  ] })
  assert.deepEqual(items, [{ symbol: 'AAPL', from: '2026-01-02' }])
  assert.throws(
    () => validateCardItems({ items: Array.from({ length: 26 }, (_, index) => ({ symbol: `A${index}`, from: '2026-01-02' })) }),
    /no more than 25/,
  )
})

test('JSON request reader enforces content type and actual byte size', async () => {
  const valid = new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  })
  assert.deepEqual(await readJsonObject(valid, 100), { ok: true })

  const wrongType = new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{}',
  })
  await assert.rejects(() => readJsonObject(wrongType, 100), (error) => error.status === 415)

  const oversized = new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(100) }),
  })
  await assert.rejects(() => readJsonObject(oversized, 50), (error) => error.status === 413)
})

test('application responses include the baseline browser security headers', async () => {
  const rules = await nextConfig.headers()
  const headers = Object.fromEntries(rules[0].headers.map(({ key, value }) => [key, value]))
  assert.match(headers['Content-Security-Policy'], /object-src 'none'/)
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/)
  assert.equal(headers['X-Content-Type-Options'], 'nosniff')
  assert.equal(headers['X-Frame-Options'], 'DENY')
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin')
})

test('async provider cache deduplicates in-flight work and never stores failures', async () => {
  const cache = createAsyncCache({ ttlMs: 60_000, maxEntries: 10 })
  let loads = 0
  let resolveLoad
  const pending = new Promise((resolve) => { resolveLoad = resolve })
  const first = cache.get('AAPL', async () => {
    loads += 1
    return pending
  })
  const second = cache.get('AAPL', () => {
    loads += 1
    return 'unexpected'
  })
  resolveLoad({ price: 100 })
  assert.deepEqual(await Promise.all([first, second]), [{ price: 100 }, { price: 100 }])
  assert.equal(loads, 1)

  let attempts = 0
  await assert.rejects(() => cache.get('failure', async () => {
    attempts += 1
    throw new Error('provider down')
  }), /provider down/)
  assert.equal(await cache.get('failure', async () => {
    attempts += 1
    return 'recovered'
  }), 'recovered')
  assert.equal(attempts, 2)
})

test('public route limiter scopes clients and returns retry guidance', () => {
  resetRateLimitsForTests()
  const firstClient = new Request('https://example.test/api/quotes', {
    headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
  })
  const secondClient = new Request('https://example.test/api/quotes', {
    headers: { 'x-forwarded-for': '203.0.113.2' },
  })
  const options = { scope: 'quotes', limit: 2, windowMs: 10_000 }
  assert.equal(checkRateLimit(firstClient, options, 1_000).allowed, true)
  assert.equal(checkRateLimit(firstClient, options, 1_001).allowed, true)
  const rejected = checkRateLimit(firstClient, options, 1_002)
  assert.equal(rejected.allowed, false)
  assert.deepEqual(rateLimitFailure(rejected), {
    body: { error: 'too many requests; try again shortly' },
    init: { status: 429, headers: { 'Retry-After': '10' } },
  })
  assert.equal(checkRateLimit(secondClient, options, 1_002).allowed, true)
  assert.equal(checkRateLimit(firstClient, options, 11_001).allowed, true)
})

test('public thesis projection maps only explicit fields and sanitizes HTML', () => {
  const projected = hydrateProjectedThesis({
    id: 7,
    owner_id: 'user-1',
    title: 'Published thesis',
    ticker: 'AAPL',
    entry: 100,
    current_price: 110,
    return_pct: 10,
    body: '<p onclick="bad()">Visible</p><script>bad()</script>',
    author_name: 'Analyst',
    private_note: 'must not cross the boundary',
  })
  assert.equal(projected.ownerId, 'user-1')
  assert.equal(projected.current, 110)
  assert.equal(projected.body, '<p>Visible</p>')
  assert.equal(Object.hasOwn(projected, 'private_note'), false)
})

test('core integrity migration seals theses and restricts public reads', async () => {
  const base = await readFile(
    new URL('../supabase/migrations/202607310001_base_schema.sql', import.meta.url),
    'utf8',
  )
  const migration = await readFile(
    new URL('../supabase/migrations/202608010001_core_integrity.sql', import.meta.url),
    'utf8',
  )
  const lifecycle = await readFile(
    new URL('../supabase/migrations/202608010002_automated_lifecycle.sql', import.meta.url),
    'utf8',
  )
  const cron = await readFile(
    new URL('../supabase/cron/setup_lifecycle.sql', import.meta.url),
    'utf8',
  )
  assert.match(base, /create table if not exists public\.profiles/i)
  assert.match(base, /create table if not exists public\.theses/i)
  assert.match(base, /using \(auth\.uid\(\) = user_id\)/i)
  assert.match(base, /using \(auth\.uid\(\) = id\)/i)
  assert.match(migration, /create trigger enforce_thesis_integrity/i)
  assert.match(migration, /published_thesis_fields_are_immutable/i)
  assert.match(migration, /from pg_policies/i)
  assert.match(migration, /create or replace view public\.published_theses/i)
  assert.match(migration, /revoke all on public\.theses from public, anon/i)
  assert.match(migration, /revoke insert, update, delete/i)
  assert.match(migration, /for update;/i)
  for (const rpc of ['append_thesis_update', 'schedule_thesis_close', 'close_thesis', 'update_thesis_metrics']) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}`, 'i'))
  }
  assert.match(lifecycle, /create table if not exists public\.lifecycle_jobs/i)
  assert.match(lifecycle, /create table if not exists public\.notifications/i)
  assert.match(lifecycle, /for update skip locked/i)
  assert.match(lifecycle, /lease_expires_at/i)
  assert.match(lifecycle, /refresh_lease_expires_at/i)
  assert.match(lifecycle, /interval '15 minutes'/i)
  assert.match(lifecycle, /on conflict \(event_key\) do nothing/i)
  assert.match(lifecycle, /grant update \(read_at\) on public\.notifications to authenticated/i)
  for (const rpc of [
    'claim_lifecycle_jobs',
    'finalize_publication_job',
    'finalize_close_job',
    'claim_thesis_refreshes',
    'apply_thesis_refresh',
  ]) {
    assert.match(lifecycle, new RegExp(`grant execute on function public\\.${rpc}`, 'i'))
  }
  assert.match(cron, /theses-lifecycle-worker/)
  assert.match(cron, /theses-refresh-worker/)
  assert.match(cron, /vault\.decrypted_secrets/)
})
