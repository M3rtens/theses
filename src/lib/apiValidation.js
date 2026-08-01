import { sanitizeThesisHtml } from './html.js'
import { normalizePublicUrl } from './urls.js'
import { CHART_TYPES, normalizeChartRange, parseChartRange } from './charts.js'

const textEncoder = new TextEncoder()
const SYMBOL = /^[A-Z0-9^][A-Z0-9.^=/_-]{0,63}$/
const CELL_KEY = /^(0|[1-9]\d*),(0|[1-9]\d*)$/
const OPS = new Set(['<', '<=', '>', '>=', '=='])
const STATEMENTS = new Set(['income', 'balance', 'cashflow'])
const PERIODS = new Set(['annual', 'quarterly'])
const SCALES = new Set(['K', 'M', 'B'])
const SIDES = new Set(['bull', 'bear'])
const TRIGGER_STATUS = new Set(['clear', 'warning', 'breached'])
const KINDS = new Set(['money', 'perShare', 'shares'])
const MAX_MODEL_BYTES = 1_750_000

export const REQUEST_LIMITS = {
  publish: 2_000_000,
  draft: 2_000_000,
  profile: 4_000,
  update: 16_000,
  lifecycle: 4_000,
  cards: 64_000,
  notifications: 8_000,
  social: 4_000,
  comment: 8_000,
  report: 4_000,
}

export class RequestValidationError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'RequestValidationError'
    this.status = status
  }
}

const isPlainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value)
const byteLength = (value) => textEncoder.encode(String(value)).byteLength
const fail = (message, status) => { throw new RequestValidationError(message, status) }

function assertAllowedKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key))
  if (unknown.length) fail(`${label} contains unsupported field: ${unknown[0]}`)
}

function cleanString(value, { label, max, required = false, fallback = '' }) {
  const text = value == null ? fallback : String(value).trim()
  if (required && !text) fail(`${label} is required`)
  if (text.length > max) fail(`${label} must be ${max} characters or fewer`)
  return text
}

export function normalizeSymbol(value, label = 'symbol') {
  const symbol = cleanString(value, { label, max: 64, required: true }).toUpperCase()
  if (!SYMBOL.test(symbol)) fail(`${label} contains unsupported characters`)
  return symbol
}

export function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

export function validateHistoryDate(value) {
  const date = String(value || '')
  if (!isCalendarDate(date)) fail('from must be a real calendar date in YYYY-MM-DD format')
  const year = Number(date.slice(0, 4))
  const currentYear = new Date().getUTCFullYear()
  if (year < 1970 || year > currentYear + 1) fail('from is outside the supported history range')
  return date
}

export async function readJsonObject(request, maxBytes) {
  const contentType = request.headers.get('content-type') || ''
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(contentType)) {
    fail('content-type must be application/json', 415)
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    fail('request body is too large', 413)
  }

  const raw = await request.text()
  if (byteLength(raw) > maxBytes) fail('request body is too large', 413)

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    fail('invalid JSON body')
  }
  if (!isPlainObject(parsed)) fail('JSON body must be an object')
  return parsed
}

function cleanComparisons(trigger, triggerIndex) {
  const raw = Array.isArray(trigger.comparisons) && trigger.comparisons.length
    ? trigger.comparisons
    : [{ op: trigger.op, value: trigger.value, scale: trigger.scale, connector: null }]
  if (raw.length > 5) fail(`trigger ${triggerIndex + 1} has too many comparisons`)

  return raw.map((comparison, comparisonIndex) => {
    if (!isPlainObject(comparison)) fail(`trigger ${triggerIndex + 1} comparison ${comparisonIndex + 1} must be an object`)
    const op = String(comparison.op || '')
    const value = Number(comparison.value)
    if (!OPS.has(op)) fail(`trigger ${triggerIndex + 1} has an invalid comparison operator`)
    if (!Number.isFinite(value)) fail(`trigger ${triggerIndex + 1} has a non-finite threshold`)
    return {
      op,
      value,
      scale: SCALES.has(comparison.scale) ? comparison.scale : 'M',
      connector: comparisonIndex === 0 ? null : (comparison.connector === 'or' ? 'or' : 'and'),
    }
  })
}

