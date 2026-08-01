import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { generateHTML, generateJSON } from '@tiptap/html/server'
import {
  cleanWorkbookModel,
  isCalendarDate,
  readJsonObject,
  validateCardItems,
  validateCommentPayload,
  validateCommentReportPayload,
  validateDraftCreatePayload,
  validateDraftUpdatePayload,
  validateHistoryDate,
  validateLifecyclePayload,
  validateNotificationReadPayload,
  validateProfilePayload,
  validateScheduledPublicationPayload,
  validateSavedSearchPayload,
  validateSocialMutationPayload,
  validateThesisPayload,
  validateUpdatePayload,
} from '../src/lib/apiValidation.js'
import { sanitizeThesisHtml } from '../src/lib/html.js'
import { normalizePublicUrl } from '../src/lib/urls.js'
import { createAsyncCache } from '../src/lib/asyncCache.js'
import { hydrateProjectedThesis } from '../src/lib/publicTheses.js'
import { createThesisEditorExtensions } from '../src/lib/thesisEditorSchema.js'
import {
  convertDocxBuffer,
  DOCX_CONTENT_TYPE,
  prepareImportedDocxHtml,
  readDocxRequest,
} from '../src/lib/docxImport.js'
import {
  buildDiscoverPage,
  buildLeaderboardPage,
  parseDiscoverQuery,
  parseLeaderboardQuery,
} from '../src/lib/community.js'
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
  sharedRateLimitConfigured,
} from '../src/lib/rateLimit.js'
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  createRequestNonce,
} from '../src/lib/securityHeaders.js'

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

test('structured editor round-trips existing thesis HTML and legacy chart placeholders', () => {
  const extensions = createThesisEditorExtensions()
  const legacy = [
    '<h1>Investment case</h1>',
    '<p><strong>Durable</strong> growth with <u>pricing power</u>.</p>',
    '<blockquote>Management guidance</blockquote>',
    '<ul><li>Recurring revenue</li><li>High retention</li></ul>',
    '<p><a href="https://example.com/source" target="_blank">Source</a></p>',
    '<div class="my-4 p-4 border rounded"><div class="text-[10px] font-mono uppercase tracking-wider">Embedded Chart</div><div class="text-sm font-medium mt-1">Revenue &amp; Margin Trajectory</div></div>',
  ].join('')
  const document = generateJSON(legacy, extensions)
  const types = document.content.map((node) => node.type)
  assert.deepEqual(types, ['heading', 'paragraph', 'blockquote', 'bulletList', 'paragraph', 'chartPlaceholder'])

  const html = generateHTML(document, extensions)
  assert.match(html, /<h1>Investment case<\/h1>/)
  assert.match(html, /<strong>Durable<\/strong>/)
  assert.match(html, /<u>pricing power<\/u>/)
  assert.match(html, /data-thesis-chart-placeholder="true"/)

  const sanitized = sanitizeThesisHtml(html)
  assert.match(sanitized, /data-thesis-chart-placeholder="true"/)
  assert.equal(generateJSON(sanitized, extensions).content.at(-1).type, 'chartPlaceholder')

  const linked = '<div class="thesis-chart-placeholder" data-thesis-chart-placeholder="true" data-thesis-chart-id="chart-revenue" data-thesis-chart-title="Revenue" data-thesis-chart-type="bar">Embedded Chart</div>'
  const linkedDocument = generateJSON(linked, extensions)
  assert.equal(linkedDocument.content[0].attrs.chartId, 'chart-revenue')
  assert.equal(linkedDocument.content[0].attrs.chartType, 'bar')
  assert.match(sanitizeThesisHtml(generateHTML(linkedDocument, extensions)), /data-thesis-chart-id="chart-revenue"/)

  const cited = '<p>Demand increased<sup class="thesis-citation" data-thesis-citation-id="src-demand" data-thesis-citation-label="1"><a href="#reference-src-demand">[1]</a></sup>.</p>'
  const citedDocument = generateJSON(cited, extensions)
  const citationNode = citedDocument.content[0].content.find((node) => node.type === 'citationReference')
  assert.equal(citationNode.attrs.citationId, 'src-demand')
  assert.match(sanitizeThesisHtml(generateHTML(citedDocument, extensions)), /data-thesis-citation-id="src-demand"/)
})

