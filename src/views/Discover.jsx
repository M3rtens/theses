import { useMemo, useState } from 'react'
import { useDiscoverFeed } from '../lib/useDiscoverFeed.js'
import { SECTORS } from '../lib/sectors.js'

export default function Discover({ navigate }) {
  // Every published thesis across the community, loaded from the database.
  const feed = useDiscoverFeed()

  // Title search and sector filter over the community feed.
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState('all')
  // Sort mode: 'trending' | 'newest' | 'top'.
  const [sort, setSort] = useState('trending')

  // Offer the full canonical sector list, plus any sector present in the feed
  // that isn't already in it, so nothing is unfilterable.
  const sectors = useMemo(
    () => [...new Set([...SECTORS, ...feed.map((t) => t.sector).filter(Boolean)])].sort(),
    [feed],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = feed.filter((t) => {
      if (sector !== 'all' && t.sector !== sector) return false
      if (q && !t.title.toLowerCase().includes(q)) return false
      return true
    })

    // Age in days since publish; unknown timestamps sort as oldest.
    const ageDays = (t) => {
      const ts = t.createdAt ? Date.parse(t.createdAt) : NaN
      return Number.isNaN(ts) ? Infinity : (Date.now() - ts) / 86400000
    }
    // Newest first, by publish timestamp (id as a stable tiebreak).
    const byNewest = (a, b) => ageDays(a) - ageDays(b) || (b.id ?? 0) - (a.id ?? 0)
    // Trending blends engagement with recency: each update is worth points, and
    // theses published in the last ~30 days carry a decaying recency bonus.
    const trendScore = (t) => (Number(t.updates) || 0) * 5 + Math.max(0, 30 - ageDays(t))

    const cmp = {
      newest: byNewest,
      top: (a, b) => (b.ret ?? 0) - (a.ret ?? 0) || byNewest(a, b),
      trending: (a, b) => trendScore(b) - trendScore(a) || byNewest(a, b),
    }[sort]

    return [...filtered].sort(cmp)
  }, [feed, query, sector, sort])

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
            <button type="button" aria-pressed={sort === 'trending'} onClick={() => setSort('trending')} className={`lb-filter whitespace-nowrap text-xs px-3 py-1 rounded ${sort === 'trending' ? 'active' : ''}`}>Trending</button>
            <button type="button" aria-pressed={sort === 'newest'} onClick={() => setSort('newest')} className={`lb-filter whitespace-nowrap text-xs px-3 py-1 rounded ${sort === 'newest' ? 'active' : ''}`}>Newest</button>
            <button type="button" aria-pressed={sort === 'top'} onClick={() => setSort('top')} className={`lb-filter whitespace-nowrap text-xs px-3 py-1 rounded ${sort === 'top' ? 'active' : ''}`}>Top Performers</button>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3 mt-6">
          <div className="relative w-full flex-1 min-w-0 sm:min-w-64 sm:max-w-md">
            <i className="icon-search text-sm absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }}></i>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search theses by title…"
              className="w-full text-sm pl-9 pr-3 py-2 border rounded-md"
              style={{ borderColor: 'var(--border)', background: 'white', color: 'var(--ink)' }}
            />
          </div>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            aria-label="Filter by security type"
            className="w-full sm:w-auto text-sm px-3 py-2 border rounded-md"
            style={{ borderColor: 'var(--border)', background: 'white', color: 'var(--ink)' }}
          >
            <option value="all">All securities</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="text-xs font-mono sm:ml-auto" style={{ color: 'var(--muted)' }}>{results.length} of {feed.length}</span>
        </div>
      </header>

      <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
        {results.length === 0 && (
          <div className="p-6 border rounded-md text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <div className="font-serif text-lg font-medium">No theses match</div>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Try a different title search or security type.</p>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {results.map((t, i) => {
            const retClass = t.ret >= 0 ? 'ret-pos' : 'ret-neg'
            const sign = t.ret >= 0 ? '+' : '−'
            const sideClass = t.side === 'bull' ? 'side-bull' : 'side-bear'
            const sideLabel = t.side === 'bull' ? 'BULL' : 'BEAR'
            const initials = t.author.split(' ').map(n => n[0]).join('')
            return (
              <div key={t.id ?? i} className="thesis-card rounded-md p-4 sm:p-6 cursor-pointer flex flex-col" onClick={() => navigate('thesis', t)}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[10px] font-semibold" style={{ background: 'var(--bg-warm)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
                      {initials}
                    </div>
                    <div>
                      <div className="text-xs font-medium">{t.author}</div>
                      <div className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{t.handle ? `${t.handle} · ` : ''}{t.date}</div>
                    </div>
                  </div>
                  <span className={`${sideClass} text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded`}>{sideLabel}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-mono text-sm font-semibold">{t.ticker}</span>
                  {t.sector && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-warm)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{t.sector}</span>}
                  <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>·</span>
                  <span className={`font-mono text-sm font-semibold ${retClass}`}>{sign}{Math.abs(t.ret).toFixed(1)}%</span>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>since publish</span>
                </div>

                <h3 className="font-serif text-xl font-medium mb-2 leading-snug">{t.title}</h3>
                <p className="text-sm leading-relaxed mb-5 flex-1" style={{ color: 'var(--ink-soft)' }}>{t.snippet}</p>

                <div className="pt-4 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3" style={{ color: 'var(--muted)' }}>
                    <span className="flex items-center gap-1"><i className="icon-message-square text-xs"></i> {t.updates || 0}</span>
                  </div>
                  <span className="font-medium">Read thesis →</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
