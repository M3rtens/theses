import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useData } from '../components/DataProvider.jsx'
import { useUser } from '../components/UserProvider.jsx'
import { SECTORS } from '../lib/sectors.js'

const PAGE_SIZE = 12
const SORTS = [
  ['trending', 'Trending'], ['newest', 'Newest'], ['top', 'Best return'],
  ['activity', 'Most active'], ['discussed', 'Most discussed'], ['popular', 'Most popular'],
]

const DEFAULT_FILTERS = {
  query: '', sector: 'all', side: 'all', status: 'all',
  published: 'all', performance: 'all', sort: 'trending',
}

export default function Discover({ navigate }) {
  const user = useUser()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { discover: cachedFeed, discoverMeta: cachedMeta, loading: appLoading } = useData()
  const [query, setQuery] = useState(() => searchParams.get('q') || '')
  const [debouncedQuery, setDebouncedQuery] = useState(() => (searchParams.get('q') || '').trim())
  const [sector, setSector] = useState(() => searchParams.get('sector') || 'all')
  const [side, setSide] = useState(() => searchParams.get('side') || 'all')
  const [status, setStatus] = useState(() => searchParams.get('status') || 'all')
  const [published, setPublished] = useState(() => searchParams.get('published') || 'all')
  const [performance, setPerformance] = useState(() => searchParams.get('performance') || 'all')
  const [sort, setSort] = useState(() => searchParams.get('sort') || 'trending')
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1))
  const [feed, setFeed] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, totalItems: 0, totalPages: 1 })
  const [availableSectors, setAvailableSectors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savedSearches, setSavedSearches] = useState([])
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveNotifications, setSaveNotifications] = useState(true)
  const [savedBusy, setSavedBusy] = useState(false)
  const [savedError, setSavedError] = useState('')

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('view', 'discover')
    if (debouncedQuery) params.set('q', debouncedQuery)
    if (sector !== 'all') params.set('sector', sector)
    if (side !== 'all') params.set('side', side)
    if (status !== 'all') params.set('status', status)
    if (published !== 'all') params.set('published', published)
    if (performance !== 'all') params.set('performance', performance)
    if (sort !== 'trending') params.set('sort', sort)
    if (page > 1) params.set('page', String(page))
    const next = `${pathname}?${params}`
    if (`${window.location.pathname}${window.location.search}` !== next) {
      router.replace(next, { scroll: false })
    }
  }, [debouncedQuery, page, pathname, performance, published, router, sector, side, sort, status])

  useEffect(() => {
    if (!user) {
      setSavedSearches([])
      return
    }
    fetch('/api/saved-searches')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Saved searches unavailable')))
      .then((rows) => setSavedSearches(Array.isArray(rows) ? rows : []))
      .catch(() => setSavedSearches([]))
  }, [user])

  useEffect(() => {
    const isDefaultPage = !debouncedQuery && sector === 'all' && side === 'all'
      && status === 'all' && published === 'all' && performance === 'all'
      && sort === 'trending' && page === 1
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
    if (side !== 'all') params.set('side', side)
    if (status !== 'all') params.set('status', status)
    if (published !== 'all') params.set('published', published)
    if (performance !== 'all') params.set('performance', performance)

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
  }, [appLoading.discover, cachedFeed, cachedMeta, debouncedQuery, page, performance, published, sector, side, sort, status])

  const sectors = useMemo(
    () => [...new Set([...SECTORS, ...availableSectors])].sort(),
    [availableSectors],
  )
  const changeFilter = (setter) => (value) => {
    setPage(1)
    setter(value)
  }
  const currentFilters = { query: query.trim(), sector, side, status, published, performance, sort }
  const hasActiveFilters = Boolean(query.trim()) || sector !== 'all' || side !== 'all'
    || status !== 'all' || published !== 'all' || performance !== 'all' || sort !== 'trending'
  const resetFilters = () => {
    setQuery('')
    setDebouncedQuery('')
    setSector('all')
    setSide('all')
    setStatus('all')
    setPublished('all')
    setPerformance('all')
    setSort('trending')
    setPage(1)
  }
  const applySavedSearch = (saved) => {
    const filters = { ...DEFAULT_FILTERS, ...(saved.filters || {}) }
    setQuery(filters.query)
    setDebouncedQuery(filters.query.trim())
    setSector(filters.sector)
    setSide(filters.side)
    setStatus(filters.status)
    setPublished(filters.published)
    setPerformance(filters.performance)
    setSort(filters.sort)
    setPage(1)
  }
  const saveCurrentSearch = async () => {
    if (!saveName.trim() || savedBusy) return
    setSavedBusy(true)
    setSavedError('')
    try {
      const response = await fetch('/api/saved-searches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: saveName, filters: currentFilters, notifyEnabled: saveNotifications }),
      })
      const saved = await response.json().catch(() => null)
      if (!response.ok) throw new Error(saved?.error || 'Could not save search')
      setSavedSearches((rows) => [saved, ...rows])
      setSaveName('')
      setSaveOpen(false)
    } catch (saveError) {
      setSavedError(saveError.message)
    } finally {
      setSavedBusy(false)
    }
  }
  const updateSavedSearch = async (saved, patch) => {
    if (savedBusy) return
    setSavedBusy(true)
    setSavedError('')
    try {
      const response = await fetch(`/api/saved-searches/${saved.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: saved.name,
          filters: saved.filters,
          notifyEnabled: patch.notifyEnabled ?? saved.notifyEnabled,
        }),
      })
      const updated = await response.json().catch(() => null)
      if (!response.ok) throw new Error(updated?.error || 'Could not update saved search')
      setSavedSearches((rows) => rows.map((row) => row.id === saved.id ? updated : row))
    } catch (updateError) {
      setSavedError(updateError.message)
    } finally {
      setSavedBusy(false)
    }
  }
  const deleteSavedSearch = async (saved) => {
    if (savedBusy || !window.confirm(`Delete saved search “${saved.name}”?`)) return
    setSavedBusy(true)
    setSavedError('')
    try {
      const response = await fetch(`/api/saved-searches/${saved.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not delete saved search')
      setSavedSearches((rows) => rows.filter((row) => row.id !== saved.id))
    } catch (deleteError) {
      setSavedError(deleteError.message)
    } finally {
      setSavedBusy(false)
    }
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
          <div className="flex items-center gap-2">
            <select value={sort} onChange={(event) => changeFilter(setSort)(event.target.value)} aria-label="Sort Discover results" className="text-sm px-3 py-2 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
              {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {user && (
              <button type="button" onClick={() => setSaveOpen((open) => !open)} className="btn-secondary text-xs px-3 py-2 rounded-md whitespace-nowrap inline-flex items-center gap-1.5">
                <i className="icon-bookmark-plus text-xs"></i> Save search
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3 mt-6">
          <div className="relative w-full flex-1 min-w-0 sm:min-w-64 sm:max-w-md">
            <i className="icon-search text-sm absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }}></i>
            <input
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1) }}
              placeholder="Search titles, tickers, companies, analysts, sectors, or thesis text…"
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
          <select value={side} onChange={(event) => changeFilter(setSide)(event.target.value)} aria-label="Filter by thesis side" className="w-full sm:w-auto text-sm px-3 py-2 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <option value="all">Long &amp; short</option><option value="bull">Long only</option><option value="bear">Short only</option>
          </select>
          <select value={status} onChange={(event) => changeFilter(setStatus)(event.target.value)} aria-label="Filter by thesis status" className="w-full sm:w-auto text-sm px-3 py-2 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <option value="all">Active &amp; closed</option><option value="active">Active only</option><option value="closed">Closed only</option>
          </select>
          <select value={published} onChange={(event) => changeFilter(setPublished)(event.target.value)} aria-label="Filter by publication period" className="w-full sm:w-auto text-sm px-3 py-2 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <option value="all">Any publication date</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="1y">Last year</option>
          </select>
          <select value={performance} onChange={(event) => changeFilter(setPerformance)(event.target.value)} aria-label="Filter by performance" className="w-full sm:w-auto text-sm px-3 py-2 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <option value="all">Any return</option><option value="positive">Positive return</option><option value="negative">Negative return</option><option value="10plus">Return of 10%+</option>
          </select>
          {hasActiveFilters && <button type="button" onClick={resetFilters} className="text-xs px-2 py-2 hover:underline" style={{ color: 'var(--muted)', background: 'transparent' }}>Reset filters</button>}
          <span className="text-xs font-mono sm:ml-auto whitespace-nowrap" style={{ color: 'var(--muted)' }}>{pagination.totalItems} matching theses</span>
        </div>

        {user && saveOpen && (
          <div className="mt-4 p-4 border rounded-md flex flex-col gap-3 sm:flex-row sm:items-end" style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-warm)' }}>
            <label className="flex-1 text-xs">
              <span className="block font-medium mb-1">Saved search name</span>
              <input value={saveName} maxLength={80} onChange={(event) => setSaveName(event.target.value)} placeholder="e.g. Recent semiconductor shorts" className="w-full input-bordered rounded px-3 py-2 text-sm" />
            </label>
            <label className="flex items-center gap-2 text-xs py-2">
              <input type="checkbox" checked={saveNotifications} onChange={(event) => setSaveNotifications(event.target.checked)} />
              Notify me about new matches
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setSaveOpen(false); setSavedError('') }} className="btn-secondary text-xs px-3 py-2 rounded-md">Cancel</button>
              <button type="button" disabled={!saveName.trim() || savedBusy} onClick={saveCurrentSearch} className="btn-primary text-xs px-3 py-2 rounded-md">{savedBusy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}

        {user && savedSearches.length > 0 && (
          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1" aria-label="Saved searches">
            <span className="text-[10px] font-mono uppercase tracking-wider shrink-0" style={{ color: 'var(--muted)' }}>Saved</span>
            {savedSearches.map((saved) => (
              <div key={saved.id} className="inline-flex items-center border rounded-md shrink-0" style={{ borderColor: 'var(--border)', background: 'white' }}>
                <button type="button" onClick={() => applySavedSearch(saved)} className="text-xs px-3 py-1.5 hover:underline" style={{ background: 'transparent' }}>{saved.name}</button>
                <button type="button" disabled={savedBusy} onClick={() => updateSavedSearch(saved, { notifyEnabled: !saved.notifyEnabled })} className="toolbar-btn" title={saved.notifyEnabled ? 'Disable match notifications' : 'Enable match notifications'} aria-label={`${saved.notifyEnabled ? 'Disable' : 'Enable'} notifications for ${saved.name}`}><i className={`${saved.notifyEnabled ? 'icon-bell' : 'icon-bell-off'} text-[11px]`}></i></button>
                <button type="button" disabled={savedBusy} onClick={() => deleteSavedSearch(saved)} className="toolbar-btn" aria-label={`Delete ${saved.name}`}><i className="icon-x text-[11px]"></i></button>
              </div>
            ))}
          </div>
        )}
        {savedError && <p className="text-xs mt-3" style={{ color: 'var(--bear)' }}>{savedError}</p>}
      </header>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
        {error && (
          <div className="p-4 mb-5 border rounded-md text-sm" role="alert" style={{ borderColor: 'var(--bear)', color: 'var(--bear)' }}>{error}</div>
        )}
        {!loading && !error && feed.length === 0 && (
          <div className="p-6 border rounded-md text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <div className="font-serif text-lg font-medium">No theses match</div>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Try a broader search or reset one of the filters.</p>
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
                  <span className="flex items-center gap-3" style={{ color: 'var(--muted)' }}>
                    <span className="flex items-center gap-1" title="Thesis updates"><i className="icon-file-clock text-xs"></i> {thesis.updates || 0}</span>
                    <span className="flex items-center gap-1" title="Discussion comments"><i className="icon-message-square text-xs"></i> {thesis.commentCount || 0}</span>
                    <span className="flex items-center gap-1" title="Bookmarks"><i className="icon-bookmark text-xs"></i> {thesis.bookmarkCount || 0}</span>
                  </span>
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