function cleanTriggers(value) {
  if (value == null) return []
  if (!Array.isArray(value)) fail('triggers must be an array')
  if (value.length > 20) fail('no more than 20 triggers are allowed')

  return value.map((trigger, index) => {
    if (!isPlainObject(trigger)) fail(`trigger ${index + 1} must be an object`)
    const comparisons = cleanComparisons(trigger, index)
    const first = comparisons[0]
    const metric = cleanString(trigger.metric, { label: `trigger ${index + 1} metric`, max: 200, required: true })
    const condition = cleanString(trigger.c ?? trigger.condition, { label: `trigger ${index + 1} condition`, max: 500, required: true })
    return {
      c: condition,
      s: TRIGGER_STATUS.has(trigger.s) ? trigger.s : 'clear',
      metric,
      statement: STATEMENTS.has(trigger.statement) ? trigger.statement : 'income',
      period: PERIODS.has(trigger.period) ? trigger.period : 'annual',
      kind: KINDS.has(trigger.kind) ? trigger.kind : 'money',
      currency: cleanString(trigger.currency, { label: `trigger ${index + 1} currency`, max: 12 }),
      comparisons,
      connectors: comparisons.slice(1).map((comparison) => comparison.connector || 'and'),
      op: first.op,
      value: first.value,
      scale: first.scale,
    }
  })
}

function cleanDraftTriggers(value) {
  if (value == null) return []
  if (!Array.isArray(value)) fail('triggers must be an array')
  if (value.length > 20) fail('no more than 20 triggers are allowed')

  return value.map((trigger, triggerIndex) => {
    if (!isPlainObject(trigger)) fail(`trigger ${triggerIndex + 1} must be an object`)
    const rawComparisons = Array.isArray(trigger.comparisons)
      ? trigger.comparisons
      : (trigger.value == null ? [] : [{ op: trigger.op, value: trigger.value, scale: trigger.scale }])
    if (rawComparisons.length > 5) fail(`trigger ${triggerIndex + 1} has too many comparisons`)
    const comparisons = rawComparisons.map((comparison, comparisonIndex) => {
      if (!isPlainObject(comparison)) fail(`trigger ${triggerIndex + 1} comparison ${comparisonIndex + 1} must be an object`)
      const rawValue = comparison.value
      const number = rawValue == null || rawValue === '' ? null : Number(rawValue)
      if (number != null && !Number.isFinite(number)) {
        fail(`trigger ${triggerIndex + 1} has a non-finite threshold`)
      }
      return {
        op: OPS.has(comparison.op) ? comparison.op : '<',
        value: number,
        scale: SCALES.has(comparison.scale) ? comparison.scale : 'M',
        connector: comparisonIndex === 0 ? null : (comparison.connector === 'or' ? 'or' : 'and'),
      }
    })
    const first = comparisons[0] || {}
    return {
      c: cleanString(trigger.c ?? trigger.condition, {
        label: `trigger ${triggerIndex + 1} condition`,
        max: 500,
        fallback: 'Incomplete trigger',
      }),
      s: TRIGGER_STATUS.has(trigger.s) ? trigger.s : 'clear',
      metric: cleanString(trigger.metric, { label: `trigger ${triggerIndex + 1} metric`, max: 200 }),
      statement: STATEMENTS.has(trigger.statement) ? trigger.statement : 'income',
      period: PERIODS.has(trigger.period) ? trigger.period : 'annual',
      kind: KINDS.has(trigger.kind) ? trigger.kind : 'money',
      currency: cleanString(trigger.currency, { label: `trigger ${triggerIndex + 1} currency`, max: 12 }),
      comparisons,
      connectors: comparisons.slice(1).map((comparison) => comparison.connector || 'and'),
      op: first.op || (OPS.has(trigger.op) ? trigger.op : '<'),
      value: first.value ?? null,
      scale: first.scale || (SCALES.has(trigger.scale) ? trigger.scale : 'M'),
    }
  })
}

function cleanCellValue(value, label) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value !== 'string') fail(`${label} must be text, a number, a boolean, or null`)
  if (value.length > 10_000) fail(`${label} is too long`)
  return value
}

