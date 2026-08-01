import { makeRetOf, selfStats } from './stats.js'

export const DISCOVER_PAGE_SIZE = 12
export const LEADERBOARD_PAGE_SIZE = 25
export const MAX_COMMUNITY_PAGE_SIZE = 50

const DISCOVER_SORTS = new Set(['trending', 'newest', 'top'])
const SIDES = new Set(['all', 'bull', 'bear'])
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

export function buildDiscoverPage(theses, options, now = Date.now()) {
  const retOf = makeRetOf(null)
  const query = options.query.toLocaleLowerCase()
  const sectors = [...new Set(theses.map((thesis) => thesis.sector).filter(Boolean))].sort()
  const filtered = theses.filter((thesis) => {
    if (options.sector !== 'all' && thesis.sector !== options.sector) return false
    if (query && !String(thesis.title || '').toLocaleLowerCase().includes(query)) return false
    return true
  })

  const byNewest = (a, b) => newestFirst(a, b, now)
  const trendScore = (thesis) => (Number(thesis.updates) || 0) * 5
    + Math.max(0, 30 - thesisAgeDays(thesis, now))
  const compare = {
    newest: byNewest,
    top: (a, b) => retOf(b) - retOf(a) || byNewest(a, b),
    trending: (a, b) => trendScore(b) - trendScore(a) || byNewest(a, b),
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
