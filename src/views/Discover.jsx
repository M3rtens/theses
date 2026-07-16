import { useMemo, useState } from 'react'
import { sampleDiscover } from '../data/theses.js'

export default function Discover({ navigate }) {
  // Title search and security-type (sector) filter over the community feed.
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState('all')

  const sectors = useMemo(
    () => [...new Set(sampleDiscover.map((t) => t.sector).filter(Boolean))].sort(),
    [],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sampleDiscover.filter((t) => {
      if (sector !== 'all' && t.sector !== sector) return false
      if (q && !t.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [query, sector])

  return (
    <>
      <header className="px-12 pt-8 pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Community Feed</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">Discover</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Recent theses published by the community. Performance is tracked from publish time.</p>
          </div>
          <div className="flex items-center gap-1 p-1 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <button className="lb-filter active text-xs px-3 py-1 rounded">Trending</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">Newest</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">Top Performers</button>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3 mt-6">
          <div className="relative flex-1 min-w-64 max-w-md">
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
            className="text-sm px-3 py-2 border rounded-md"
            style={{ borderColor: 'var(--border)', background: 'white', color: 'var(--ink)' }}
          >
            <option value="all">All securities</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="text-xs font-mono ml-auto" style={{ color: 'var(--muted)' }}>{results.length} of {sampleDiscover.length}</span>
        </div>
      </header>

      <div className="px-12 py-8">
        {results.length === 0 && (
          <div className="p-6 border rounded-md text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <div className="font-serif text-lg font-medium">No theses match</div>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Try a different title search or security type.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-6">
          {results.map((t, i) => {
            const retClass = t.ret >= 0 ? 'ret-pos' : 'ret-neg'
            const sign = t.ret >= 0 ? '+' : '−'
            const sideClass = t.side === 'bull' ? 'side-bull' : 'side-bear'
            const sideLabel = t.side === 'bull' ? 'BULL' : 'BEAR'
            const initials = t.author.split(' ').map(n => n[0]).join('')
            return (
              <div key={i} className="thesis-card rounded-md p-6 cursor-pointer flex flex-col" onClick={() => navigate('thesis')}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[10px] font-semibold" style={{ background: 'var(--bg-warm)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
                      {initials}
                    </div>
                    <div>
                      <div className="text-xs font-medium">{t.author}</div>
                      <div className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>{t.handle} · {t.date}</div>
                    </div>
                  </div>
                  <span className={`${sideClass} text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded`}>{sideLabel}</span>
                </div>

                <div className="flex items-center gap-2 mb-2">
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
                    <span className="flex items-center gap-1"><i className="icon-eye text-xs"></i> 1.2k</span>
                    <span className="flex items-center gap-1"><i className="icon-message-square text-xs"></i> 48</span>
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
