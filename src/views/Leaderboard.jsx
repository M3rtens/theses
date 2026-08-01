import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useData } from '../components/DataProvider.jsx'
import { SECTORS } from '../lib/sectors.js'

const PAGE_SIZE = 25
const SIDE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'bull', label: 'Long only' },
  { value: 'bear', label: 'Short only' },
]
const PERIOD_FILTERS = [
  { value: 'all', label: 'All Periods' },
  { value: 'lt30', label: '< 30d' },
  { value: '30to90', label: '30–90d' },
  { value: '90plus', label: '90d+' },
]

export default function Leaderboard() {
  const { leaderboard: cachedBoard, leaderboardMeta: cachedMeta, loading: appLoading } = useData()
  const [side, setSide] = useState('all')
  const [period, setPeriod] = useState('all')
  const [sector, setSector] = useState('all')
  const [page, setPage] = useState(1)
  const [board, setBoard] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, totalItems: 0, totalPages: 1 })
  const [availableSectors, setAvailableSectors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const isDefaultPage = side === 'all' && period === 'all' && sector === 'all' && page === 1
    if (isDefaultPage) {
      setBoard(cachedBoard)
      setPagination(cachedMeta.pagination)
      setAvailableSectors(cachedMeta.facets?.sectors || [])
      setLoading(appLoading.leaderboard)
      setError('')
      return undefined
    }

    const controller = new AbortController()
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      side,
      period,
    })
    if (sector !== 'all') params.set('sector', sector)

    setLoading(true)
    setError('')
    fetch(`/api/leaderboard?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Leaderboard unavailable')
        return data
      })
      .then((data) => {
        setBoard(Array.isArray(data?.items) ? data.items : [])
        setPagination(data?.pagination || { page, pageSize: PAGE_SIZE, totalItems: 0, totalPages: 1 })
        setAvailableSectors(data?.facets?.sectors || [])
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [appLoading.leaderboard, cachedBoard, cachedMeta, page, period, sector, side])

  const sectorFilters = useMemo(
    () => [...new Set([...SECTORS, ...availableSectors])].sort(),
    [availableSectors],
  )
  const selectFilter = (setter, value) => {
    setPage(1)
    setter(value)
  }
  const filterClass = (active) => `lb-filter ${active ? 'active' : ''} text-xs px-3 py-1 rounded`
  const firstItem = pagination.totalItems ? (pagination.page - 1) * pagination.pageSize + 1 : 0
  const lastItem = Math.min(pagination.page * pagination.pageSize, pagination.totalItems)

  return (
    <>
      <header className="px-4 pt-6 pb-5 sm:px-6 sm:pt-8 sm:pb-6 lg:px-12 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Integrity-Protected Rankings</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">Leaderboard</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Rankings based on system-locked entry timestamps. Filters recalculate each analyst from matching theses across their full portfolio.</p>
          </div>
          <div className="seal"><i className="icon-fingerprint text-[11px]"></i> Verified by Theses Protocol</div>
        </div>

        <div className="flex items-center flex-wrap gap-2 mt-6">
          <div className="flex max-w-full items-center gap-1 p-1 border rounded-md overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'white' }}>
            {SIDE_FILTERS.map((filter) => (
              <button key={filter.value} type="button" aria-pressed={side === filter.value} onClick={() => selectFilter(setSide, filter.value)} className={filterClass(side === filter.value)}>{filter.label}</button>
            ))}
          </div>
          <div className="flex max-w-full items-center gap-1 p-1 border rounded-md overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'white' }}>
            {PERIOD_FILTERS.map((filter) => (
              <button key={filter.value} type="button" aria-pressed={period === filter.value} onClick={() => selectFilter(setPeriod, filter.value)} className={filterClass(period === filter.value)}>{filter.label}</button>
            ))}
          </div>
          <select
            value={sector}
            onChange={(event) => selectFilter(setSector, event.target.value)}
            aria-label="Filter leaderboard by sector"
            className="max-w-full text-xs px-3 py-2 border rounded-md"
            style={{ borderColor: 'var(--border)', background: 'white', color: 'var(--ink)' }}
          >
            <option value="all">All Sectors</option>
            {sectorFilters.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <div className="w-full sm:w-auto sm:ml-auto text-xs font-mono" style={{ color: 'var(--muted)' }}>{pagination.totalItems} matching analyst{pagination.totalItems === 1 ? '' : 's'}</div>
        </div>
      </header>

      <div className="px-4 py-6 sm:px-6 lg:px-12">
        {error && (
          <div className="p-4 mb-5 border rounded-md text-sm" role="alert" style={{ borderColor: 'var(--bear)', color: 'var(--bear)' }}>{error}</div>
        )}
        <div className={`border rounded-md overflow-x-auto ${loading ? 'opacity-60' : ''}`} aria-busy={loading} style={{ borderColor: 'var(--border)', background: 'white' }}>
          <table className="w-full min-w-[850px]">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-warm)' }}>
                <th className="text-left text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Rank</th>
                <th className="text-left text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Analyst</th>
                <th className="text-right text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Theses</th>
                <th className="text-right text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Win Rate</th>
                <th className="text-right text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Avg Return</th>
                <th className="text-right text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Annualized</th>
                <th className="text-right text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Avg Hold</th>
                <th className="text-left text-[10px] font-mono uppercase tracking-wider px-4 py-3" style={{ color: 'var(--muted)' }}>Best Thesis</th>
              </tr>
            </thead>
            <tbody>
              {board.map((analyst) => {
                const retClass = analyst.avgReturn >= 0 ? 'ret-pos' : 'ret-neg'
                const sign = analyst.avgReturn >= 0 ? '+' : '−'
                const isTop3 = analyst.rank <= 3
                return (
                  <tr key={analyst.userId} className="lb-row border-b last:border-b-0" style={{ borderColor: 'var(--border)', ...(analyst.isYou ? { background: 'var(--bg-warm)' } : {}) }}>
                    <td className="px-4 py-3.5">
                      {isTop3 ? <span className="font-serif text-lg font-medium">{analyst.rank}</span> : <span className="font-mono text-sm">{analyst.rank}</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-mono text-xs font-semibold" style={{ background: analyst.isYou ? 'var(--ink)' : 'var(--bg-warm)', color: analyst.isYou ? 'white' : 'var(--ink)', border: `1px solid ${analyst.isYou ? 'var(--ink)' : 'var(--border)'}` }}>{analyst.avatar}</div>
                        <div>
                          <div className="text-sm font-medium">
                            {analyst.slug ? <Link href={`/analysts/${analyst.slug}`} className="hover:underline">{analyst.name}</Link> : analyst.name}
                            {analyst.isYou && <span className="text-[9px] font-mono px-1.5 py-0.5 ml-2 rounded" style={{ background: 'var(--ink)', color: 'white' }}>YOU</span>}
                          </div>
                          <div className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>{analyst.handle}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-sm">{analyst.theses}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-sm">{analyst.winRate}%</td>
                    <td className={`px-4 py-3.5 text-right font-mono text-sm font-semibold ${retClass}`}>{sign}{Math.abs(analyst.avgReturn).toFixed(1)}%</td>
                    <td className={`px-4 py-3.5 text-right font-mono text-sm ${retClass}`}>{sign}{Math.abs(analyst.annualized).toFixed(1)}%</td>
                    <td className="px-4 py-3.5 text-right font-mono text-sm" style={{ color: 'var(--ink-soft)' }}>{analyst.avgHold}</td>
                    <td className="px-4 py-3.5"><div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{analyst.best}</div></td>
                  </tr>
                )
              })}
              {!loading && !error && board.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="font-serif text-lg font-medium">No analysts match these filters</div>
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Try a different side, holding period, or sector.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between mt-6 text-xs" style={{ color: 'var(--muted)' }}>
          <span>{pagination.totalItems ? `Showing ${firstItem}–${lastItem} of ${pagination.totalItems} matching analysts` : 'Showing 0 matching analysts'}</span>
          <div className="leaderboard-pagination flex items-center gap-2">
            <button type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)} className="px-2 py-1 border rounded" style={{ borderColor: 'var(--border)' }}>Previous</button>
            <span className="font-mono">Page {pagination.page} of {pagination.totalPages}</span>
            <button type="button" disabled={loading || page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)} className="px-2 py-1 border rounded" style={{ borderColor: 'var(--border)' }}>Next</button>
          </div>
        </div>
      </div>
    </>
  )
}