function cleanFormat(format, label) {
  if (!isPlainObject(format)) fail(`${label} must be an object`)
  const cleaned = {}
  for (const key of ['b', 'i', 'u', 's', 'w']) if (format[key] === true) cleaned[key] = true
  if (['left', 'center', 'right'].includes(format.a)) cleaned.a = format.a
  if (['top', 'middle', 'bottom'].includes(format.va)) cleaned.va = format.va
  if (typeof format.c === 'string' && format.c.length <= 32) cleaned.c = format.c
  if (typeof format.bg === 'string' && format.bg.length <= 32) cleaned.bg = format.bg
  if (typeof format.ff === 'string' && format.ff.length <= 100) cleaned.ff = format.ff
  if (Number.isFinite(Number(format.fs)) && Number(format.fs) >= 6 && Number(format.fs) <= 96) cleaned.fs = Number(format.fs)
  if (typeof format.nf === 'string' && format.nf.length <= 100) cleaned.nf = format.nf
  if (format.t === 'checkbox') cleaned.t = 'checkbox'
  if (isPlainObject(format.bd)) {
    cleaned.bd = Object.fromEntries(['t', 'r', 'b', 'l'].filter((key) => format.bd[key] === true).map((key) => [key, true]))
  }
  if (format.link != null) {
    const link = normalizePublicUrl(format.link)
    if (!link) fail(`${label} contains an unsafe hyperlink`)
    cleaned.link = link
  }
  return cleaned
}

function cleanSheetModel(value, sheetIndex) {
  if (!isPlainObject(value)) fail(`sheet ${sheetIndex + 1} model must be an object`)
  const headers = Array.isArray(value.headers) ? value.headers : []
  const rows = Array.isArray(value.rows) ? value.rows : []
  if (headers.length > 255) fail(`sheet ${sheetIndex + 1} has too many columns`)
  if (rows.length > 2_000) fail(`sheet ${sheetIndex + 1} has too many rows`)

  const cleaned = {
    headers: headers.map((header, index) => cleanCellValue(header, `sheet ${sheetIndex + 1} header ${index + 1}`)),
    rows: rows.map((row, rowIndex) => {
      if (!isPlainObject(row)) fail(`sheet ${sheetIndex + 1} row ${rowIndex + 1} must be an object`)
      if (!Array.isArray(row.values)) fail(`sheet ${sheetIndex + 1} row ${rowIndex + 1} values must be an array`)
      if (row.values.length > 255) fail(`sheet ${sheetIndex + 1} row ${rowIndex + 1} has too many columns`)
      return {
        label: cleanCellValue(row.label, `sheet ${sheetIndex + 1} row ${rowIndex + 1} label`),
        values: row.values.map((cell, columnIndex) => cleanCellValue(cell, `sheet ${sheetIndex + 1} row ${rowIndex + 1} column ${columnIndex + 2}`)),
      }
    }),
  }

  if (isPlainObject(value.formats)) {
    const entries = Object.entries(value.formats)
    if (entries.length > 50_000) fail(`sheet ${sheetIndex + 1} has too many formatted cells`)
    cleaned.formats = Object.fromEntries(entries.map(([key, format]) => {
      if (!CELL_KEY.test(key)) fail(`sheet ${sheetIndex + 1} contains an invalid format coordinate`)
      return [key, cleanFormat(format, `sheet ${sheetIndex + 1} cell ${key}`)]
    }))
  }

  if (isPlainObject(value.comments)) {
    const entries = Object.entries(value.comments)
    if (entries.length > 10_000) fail(`sheet ${sheetIndex + 1} has too many comments`)
    cleaned.comments = Object.fromEntries(entries.map(([key, comment]) => {
      if (!CELL_KEY.test(key)) fail(`sheet ${sheetIndex + 1} contains an invalid comment coordinate`)
      return [key, cleanString(comment, { label: `sheet ${sheetIndex + 1} comment`, max: 5_000 })]
    }))
  }

  if (Array.isArray(value.merges)) {
    if (value.merges.length > 10_000) fail(`sheet ${sheetIndex + 1} has too many merged ranges`)
    cleaned.merges = value.merges.map((merge, mergeIndex) => {
      if (!isPlainObject(merge)) fail(`sheet ${sheetIndex + 1} merge ${mergeIndex + 1} must be an object`)
      const result = {}
      for (const key of ['row', 'col', 'rowspan', 'colspan']) {
        const number = Number(merge[key])
        if (!Number.isInteger(number) || number < (key.endsWith('span') ? 1 : 0)) fail(`sheet ${sheetIndex + 1} merge ${mergeIndex + 1} is invalid`)
        result[key] = number
      }
      return result
    })
  }

  for (const key of ['colWidths', 'rowHeights', 'view']) {
    if (isPlainObject(value[key])) cleaned[key] = structuredClone(value[key])
  }
  return cleaned
}