test('legacy editor DOM mutation commands have been removed', async () => {
  const editorView = await readFile(new URL('../src/views/Editor.jsx', import.meta.url), 'utf8')
  const structuredEditor = await readFile(new URL('../src/components/ThesisEditor.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(editorView, /contentEditable|execCommand|insertAdjacentHTML/)
  assert.match(structuredEditor, /useEditor\(/)
  assert.match(structuredEditor, /insertContent\(html\)/)
  assert.match(structuredEditor, /toggleBulletList\(\)/)
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

test('published workbook validation seals bounded chart definitions', () => {
  const input = minimalModel()
  input.charts = [{
    id: 'chart-revenue',
    title: 'Revenue trajectory',
    type: 'line',
    sheet: 'Model',
    range: 'b1:a1',
    firstRowLabels: false,
    firstColumnSeries: true,
    yAxisLabel: 'AUD m',
    showLegend: false,
  }]
  const clean = cleanWorkbookModel(input)
  assert.deepEqual(clean.charts[0], {
    id: 'chart-revenue',
    title: 'Revenue trajectory',
    type: 'line',
    sheet: 'Model',
    range: 'A1:B1',
    firstRowLabels: false,
    firstColumnSeries: true,
    yAxisLabel: 'AUD m',
    showLegend: false,
  })
  assert.throws(() => cleanWorkbookModel({ ...input, charts: [{ ...input.charts[0], sheet: 'Missing' }] }), /unknown sheet/)
  assert.throws(() => cleanWorkbookModel({ ...input, charts: [{ ...input.charts[0], range: 'A1:ZZZ999' }] }), /invalid range|outside its sheet/)
})

test('DOCX imports enforce file boundaries and sanitize converted HTML', async () => {
  const request = new Request('http://localhost/api/import/docx', {
    method: 'POST',
    headers: {
      'content-type': DOCX_CONTENT_TYPE,
      'x-file-name': encodeURIComponent('Investment thesis.docx'),
    },
    body: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
  })
  const upload = await readDocxRequest(request)
  assert.equal(upload.filename, 'Investment thesis.docx')
  assert.equal(upload.buffer.length, 4)

  const clean = prepareImportedDocxHtml([
    '<h1 onclick="bad()">Durable growth</h1>',
    '<p><strong>Evidence</strong> from filings.</p>',
    '<a href="javascript:bad()">unsafe</a>',
    '<script>bad()</script>',
  ].join(''))
  assert.equal(clean.wordCount, 6)
  assert.match(clean.html, /<h1>Durable growth<\/h1>/)
  assert.doesNotMatch(clean.html, /onclick|javascript:|<script/i)

  await assert.rejects(() => readDocxRequest(new Request('http://localhost/api/import/docx', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'x-file-name': 'thesis.docx' },
    body: 'not a document',
  })), (error) => error.status === 415)
  await assert.rejects(() => readDocxRequest(new Request('http://localhost/api/import/docx', {
    method: 'POST',
    headers: { 'content-type': DOCX_CONTENT_TYPE, 'x-file-name': 'legacy.doc' },
    body: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
  })), /only \.docx files/)
})

test('DOCX conversion preserves basic Word document structure', async () => {
  const fixture = await readFile(
    new URL('../node_modules/mammoth/test/test-data/single-paragraph.docx', import.meta.url),
  )
  const imported = await convertDocxBuffer(fixture)
  assert.equal(imported.html, '<p>Walking on imported air</p>')
  assert.equal(imported.wordCount, 4)
})

test('thesis payload validation applies limits, sanitization, and unknown-field rejection', () => {
  const clean = validateThesisPayload({
    title: ' Durable growth ',
    ticker: 'asml.as',
    company: 'ASML',
    sector: 'Semiconductors',
    side: 'bull',
    body: '<p onclick="bad()">Thesis<sup class="thesis-citation" data-thesis-citation-id="src-filing" data-thesis-citation-label="1">[1]</sup></p>',
    citations: [{
      id: 'src-filing',
      title: 'Annual report',
      publisher: 'ASML',
      author: '',
      url: 'asml.com/investors',
      publishedAt: '2026-02-01',
      accessedAt: '2026-08-02',
    }],
    triggers: [],
    model: null,
    draftId: 'local-only',
    localDraftId: 'd-123',
    cloudDraftId: 4,
    cloudDraftVersion: 2,
  })
  assert.equal(clean.title, 'Durable growth')
  assert.equal(clean.ticker, 'ASML.AS')
  assert.match(clean.body, /data-thesis-citation-id="src-filing"/)
  assert.equal(clean.citations[0].url, 'https://asml.com/investors')
  assert.throws(() => validateThesisPayload({
    title: 'Unknown citation', ticker: 'AAPL', side: 'bull',
    body: '<p>Claim<sup data-thesis-citation-id="src-missing">[1]</sup></p>',
    citations: [],
  }), /unknown citation/)
  assert.throws(() => validateThesisPayload({
    title: 'Unsafe source', ticker: 'AAPL', side: 'bull', body: '<p>Claim</p>',
    citations: [{ id: 'src-unsafe', title: 'Unsafe', url: 'javascript:alert(1)' }],
  }), /safe http or https/)
  assert.throws(() => validateThesisPayload({ title: 'x', ticker: 'AAPL', side: 'bull', unexpected: true }), /unsupported field/)
  assert.throws(() => validateThesisPayload({ title: 'x'.repeat(201), ticker: 'AAPL', side: 'bull' }), /200 characters/)
})

test('cloud draft validation permits incomplete work and requires optimistic versions', () => {
  const created = validateDraftCreatePayload({
    localId: 'd-123:offline',
    draft: {
      title: '',
      ticker: '',
      side: 'bull',
      body: '<p onclick="bad()">Work in progress</p>',
      triggers: [{ metric: 'Revenue', comparisons: [{ op: '>', value: null }] }],
      model: null,
    },
  })
  assert.equal(created.localId, 'd-123:offline')
  assert.equal(created.draft.body, '<p>Work in progress</p>')
  assert.equal(created.draft.triggers[0].comparisons[0].value, null)
  assert.equal(validateDraftUpdatePayload({ draft: created.draft, version: 3 }).version, 3)
  assert.throws(() => validateDraftUpdatePayload({ draft: created.draft, version: 0 }), /positive integer/)
  assert.throws(() => validateDraftCreatePayload({ draft: created.draft, localId: '../unsafe' }), /unsupported characters/)
})

test('cloud profile validation trims owner-editable fields and enforces limits', () => {
  assert.deepEqual(validateProfilePayload({
    bio: '  Long-term fundamental investor.  ',
    location: '  Sydney, Australia  ',
  }), {
    bio: 'Long-term fundamental investor.',
    location: 'Sydney, Australia',
  })
  assert.throws(() => validateProfilePayload({ bio: 'x'.repeat(281), location: '' }), /280 characters/)
  assert.throws(() => validateProfilePayload({ bio: '', location: '', verified: true }), /unsupported field/)
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

test('social mutations accept only supported relationship targets', () => {
  assert.deepEqual(validateSocialMutationPayload({
    kind: 'follow',
    targetId: '550e8400-e29b-41d4-a716-446655440000',
  }), {
    kind: 'follow',
    targetId: '550e8400-e29b-41d4-a716-446655440000',
  })
  assert.deepEqual(validateSocialMutationPayload({ kind: 'bookmark', targetId: 42 }), {
    kind: 'bookmark',
    targetId: 42,
  })
  assert.throws(() => validateSocialMutationPayload({ kind: 'follow', targetId: 'not-a-user' }), /valid analyst id/)
  assert.throws(() => validateSocialMutationPayload({ kind: 'bookmark', targetId: -1 }), /positive thesis id/)
  assert.throws(() => validateSocialMutationPayload({ kind: 'like', targetId: 1 }), /follow or bookmark/)
})

test('discussion validation bounds comments, replies, and reports', () => {
  assert.deepEqual(validateCommentPayload({ body: '  Evidence changed.  ' }), {
    body: 'Evidence changed.',
    parentId: null,
  })
  assert.deepEqual(validateCommentPayload({ body: 'Reply', parentId: 12 }), {
    body: 'Reply',
    parentId: 12,
  })
  assert.throws(() => validateCommentPayload({ body: '' }), /comment is required/)
  assert.throws(() => validateCommentPayload({ body: 'Reply', parentId: 0 }), /positive comment id/)
  assert.deepEqual(validateCommentReportPayload({ reason: 'spam', details: 'Repeated links' }), {
    reason: 'spam',
    details: 'Repeated links',
  })
  assert.throws(() => validateCommentReportPayload({ reason: 'disagree' }), /unsupported report reason/)
})

test('saved Discover searches validate the shared filter contract', () => {
  const saved = validateSavedSearchPayload({
    name: 'Software shorts',
    filters: {
      query: 'margin pressure', sector: 'Software', side: 'bear', status: 'active',
      published: '30d', performance: 'negative', sort: 'discussed',
    },
    notifyEnabled: true,
  })
  assert.equal(saved.name, 'Software shorts')
  assert.equal(saved.filters.published, '30d')
  assert.equal(saved.filters.sort, 'discussed')
  assert.equal(saved.notifyEnabled, true)
  assert.throws(() => validateSavedSearchPayload({
    name: 'Invalid', filters: { sort: 'viral' },
  }), /unsupported saved search sort/)
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

test('proxy CSP uses per-request script nonces and applies baseline security headers', async () => {
  assert.notEqual(createRequestNonce(), createRequestNonce())
  const nonce = 'dGVzdC1ub25jZQ=='
  const policy = buildContentSecurityPolicy(nonce, { development: false })
  const scriptPolicy = policy.split('; ').find((directive) => directive.startsWith('script-src'))
  assert.match(scriptPolicy, /'nonce-dGVzdC1ub25jZQ=='/)
  assert.match(scriptPolicy, /'strict-dynamic'/)
  assert.doesNotMatch(scriptPolicy, /'unsafe-inline'|'unsafe-eval'/)
  assert.match(policy, /object-src 'none'/)
  assert.match(policy, /frame-ancestors 'none'/)
  assert.match(buildContentSecurityPolicy(nonce, { development: true }), /script-src[^;]+'unsafe-eval'/)

  const response = new Response()
  applySecurityHeaders(response, policy, { production: true })
  assert.equal(response.headers.get('Content-Security-Policy'), policy)
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY')
  assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin')
  assert.match(response.headers.get('Strict-Transport-Security'), /includeSubDomains/)

  const proxySource = await readFile(new URL('../proxy.js', import.meta.url), 'utf8')
  assert.match(proxySource, /export async function proxy\(/)
  assert.match(proxySource, /requestHeaders\.set\('x-nonce', nonce\)/)
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

test('public route limiter scopes clients and returns retry guidance', async () => {
  resetRateLimitsForTests()
  const firstClient = new Request('https://example.test/api/quotes', {
    headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
  })
  const secondClient = new Request('https://example.test/api/quotes', {
    headers: { 'x-forwarded-for': '203.0.113.2' },
  })
  const options = { scope: 'quotes', limit: 2, windowMs: 10_000 }
  assert.equal((await checkRateLimit(firstClient, options, 1_000, null)).allowed, true)
  assert.equal((await checkRateLimit(firstClient, options, 1_001, null)).allowed, true)
  const rejected = await checkRateLimit(firstClient, options, 1_002, null)
  assert.equal(rejected.allowed, false)
  assert.deepEqual(rateLimitFailure(rejected), {
    body: { error: 'too many requests; try again shortly' },
    init: { status: 429, headers: { 'Retry-After': '10' } },
  })
  assert.equal((await checkRateLimit(secondClient, options, 1_002, null)).allowed, true)
  assert.equal((await checkRateLimit(firstClient, options, 11_001, null)).allowed, true)
})

test('shared route limiter uses Redis results and falls back locally on failures', async () => {
  resetRateLimitsForTests()
  assert.equal(sharedRateLimitConfigured({}), false)
  assert.equal(sharedRateLimitConfigured({ UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'secret' }), true)
  const request = new Request('https://example.test/api/quotes', {
    headers: { 'x-forwarded-for': '203.0.113.8' },
  })
  let identifier
  const shared = {
    limit: async (value) => {
      identifier = value
      return { success: false, reset: 11_000 }
    },
  }
  const blocked = await checkRateLimit(request, { scope: 'quotes', limit: 2, windowMs: 10_000 }, 1_000, shared)
  assert.equal(identifier, '203.0.113.8')
  assert.deepEqual(blocked, { allowed: false, retryAfter: 10, source: 'shared' })

  const originalError = console.error
  console.error = () => {}
  try {
    const fallback = await checkRateLimit(request, { scope: 'quotes', limit: 2, windowMs: 10_000 }, 1_000, {
      limit: async () => { throw new Error('redis unavailable') },
    })
    assert.deepEqual(fallback, { allowed: true, retryAfter: 0, source: 'local' })
  } finally {
    console.error = originalError
  }
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
    author_slug: 'analyst-550e8400e29b41d4a716446655440000',
    citations: [{ id: 'src-report', title: 'Report', url: 'https://example.com/report' }],
    private_note: 'must not cross the boundary',
  })
  assert.equal(projected.ownerId, 'user-1')
  assert.equal(projected.current, 110)
  assert.equal(projected.body, '<p>Visible</p>')
  assert.equal(projected.authorSlug, 'analyst-550e8400e29b41d4a716446655440000')
  assert.equal(projected.citations[0].id, 'src-report')
  assert.equal(Object.hasOwn(projected, 'private_note'), false)
})

test('community query validation bounds pages and accepts supported filters', () => {
  assert.deepEqual(parseDiscoverQuery(new URLSearchParams('page=2&pageSize=10&sort=top&q=growth&sector=Software&side=bull&status=active&published=30d&performance=positive')), {
    page: 2,
    pageSize: 10,
    query: 'growth',
    sector: 'Software',
    side: 'bull',
    status: 'active',
    published: '30d',
    performance: 'positive',
    sort: 'top',
  })
  assert.deepEqual(parseLeaderboardQuery(new URLSearchParams('side=bear&period=90plus&sector=Energy')), {
    page: 1,
    pageSize: 25,
    side: 'bear',
    period: '90plus',
    sector: 'Energy',
  })
  assert.throws(() => parseDiscoverQuery(new URLSearchParams('pageSize=51')), /between 1 and 50/)
  assert.throws(() => parseDiscoverQuery(new URLSearchParams('performance=moon')), /unsupported performance/)
  assert.throws(() => parseLeaderboardQuery(new URLSearchParams('side=neutral')), /unsupported side/)
})

test('community pagination and leaderboard filters use complete thesis portfolios', () => {
  const theses = [
    { id: 1, ownerId: 'a', author: 'Alpha', ticker: 'AAA', title: 'Older growth', side: 'bull', sector: 'Software', daysActive: 10, ret: 20, status: 'active', updates: 0, createdAt: '2026-06-01T00:00:00Z' },
    { id: 2, ownerId: 'a', author: 'Alpha', ticker: 'AAB', title: 'Energy short', side: 'bear', sector: 'Energy', daysActive: 100, ret: -5, status: 'closed', closeReturn: -5, updates: 3, createdAt: '2026-07-01T00:00:00Z' },
    { id: 3, ownerId: 'b', author: 'Beta', ticker: 'BBB', title: 'Energy growth', side: 'bull', sector: 'Energy', daysActive: 50, ret: 8, status: 'active', updates: 1, createdAt: '2026-08-01T00:00:00Z' },
  ]

  const discover = buildDiscoverPage(theses, {
    page: 2, pageSize: 1, query: 'growth', sector: 'all', sort: 'newest',
  }, Date.parse('2026-08-02T00:00:00Z'))
  assert.equal(discover.pagination.totalItems, 2)
  assert.equal(discover.items[0].id, 1)
  assert.deepEqual(discover.facets.sectors, ['Energy', 'Software'])

  const advanced = buildDiscoverPage([
    ...theses,
    { id: 4, ownerId: 'c', author: 'Gamma Research', handle: '@gamma', ticker: 'CCC', company: 'Cloud Co', title: 'Efficiency', body: '<p>Durable recurring revenue</p>', side: 'bear', sector: 'Software', daysActive: 5, ret: -3, status: 'active', updates: 1, commentCount: 4, bookmarkCount: 2, createdAt: '2026-08-01T00:00:00Z' },
  ], {
    page: 1, pageSize: 25, query: 'recurring', sector: 'all', side: 'bear',
    status: 'active', published: '7d', performance: 'negative', sort: 'discussed',
  }, Date.parse('2026-08-02T00:00:00Z'))
  assert.deepEqual(advanced.items.map((row) => row.id), [4])

  const shortBoard = buildLeaderboardPage(theses, {
    page: 1, pageSize: 25, side: 'bear', period: 'all', sector: 'all',
  }, 'a')
  assert.equal(shortBoard.pagination.totalItems, 1)
  assert.equal(shortBoard.items[0].userId, 'a')
  assert.equal(shortBoard.items[0].theses, 1)
  assert.match(shortBoard.items[0].best, /Short/)

  const energyBoard = buildLeaderboardPage(theses, {
    page: 2, pageSize: 1, side: 'all', period: 'all', sector: 'Energy',
  }, 'b')
  assert.equal(energyBoard.pagination.totalItems, 2)
  assert.equal(energyBoard.items[0].userId, 'a')
  assert.equal(energyBoard.items[0].rank, 2)
  assert.equal(energyBoard.viewer.userId, 'b')
  assert.equal(energyBoard.viewer.rank, 1)

  const longHold = buildLeaderboardPage(theses, {
    page: 1, pageSize: 25, side: 'all', period: '90plus', sector: 'all',
  })
  assert.deepEqual(longHold.items.map((row) => row.userId), ['a'])
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
  const cloudDrafts = await readFile(
    new URL('../supabase/migrations/202608010003_cloud_drafts.sql', import.meta.url),
    'utf8',
  )
  const cloudProfiles = await readFile(
    new URL('../supabase/migrations/202608010004_cloud_profiles.sql', import.meta.url),
    'utf8',
  )
  const publicRoutes = await readFile(
    new URL('../supabase/migrations/202608010005_public_routes.sql', import.meta.url),
    'utf8',
  )
  const socialGraph = await readFile(
    new URL('../supabase/migrations/202608020001_social_graph.sql', import.meta.url),
    'utf8',
  )
  const discussions = await readFile(
    new URL('../supabase/migrations/202608020002_thesis_discussions.sql', import.meta.url),
    'utf8',
  )
  const citations = await readFile(
    new URL('../supabase/migrations/202608020003_thesis_citations.sql', import.meta.url),
    'utf8',
  )
  const savedSearches = await readFile(
    new URL('../supabase/migrations/202608020004_saved_discover_searches.sql', import.meta.url),
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
  assert.match(cloudDrafts, /create table if not exists public\.drafts/i)
  assert.match(cloudDrafts, /references auth\.users \(id\) on delete cascade/i)
  assert.match(cloudDrafts, /constraint drafts_owner_local_id_unique unique \(user_id, local_id\)/i)
  assert.match(cloudDrafts, /new\.version := old\.version \+ 1/i)
  assert.match(cloudDrafts, /alter table public\.drafts enable row level security/i)
  assert.match(cloudDrafts, /using \(auth\.uid\(\) = user_id\)/i)
  assert.match(cloudDrafts, /revoke all on public\.drafts from public, anon, authenticated/i)
  assert.match(cloudDrafts, /grant select on public\.drafts to authenticated/i)
  assert.match(cloudProfiles, /add column if not exists bio text/i)
  assert.match(cloudProfiles, /add column if not exists location text/i)
  assert.match(cloudProfiles, /add column if not exists joined_at timestamptz/i)
  assert.match(cloudProfiles, /add column if not exists verified boolean/i)
  assert.match(cloudProfiles, /set joined_at = auth_user\.created_at/i)
  assert.match(cloudProfiles, /new\.verified := false/i)
  assert.match(cloudProfiles, /profile_verification_is_server_managed/i)
  assert.match(cloudProfiles, /create trigger enforce_profile_integrity/i)
  assert.match(cloudProfiles, /revoke update on public\.profiles from authenticated/i)
  assert.match(cloudProfiles, /grant update \(id, name, handle, avatar, bio, location, updated_at\)/i)
  assert.match(publicRoutes, /add column if not exists slug text/i)
  assert.match(publicRoutes, /constraint profiles_slug_unique unique \(slug\)/i)
  assert.match(publicRoutes, /profile_slug_is_immutable/i)
  assert.match(publicRoutes, /create trigger enforce_profile_slug/i)
  assert.match(publicRoutes, /p\.slug as author_slug/i)
  assert.match(publicRoutes, /grant select on public\.published_theses to anon, authenticated, service_role/i)
  assert.match(publicRoutes, /revoke all on function public\.build_profile_slug/i)
  assert.match(socialGraph, /create table if not exists public\.analyst_follows/i)
  assert.match(socialGraph, /create table if not exists public\.thesis_bookmarks/i)
  assert.match(socialGraph, /constraint analyst_follows_no_self/i)
  assert.match(socialGraph, /bookmarks_require_published_thesis/i)
  assert.match(socialGraph, /alter table public\.analyst_follows enable row level security/i)
  assert.match(socialGraph, /using \(auth\.uid\(\) = follower_id\)/i)
  assert.match(socialGraph, /using \(auth\.uid\(\) = user_id\)/i)
  assert.match(socialGraph, /create trigger notify_new_public_thesis/i)
  assert.match(socialGraph, /create trigger notify_social_thesis_change/i)
  assert.match(socialGraph, /create trigger notify_social_trigger_transition/i)
  assert.match(socialGraph, /on conflict \(event_key\) do nothing/i)
  assert.match(discussions, /create table if not exists public\.thesis_comments/i)
  assert.match(discussions, /create table if not exists public\.comment_reports/i)
  assert.match(discussions, /replies_must_target_root_comment/i)
  assert.match(discussions, /comment_content_is_immutable/i)
  assert.match(discussions, /revoke all on public\.thesis_comments from public, anon, authenticated/i)
  assert.match(discussions, /create trigger notify_thesis_discussion/i)
  assert.match(discussions, /discussion_reply/i)
  assert.match(discussions, /comment_reports_reporter_unique/i)
  assert.match(citations, /create or replace view public\.published_theses/i)
  assert.match(citations, /t\.data -> 'citations' as citations/i)
  assert.match(citations, /grant select on public\.published_theses to anon, authenticated, service_role/i)
  assert.match(savedSearches, /create table if not exists public\.saved_searches/i)
  assert.match(savedSearches, /saved_search_limit_reached/i)
  assert.match(savedSearches, /create trigger notify_saved_search_matches/i)
  assert.match(savedSearches, /saved_search_match/i)
  assert.match(savedSearches, /comments\.status = 'visible'/i)
  assert.match(savedSearches, /bookmarks\.thesis_id = t\.id/i)
})
