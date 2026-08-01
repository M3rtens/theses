import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useData } from '../components/DataProvider.jsx'
import { SECTORS } from '../lib/sectors.js'

const PAGE_SIZE = 12

export default function Discover({ navigate }) {
  const { discover: cachedFeed, discoverMeta: cachedMeta, loading: appLoading } = useData()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [sector, setSector] = useState('all')
  const [sort, setSort] = useState('trending')
  const [page, setPage] = useState(1)
  const [feed, setFeed] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, totalItems: 0, totalPages: 1 })
  const [availableSectors, setAvailableSectors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    const isDefaultPage = !debouncedQuery && sector === 'all' && sort === 'trending' && page === 1
    if (isDefaultPage) {
      setFeed(cachedFeed)
      setPagination(cachedMeta.pagination)
      setAvailableSectors(cachedMeta.facets?.sectors || [])
      setLoading(appLoading.discover)
      setError('')
      return undefined
    }

    const controller = new AbortController()
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sort,
    })
    if (debouncedQuery) params.set('q', debouncedQuery)
    if (sector !== 'all') params.set('sector', sector)

    setLoading(true)
    setError('')
    fetch(`/api/discover?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Community feed unavailable')
        return data
      })
      .then((data) => {
        setFeed(Array.isArray(data?.items) ? data.items : [])
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
  }, [appLoading.discover, cachedFeed, cachedMeta, debouncedQuery, page, sector, sort])

  const sectors = useMemo(
    () => [...new Set([...SECTORS, ...availableSectors])].sort(),
    [availableSectors],
  )
  const changeFilter = (setter) => (value) => {
    setPage(1)
    setter(value)
  }
  const firstItem = pagination.totalItems ? (pagination.page - 1) * pagination.pageSize + 1 : 0
  const lastItem = Math.min(pagination.page * pagination.pageSize, pagination.totalItems)

  return (
    <>
      <header className="px-4 pt-6 pb-5 sm:px-6 sm:pt-8 sm:pb-6 lg:px-12 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Community Feed</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">Discover</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Recent theses published by the community. Performance is tracked from publish time.</p>
          </div>
          <div className="flex items-center gap-1 p-1 border rounded-md overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <button type="button" aria-pressed={sort === 'trending'} onClick={() => changeFilter(setSort)('trending')} className={`lb-filter whitespace-nowrap text-xs px-3 py-1 rounded ${sort === 'trending' ? 'active' : ''}`}>Trending</button>
            <button type="button" aria-pressed={sort === 'newest'} onClick={() => changeFilter(setSort)('newest')} className={`lb-filter whitespace-nowrap text-xs px-3 py-1 rounded ${sort === 'newest' ? 'active' : ''}`}>Newest</button>
            <button type="button" aria-pressed={sort === 'top'} onClick={() => changeFilter(setSort)('top')} className={`lb-filter whitespace-nowrap text-xs px-3 py-1 rounded ${sort === 'top' ? 'active' : ''}`}>Top Performers</button>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3 mt-6">
          <div className="relative w-full flex-1 min-w-0 sm:min-w-64 sm:max-w-md">
            <i className="icon-search text-sm absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }}></i>
            <input
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1) }}
              placeholder="Search theses by title…"
              className="w-full text-sm pl-9 pr-3 py-2 border rounded-md"
              style={{ borderColor: 'var(--border)', background: 'white', color: 'var(--ink)' }}
            />
          </div>
          <select
            value={sector}
            onChange={(event) => changeFilter(setSector)(event.target.value)}
            aria-label="Filter by sector"
            className="w-full sm:w-auto text-sm px-3 py-2 border rounded-md"
            style={{ borderColor: 'var(--border)', background: 'white', color: 'var(--ink)' }}
          >
            <option value="all">All sectors</option>
            {sectors.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <span className="text-xs font-mono sm:ml-auto" style={{ color: 'var(--muted)' }}>{pagination.totalItems} matching theses</span>
        </div>
      </header>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
        {error && (
          <div className="p-4 mb-5 border rounded-md text-sm" role="alert" style={{ borderColor: 'var(--bear)', color: 'var(--bear)' }}>{error}</div>
        )}
        {!loading && !error && feed.length === 0 && (
          <div className="p-6 border rounded-md text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <div className="font-serif text-lg font-medium">No theses match</div>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Try a different title search or sector.</p>
          </div>
        )}
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {feed.map((thesis) => {
            const retClass = thesis.ret >= 0 ? 'ret-pos' : 'ret-neg'
            const sign = thesis.ret >= 0 ? '+' : '−'
            const sideClass = thesis.side === 'bull' ? 'side-bull' : 'side-bear'
            const sideLabel = thesis.side === 'bull' ? 'BULL' : 'BEAR'
            const initials = thesis.author.split(' ').map((name) => name[0]).join('')
            return (
              <div key={thesis.id} className="thesis-card rounded-md p-4 sm:p-6 cursor-pointer flex flex-col" onClick={() => navigate('thesis', thesis)}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[10px] font-semibold" style={{ background: 'var(--bg-warm)', color: 'var(--ink)', border: '1px solid var(--border)' }}>{initials}</div>
                    <div>
                      {thesis.authorSlug
                        ? <Link href={`/analysts/${thesis.authorSlug}`} onClick={(event) => event.stopPropagation()} className="text-xs font-medium hover:underline">{thesis.author}</Link>
                        : <div className="text-xs font-medium">{thesis.author}</div>}
                      <div className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{thesis.handle ? `${thesis.handle} · ` : ''}{thesis.date}</div>
                    </div>
                  </div>
                  <span className={`${sideClass} text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded`}>{sideLabel}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-mono text-sm font-semibold">{thesis.ticker}</span>
                  {thesis.sector && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-warm)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{thesis.sector}</span>}
                  <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>·</span>
                  <span className={`font-mono text-sm font-semibold ${retClass}`}>{sign}{Math.abs(thesis.ret).toFixed(1)}%</span>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>since publish</span>
                </div>

                <h3 className="font-serif text-xl font-medium mb-2 leading-snug">
                  <Link href={`/theses/${thesis.id}`} onClick={(event) => event.stopPropagation()}>{thesis.title}</Link>
                </h3>
                <p className="text-sm leading-relaxed mb-5 flex-1" style={{ color: 'var(--ink-soft)' }}>{thesis.snippet}</p>

                <div className="pt-4 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border)' }}>
                  <span className="flex items-center gap-1" style={{ color: 'var(--muted)' }}><i className="icon-message-square text-xs"></i> {thesis.updates || 0}</span>
                  <Link href={`/theses/${thesis.id}`} onClick={(event) => event.stopPropagation()} className="font-medium">Read thesis →</Link>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between mt-6 text-xs" style={{ color: 'var(--muted)' }}>
          <span>{pagination.totalItems ? `Showing ${firstItem}–${lastItem} of ${pagination.totalItems} matching theses` : 'Showing 0 matching theses'}</span>
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