export function cleanWorkbookModel(value) {
  if (value == null) return null
  if (!isPlainObject(value)) fail('model must be an object')
  if (byteLength(JSON.stringify(value)) > MAX_MODEL_BYTES) fail('model is too large', 413)

  if (!Array.isArray(value.sheets)) return cleanSheetModel(value, 0)
  if (value.sheets.length > 25) fail('model has too many sheets')
  const sheets = value.sheets.map((sheet, index) => {
    if (!isPlainObject(sheet)) fail(`sheet ${index + 1} must be an object`)
    return {
      name: cleanString(sheet.name, { label: `sheet ${index + 1} name`, max: 80, required: true }),
      ...(sheet.hidden === true ? { hidden: true } : {}),
      model: cleanSheetModel(sheet.model, index),
    }
  })
  const sheetNames = new Set(sheets.map((sheet) => sheet.name))
  const charts = value.charts == null ? [] : value.charts
  if (!Array.isArray(charts)) fail('model charts must be an array')
  if (charts.length > 20) fail('model has too many charts')

  return {
    filename: cleanString(value.filename, { label: 'model filename', max: 255, fallback: 'Thesis model.xlsx' }),
    sheets,
    ...(charts.length ? { charts: charts.map((chart, index) => {
      if (!isPlainObject(chart)) fail(`chart ${index + 1} must be an object`)
      const id = cleanString(chart.id, { label: `chart ${index + 1} id`, max: 100, required: true })
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) fail(`chart ${index + 1} id contains unsupported characters`)
      const sheet = cleanString(chart.sheet, { label: `chart ${index + 1} sheet`, max: 80, required: true })
      if (!sheetNames.has(sheet)) fail(`chart ${index + 1} references an unknown sheet`)
      const range = normalizeChartRange(chart.range)
      if (!range) fail(`chart ${index + 1} has an invalid range`)
      const bounds = parseChartRange(range)
      const targetSheet = sheets.find((item) => item.name === sheet)
      if (bounds.bottom >= targetSheet.model.rows.length || bounds.right > targetSheet.model.headers.length) {
        fail(`chart ${index + 1} range is outside its sheet`)
      }
      const type = String(chart.type || '').toLowerCase()
      if (!CHART_TYPES.includes(type)) fail(`chart ${index + 1} has an invalid type`)
      return {
        id,
        title: cleanString(chart.title, { label: `chart ${index + 1} title`, max: 100, required: true }),
        type,
        sheet,
        range,
        firstRowLabels: chart.firstRowLabels !== false,
        firstColumnSeries: chart.firstColumnSeries !== false,
        yAxisLabel: cleanString(chart.yAxisLabel, { label: `chart ${index + 1} y-axis label`, max: 40 }),
        showLegend: chart.showLegend !== false,
      }
    }) } : {}),
  }
}

export function validateThesisPayload(body) {
  assertAllowedKeys(body, new Set([
    'title', 'ticker', 'company', 'sector', 'side', 'body', 'triggers', 'model',
    'scheduledPublicationDate', 'draftId', 'localDraftId', 'cloudDraftId',
    'cloudDraftVersion', 'scheduledPublicationId',
  ]), 'thesis')
  const side = cleanString(body.side, { label: 'side', max: 8, required: true }).toLowerCase()
  if (!SIDES.has(side)) fail('side must be "bull" or "bear"')

  const html = typeof body.body === 'string' ? body.body : ''
  if (byteLength(html) > 200_000) fail('body is too large', 413)

  return {
    title: cleanString(body.title, { label: 'title', max: 200, required: true }),
    ticker: normalizeSymbol(body.ticker, 'ticker'),
    company: cleanString(body.company, { label: 'company', max: 200 }),
    sector: cleanString(body.sector, { label: 'sector', max: 100 }),
    side,
    body: sanitizeThesisHtml(html),
    triggers: cleanTriggers(body.triggers),
    model: cleanWorkbookModel(body.model),
  }
}

