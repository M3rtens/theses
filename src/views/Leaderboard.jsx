import { useState } from 'react'
import { useLeaderboard } from '../lib/useLeaderboard.js'

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

const SECTOR_FILTERS = ['All Sectors', 'Tech', 'Energy', 'Financials', 'Healthcare', 'Consumer']

const SECTOR_BY_TICKER = {
  NVDA: 'Tech', MRNA: 'Healthcare', TSLA: 'Consumer', LLY: 'Healthcare', XOM: 'Energy',
  AMD: 'Tech', V: 'Financials', SHOP: 'Tech', OXY: 'Energy', META: 'Tech',
  COST: 'Consumer', UBER: 'Tech', ENPH: 'Energy', JPM: 'Financials',
}

export default function Leaderboard() {
  const [sideFilter, setSideFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [sectorFilter, setSectorFilter] = useState('All Sectors')

  // Ranked analysts computed from the database (all users' stored theses).
  const board = useLeaderboard()

  const filteredData = board.filter((analyst) => {
    const side = analyst.best.includes('Short') ? 'bear' : 'bull'
    const ticker = analyst.best.split(' · ')[0]
    const sector = SECTOR_BY_TICKER[ticker] || 'Other'
    const holdDays = Number.parseInt(analyst.avgHold, 10)

    if (sideFilter !== 'all' && side !== sideFilter) return false
    if (sectorFilter !== 'All Sectors' && sector !== sectorFilter) return false
    if (periodFilter === 'lt30' && holdDays >= 30) return false
    if (periodFilter === '30to90' && (holdDays < 30 || holdDays >= 90)) return false
    if (periodFilter === '90plus' && holdDays < 90) return false
    return true
  })

  const filterClass = (active) => `lb-filter ${active ? 'active' : ''} text-xs px-3 py-1 rounded`

  return (
    <>
      <header className="px-12 pt-8 pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Integrity-Protected Rankings</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">Leaderboard</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Rankings based on system-locked entry timestamps. No deletions. No backdating. No edits to thesis bodies.</p>
          </div>
          <div className="seal"><i className="icon-fingerprint text-[11px]"></i> Verified by Theses Protocol</div>
        </div>

        <div className="flex items-center flex-wrap gap-2 mt-6">
          <div className="flex items-center gap-1 p-1 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            {SIDE_FILTERS.map((filter) => (
              <button key={filter.value} type="button" aria-pressed={sideFilter === filter.value} onClick={() => setSideFilter(filter.value)} className={filterClass(sideFilter === filter.value)}>{filter.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 p-1 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            {PERIOD_FILTERS.map((filter) => (
              <button key={filter.value} type="button" aria-pressed={periodFilter === filter.value} onClick={() => setPeriodFilter(filter.value)} className={filterClass(periodFilter === filter.value)}>{filter.label}</button>
            ))}
          </div>
          <div className="flex items-center flex-wrap gap-1 p-1 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            {SECTOR_FILTERS.map((sector) => (
              <button key={sector} type="button" aria-pressed={sectorFilter === sector} onClick={() => setSectorFilter(sector)} className={filterClass(sectorFilter === sector)}>{sector}</button>
            ))}
          </div>
          <div className="ml-auto text-xs font-mono" style={{ color: 'var(--muted)' }}>{filteredData.length} displayed · {board.length} analyst{board.length === 1 ? '' : 's'}</div>
        </div>
      </header>

      <div className="px-12 py-6">
        <div className="border rounded-md overflow-hidden" style={{ borderColor: 'var(--border)', background: 'white' }}>
          <table className="w-full">
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
              {filteredData.map((u, index) => {
                const retClass = u.avgReturn >= 0 ? 'ret-pos' : 'ret-neg'
                const sign = u.avgReturn >= 0 ? '+' : '−'
                const displayedRank = index + 1
                const isTop3 = displayedRank <= 3
                return (
                  <tr key={u.userId} className="lb-row border-b last:border-b-0" style={{ borderColor: 'var(--border)', ...(u.isYou ? { background: 'var(--bg-warm)' } : {}) }}>
                    <td className="px-4 py-3.5">
                      {isTop3
                        ? <span className="font-serif text-lg font-medium">{displayedRank}</span>
                        : <span className="font-mono text-sm">{displayedRank}</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-mono text-xs font-semibold" style={{ background: u.isYou ? 'var(--ink)' : 'var(--bg-warm)', color: u.isYou ? 'white' : 'var(--ink)', border: `1px solid ${u.isYou ? 'var(--ink)' : 'var(--border)'}` }}>{u.avatar}</div>
                        <div>
                          <div className="text-sm font-medium">{u.name}{u.isYou && <span className="text-[9px] font-mono px-1.5 py-0.5 ml-2 rounded" style={{ background: 'var(--ink)', color: 'white' }}>YOU</span>}</div>
                          <div className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>{u.handle}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-sm">{u.theses}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-sm">{u.winRate}%</td>
                    <td className={`px-4 py-3.5 text-right font-mono text-sm font-semibold ${retClass}`}>{sign}{Math.abs(u.avgReturn).toFixed(1)}%</td>
                    <td className={`px-4 py-3.5 text-right font-mono text-sm ${retClass}`}>{sign}{Math.abs(u.annualized).toFixed(1)}%</td>
                    <td className="px-4 py-3.5 text-right font-mono text-sm" style={{ color: 'var(--ink-soft)' }}>{u.avgHold}</td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{u.best}</div>
                    </td>
                  </tr>
                )
              })}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="font-serif text-lg font-medium">No analysts match these filters</div>
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Try a different side, period, or sector.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-6 text-xs" style={{ color: 'var(--muted)' }}>
          <span>{filteredData.length ? `Showing 1–${filteredData.length} of ${filteredData.length} matching analysts` : 'Showing 0 matching analysts'}</span>
          <div className="leaderboard-pagination flex items-center gap-2">
            <button type="button" disabled className="px-2 py-1 border rounded" style={{ borderColor: 'var(--border)' }}>Previous</button>
            <span className="font-mono">Page 1 of 1</span>
            <button type="button" disabled className="px-2 py-1 border rounded" style={{ borderColor: 'var(--border)' }}>Next</button>
          </div>
        </div>
      </div>
    </>
  )
}
