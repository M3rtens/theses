import { makeRetOf, selfStats } from './stats.js'

export const DISCOVER_PAGE_SIZE = 12
export const LEADERBOARD_PAGE_SIZE = 25
export const MAX_COMMUNITY_PAGE_SIZE = 50

export const DISCOVER_SORT_VALUES = ['trending', 'newest', 'top', 'activity', 'discussed', 'popular']
export const DISCOVER_SIDE_VALUES = ['all', 'bull', 'bear']
export const DISCOVER_STATUS_VALUES = ['all', 'active', 'closed']
export const DISCOVER_PUBLISHED_VALUES = ['all', '7d', '30d', '90d', '1y']
export const DISCOVER_PERFORMANCE_VALUES = ['all', 'positive', 'negative', '10plus']

const DISCOVER_SORTS = new Set(DISCOVER_SORT_VALUES)
const SIDES = new Set(['all', 'bull', 'bear'])
const STATUSES = new Set(DISCOVER_STATUS_VALUES)
const PUBLISHED_PERIODS = new Set(DISCOVER_PUBLISHED_VALUES)
const PERFORMANCE = new Set(DISCOVER_PERFORMANCE_VALUES)
const PERIODS = new Set(['all', 'lt30', '30to90', '90plus'])

function integerParam(params, name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = params.get(name)
  if (raw == null || raw === '') return fallback
  if (!/^\d+$/.test(raw)) throw new TypeError(`${name} must be an integer`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${name} must be between ${min} and ${max}`)
  }
  return value
}

function enumParam(params, name, allowed, fallback) {
  const value = params.get(name) || fallback
  if (!allowed.has(value)) throw new TypeError(`unsupported ${name}`)
  return value
}

function textParam(params, name, maxLength) {
  const value = (params.get(name) || '').trim()
  if (value.length > maxLength) throw new TypeError(`${name} is too long`)
  return value
}

function paginationParams(params, defaultPageSize) {
  return {
    page: integerParam(params, 'page', 1, { max: 10_000 }),
    pageSize: integerParam(params, 'pageSize', defaultPageSize, { max: MAX_COMMUNITY_PAGE_SIZE }),
  }
}

export function parseDiscoverQuery(params) {
  return {
    ...paginationParams(params, DISCOVER_PAGE_SIZE),
    query: textParam(params, 'q', 100),
    sector: textParam(params, 'sector', 80) || 'all',
    side: enumParam(params, 'side', SIDES, 'all'),
    status: enumParam(params, 'status', STATUSES, 'all'),
    published: enumParam(params, 'published', PUBLISHED_PERIODS, 'all'),
    performance: enumParam(params, 'performance', PERFORMANCE, 'all'),
    sort: enumParam(params, 'sort', DISCOVER_SORTS, 'trending'),
  }
}

export function parseLeaderboardQuery(params) {
  return {
    ...paginationParams(params, LEADERBOARD_PAGE_SIZE),
    side: enumParam(params, 'side', SIDES, 'all'),
    period: enumParam(params, 'period', PERIODS, 'all'),
    sector: textParam(params, 'sector', 80) || 'all',
  }
}

function pagination(totalItems, page, pageSize) {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  }
}

function pageItems(items, page, pageSize) {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}

function thesisAgeDays(thesis, now) {
  const timestamp = Date.parse(thesis.createdAt || thesis.publishDate || '')
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : Math.max(0, (now - timestamp) / 86_400_000)
}

function newestFirst(a, b, now) {
  const ageDifference = thesisAgeDays(a, now) - thesisAgeDays(b, now)
  if (ageDifference) return ageDifference
  return Number(b.id || 0) - Number(a.id || 0)
}

function matchesPublished(thesis, period, now) {
  if (period === 'all') return true
  const maximum = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[period]
  return thesisAgeDays(thesis, now) <= maximum
}

function matchesPerformance(value, filter) {
  if (filter === 'positive') return value > 0
  if (filter === 'negative') return value < 0
  if (filter === '10plus') return value >= 10
  return true
}

function plainText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ')
}

export function discoverSearchText(thesis) {
  return [
    thesis.title, thesis.ticker, thesis.company, thesis.sector,
    thesis.author, thesis.handle, plainText(thesis.body),
  ].filter(Boolean).join(' ').toLocaleLowerCase()
}

export function buildDiscoverPage(theses, options, now = Date.now()) {
  const retOf = makeRetOf(null)
  const query = String(options.query || '').toLocaleLowerCase()
  const sector = options.sector || 'all'
  const side = options.side || 'all'
  const status = options.status || 'all'
  const published = options.published || 'all'
  const performance = options.performance || 'all'
  const sectors = [...new Set(theses.map((thesis) => thesis.sector).filter(Boolean))].sort()
  const filtered = theses.filter((thesis) => {
    if (sector !== 'all' && thesis.sector !== sector) return false
    if (side !== 'all' && thesis.side !== side) return false
    if (status !== 'all' && thesis.status !== status) return false
    if (!matchesPublished(thesis, published, now)) return false
    if (!matchesPerformance(retOf(thesis), performance)) return false
    if (query && !discoverSearchText(thesis).includes(query)) return false
    return true
  })

  const byNewest = (a, b) => newestFirst(a, b, now)
  const trendScore = (thesis) => (Number(thesis.updates) || 0) * 5
    + (Number(thesis.commentCount) || 0) * 3
    + (Number(thesis.bookmarkCount) || 0) * 2
    + Math.max(0, 30 - thesisAgeDays(thesis, now))
  const compare = {
    newest: byNewest,
    top: (a, b) => retOf(b) - retOf(a) || byNewest(a, b),
    trending: (a, b) => trendScore(b) - trendScore(a) || byNewest(a, b),
    activity: (a, b) => ((Number(b.updates) || 0) + (Number(b.commentCount) || 0))
      - ((Number(a.updates) || 0) + (Number(a.commentCount) || 0)) || byNewest(a, b),
    discussed: (a, b) => (Number(b.commentCount) || 0) - (Number(a.commentCount) || 0) || byNewest(a, b),
    popular: (a, b) => ((Number(b.bookmarkCount) || 0) * 3 + (Number(b.commentCount) || 0) * 2 + (Number(b.updates) || 0))
      - ((Number(a.bookmarkCount) || 0) * 3 + (Number(a.commentCount) || 0) * 2 + (Number(a.updates) || 0)) || byNewest(a, b),
  }[options.sort]
  const ranked = [...filtered].sort(compare)
  const items = pageItems(ranked, options.page, options.pageSize).map((thesis) => ({
    ...thesis,
    ret: retOf(thesis),
    date: thesis.publishDate,
    snippet: thesis.snippet,
  }))

  return {
    items,
    pagination: pagination(ranked.length, options.page, options.pageSize),
    facets: { sectors },
  }
}

function matchesPeriod(thesis, period) {
  const days = Math.max(0, Number(thesis.daysActive) || 0)
  if (period === 'lt30') return days < 30
  if (period === '30to90') return days >= 30 && days < 90
  if (period === '90plus') return days >= 90
  return true
}

export function buildLeaderboardPage(theses, options, viewerId = null) {
  const sectors = [...new Set(theses.map((thesis) => thesis.sector).filter(Boolean))].sort()
  const matchingTheses = theses.filter((thesis) => {
    if (options.side !== 'all' && thesis.side !== options.side) return false
    if (options.sector !== 'all' && thesis.sector !== options.sector) return false
    return matchesPeriod(thesis, options.period)
  })

  const byUser = new Map()
  for (const thesis of matchingTheses) {
    const rows = byUser.get(thesis.ownerId) || []
    rows.push(thesis)
    byUser.set(thesis.ownerId, rows)
  }

  const retOf = makeRetOf(null)
  const ranked = [...byUser.entries()]
    .map(([userId, portfolio]) => {
      const identity = portfolio[0] || {}
      return {
        userId,
        name: identity.author || 'Analyst',
        handle: identity.handle || '',
        avatar: identity.authorAvatar || (identity.author ? identity.author.slice(0, 2).toUpperCase() : '—'),
        slug: identity.authorSlug || '',
        isYou: userId === viewerId,
        ...selfStats(portfolio, retOf),
      }
    })
    .sort((a, b) => b.avgReturn - a.avgReturn || b.theses - a.theses || String(a.userId).localeCompare(String(b.userId)))
    .map((row, index) => ({ ...row, rank: index + 1 }))

  return {
    items: pageItems(ranked, options.page, options.pageSize),
    pagination: pagination(ranked.length, options.page, options.pageSize),
    facets: { sectors },
    viewer: viewerId ? ranked.find((row) => row.userId === viewerId) || null : null,
  }
}
