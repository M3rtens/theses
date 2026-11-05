import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPortfolioAnalytics } from '../src/lib/portfolioAnalytics.js'

const point = (time, value) => ({ time, value })

test('portfolio analytics builds a time-weighted curve and matched benchmark', () => {
  const theses = [
    {
      id: 1, ticker: 'LONG', side: 'bull', sector: 'Software', status: 'closed',
      entryDate: '2026-01-01', entry: 100, closedAt: '2026-01-03T12:00:00Z', closeReturn: 5, daysActive: 2,
    },
    {
      id: 2, ticker: 'SHORT', side: 'bear', sector: 'Energy', status: 'active',
      entryDate: '2026-01-02', entry: 200, daysActive: 3,
    },
  ]
  const market = {
    histories: {
      1: [point('2026-01-01', 100), point('2026-01-02', 110), point('2026-01-03', 105)],
      2: [point('2026-01-02', 200), point('2026-01-03', 180), point('2026-01-04', 190)],
    },
    benchmark: [
      point('2026-01-01', 100), point('2026-01-02', 101),
      point('2026-01-03', 102), point('2026-01-04', 99),
    ],
  }

  const result = buildPortfolioAnalytics(theses, market)
  assert.deepEqual(result.equityCurve.map((row) => row.time), [
    '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04',
  ])
  assert.equal(result.equityCurve[1].value, 105)
  assert.equal(result.summary.totalReturn, 3)
  assert.equal(result.summary.benchmarkReturn, -1.5)
  assert.equal(result.summary.alpha, 4.4)
  assert.deepEqual(result.sectorExposure, [{ label: 'Energy', count: 1, percentage: 100 }])
  assert.deepEqual(result.sideExposure, [{ label: 'Short', count: 1, percentage: 100 }])
  assert.deepEqual(result.hitRates[0], { label: '0–30d', theses: 1, wins: 1, winRate: 100 })
})

test('portfolio analytics reports peak-to-trough drawdown and empty states', () => {
  const falling = buildPortfolioAnalytics([{
    id: 1, ticker: 'FALL', side: 'bull', sector: '', status: 'active', entryDate: '2026-01-01', entry: 100,
  }], {
    histories: { 1: [point('2026-01-01', 100), point('2026-01-02', 90), point('2026-01-03', 95)] },
    benchmark: [],
  })
  assert.equal(falling.summary.maxDrawdown, -10)
  assert.equal(falling.summary.totalReturn, -5)

  const empty = buildPortfolioAnalytics([], {})
  assert.equal(empty.summary.totalReturn, 0)
  assert.equal(empty.summary.benchmarkReturn, null)
  assert.equal(empty.summary.alpha, null)
  assert.deepEqual(empty.equityCurve, [])
  assert.deepEqual(empty.sectorExposure, [])
})