export function validateProfilePayload(body) {
  if (!isPlainObject(body)) fail('profile must be an object')
  assertAllowedKeys(body, new Set(['bio', 'location']), 'profile')
  return {
    bio: cleanString(body.bio, { label: 'bio', max: 280 }),
    location: cleanString(body.location, { label: 'location', max: 100 }),
  }
}

export function validateDraftPayload(body) {
  if (!isPlainObject(body)) fail('draft must be an object')
  assertAllowedKeys(body, new Set([
    'title', 'ticker', 'company', 'sector', 'side', 'body', 'triggers', 'model',
    'scheduledPublicationDate', 'draftId', 'localDraftId', 'cloudDraftId',
    'cloudDraftVersion', 'wordCount', 'triggersCount', 'savedAt', 'syncedAt',
  ]), 'draft')

  const html = typeof body.body === 'string' ? body.body : ''
  if (byteLength(html) > 200_000) fail('body is too large', 413)
  const rawTicker = cleanString(body.ticker, { label: 'ticker', max: 64 })
  const ticker = rawTicker && !['-', '–', '—'].includes(rawTicker)
    ? normalizeSymbol(rawTicker, 'ticker')
    : ''
  const scheduledDate = body.scheduledPublicationDate == null || body.scheduledPublicationDate === ''
    ? null
    : String(body.scheduledPublicationDate)
  if (scheduledDate && !isCalendarDate(scheduledDate)) {
    fail('scheduledPublicationDate must be a real calendar date in YYYY-MM-DD format')
  }

  return {
    title: cleanString(body.title, { label: 'title', max: 200 }),
    ticker,
    company: cleanString(body.company, { label: 'company', max: 200 }),
    sector: cleanString(body.sector, { label: 'sector', max: 100 }),
    side: SIDES.has(String(body.side || '').toLowerCase()) ? String(body.side).toLowerCase() : 'bull',
    body: sanitizeThesisHtml(html),
    triggers: cleanDraftTriggers(body.triggers),
    model: cleanWorkbookModel(body.model),
    scheduledPublicationDate: scheduledDate,
  }
}

const LOCAL_DRAFT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/

function cleanLocalDraftId(value) {
  const localId = cleanString(value, { label: 'localId', max: 160, required: true })
  if (!LOCAL_DRAFT_ID.test(localId)) fail('localId contains unsupported characters')
  return localId
}

export function validateDraftCreatePayload(body) {
  assertAllowedKeys(body, new Set(['draft', 'localId']), 'draft request')
  return {
    draft: validateDraftPayload(body.draft),
    localId: cleanLocalDraftId(body.localId),
  }
}

export function validateDraftUpdatePayload(body) {
  assertAllowedKeys(body, new Set(['draft', 'version']), 'draft request')
  const version = Number(body.version)
  if (!Number.isSafeInteger(version) || version < 1) fail('version must be a positive integer')
  return { draft: validateDraftPayload(body.draft), version }
}

export function validateScheduledPublicationPayload(body) {
  if (!isPlainObject(body)) fail('scheduled publication must be an object')
  const scheduledDate = String(body.scheduledPublicationDate || '')
  if (!isCalendarDate(scheduledDate)) {
    fail('scheduledPublicationDate must be a real calendar date in YYYY-MM-DD format')
  }
  const earliestExchangeDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const maximum = `${new Date().getUTCFullYear() + 5}-12-31`
  // The database performs the authoritative comparison in the resolved
  // exchange timezone. Permit the adjacent UTC date at the API boundary.
  if (scheduledDate < earliestExchangeDate) fail('scheduledPublicationDate cannot be in the past')
  if (scheduledDate > maximum) fail('scheduledPublicationDate is outside the supported range')
  return {
    thesis: validateThesisPayload(body),
    scheduledDate,
  }
}

export function validateUpdatePayload(body) {
  assertAllowedKeys(body, new Set(['text']), 'update')
  return { text: cleanString(body.text, { label: 'text', max: 5_000, required: true }) }
}

export function validateLifecyclePayload(body) {
  assertAllowedKeys(body, new Set(['action', 'closeDate']), 'lifecycle request')
  const action = String(body.action || '')
  if (action === 'close') {
    if (body.closeDate != null) fail('closeDate is not allowed for the close action')
    return { action }
  }
  if (action !== 'schedule-close') fail('unknown action')
  const closeDate = String(body.closeDate || '')
  if (!isCalendarDate(closeDate)) fail('closeDate must be a real calendar date in YYYY-MM-DD format')
  const today = new Date().toISOString().slice(0, 10)
  // Exchange time may still be on the previous calendar day. The scheduling
  // RPC performs the exact future-date check after resolving the exchange.
  if (closeDate < today) fail('closeDate must be in the future')
  return { action, closeDate }
}

export function validateNotificationReadPayload(body) {
  assertAllowedKeys(body, new Set(['ids', 'all']), 'notification request')
  if (body.all === true) return { all: true, ids: [] }
  if (!Array.isArray(body.ids) || !body.ids.length) fail('ids or all=true is required')
  if (body.ids.length > 100) fail('no more than 100 notification ids are allowed')
  const ids = [...new Set(body.ids.map((value) => {
    const id = Number(value)
    if (!Number.isSafeInteger(id) || id <= 0) fail('notification ids must be positive integers')
    return id
  }))]
  return { all: false, ids }
}

export function validateSocialMutationPayload(body) {
  if (!isPlainObject(body)) fail('social request must be an object')
  assertAllowedKeys(body, new Set(['kind', 'targetId']), 'social request')
  const kind = String(body.kind || '')
  if (kind === 'follow') {
    const targetId = String(body.targetId || '').toLowerCase()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(targetId)) {
      fail('targetId must be a valid analyst id')
    }
    return { kind, targetId }
  }
  if (kind === 'bookmark') {
    const targetId = Number(body.targetId)
    if (!Number.isSafeInteger(targetId) || targetId <= 0) fail('targetId must be a positive thesis id')
    return { kind, targetId }
  }
  fail('kind must be follow or bookmark')
}

export function validateCommentPayload(body) {
  if (!isPlainObject(body)) fail('comment must be an object')
  assertAllowedKeys(body, new Set(['body', 'parentId']), 'comment')
  const text = cleanString(body.body, { label: 'comment', max: 2_000, required: true })
  if (body.parentId == null) return { body: text, parentId: null }
  const parentId = Number(body.parentId)
  if (!Number.isSafeInteger(parentId) || parentId <= 0) fail('parentId must be a positive comment id')
  return { body: text, parentId }
}

export function validateCommentReportPayload(body) {
  if (!isPlainObject(body)) fail('report must be an object')
  assertAllowedKeys(body, new Set(['reason', 'details']), 'report')
  const reason = String(body.reason || '')
  if (!new Set(['spam', 'harassment', 'misinformation', 'other']).has(reason)) {
    fail('unsupported report reason')
  }
  return {
    reason,
    details: cleanString(body.details, { label: 'report details', max: 500 }),
  }
}

export function validateCardItems(body) {
  assertAllowedKeys(body, new Set(['items']), 'cards request')
  if (!Array.isArray(body.items) || !body.items.length) fail('items array is required')
  if (body.items.length > 25) fail('no more than 25 card items are allowed')
  const seen = new Set()
  const items = []
  body.items.forEach((item, index) => {
    if (!isPlainObject(item)) fail(`item ${index + 1} must be an object`)
    assertAllowedKeys(item, new Set(['symbol', 'from']), `item ${index + 1}`)
    const symbol = normalizeSymbol(item.symbol, `item ${index + 1} symbol`)
    const from = validateHistoryDate(item.from)
    const key = `${symbol}\u0000${from}`
    if (!seen.has(key)) {
      seen.add(key)
      items.push({ symbol, from })
    }
  })
  return items
}

export function validationResponse(error) {
  if (error instanceof RequestValidationError) {
    return { message: error.message, status: error.status }
  }
  return null
}
