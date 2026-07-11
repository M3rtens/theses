import { useState } from 'react'
import { leaderboardData } from '../data/theses.js'

export default function Leaderboard({ navigate }) {
  const [sideFilter, setSideFilter] = useState('all')

  return (
    <>
      <header className="px-12 pt-8 pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Integrity-Protected Rankings</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">Leaderboard</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>Rankings based on system-locked entry timestamps. No deletions. No backdating. No edits to thesis bodies.</p>
          </div>
          <div className="seal"><i className="lucide-fingerprint text-[11px]"></i> Verified by Theses Protocol</div>
        </div>

        <div className="flex items-center gap-2 mt-6">
          <div className="flex items-center gap-1 p-1 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <button onClick={() => setSideFilter('all')} className={`lb-filter ${sideFilter === 'all' ? 'active' : ''} text-xs px-3 py-1 rounded`}>All</button>
            <button onClick={() => setSideFilter('bull')} className={`lb-filter ${sideFilter === 'bull' ? 'active' : ''} text-xs px-3 py-1 rounded`}>Long only</button>
            <button onClick={() => setSideFilter('bear')} className={`lb-filter ${sideFilter === 'bear' ? 'active' : ''} text-xs px-3 py-1 rounded`}>Short only</button>
          </div>
          <div className="flex items-center gap-1 p-1 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <button className="lb-filter active text-xs px-3 py-1 rounded">All Periods</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">&lt; 30d</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">30–90d</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">90d+</button>
          </div>
          <div className="flex items-center gap-1 p-1 border rounded-md" style={{ borderColor: 'var(--border)', background: 'white' }}>
            <button className="lb-filter active text-xs px-3 py-1 rounded">All Sectors</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">Tech</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">Energy</button>
            <button className="lb-filter text-xs px-3 py-1 rounded">Financials</button>
          </div>
          <div className="ml-auto text-xs font-mono" style={{ color: 'var(--muted)' }}>2,841 analysts · Updated 16:32 EST</div>
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
              {leaderboardData.map(u => {
                const retClass = u.avgReturn >= 0 ? 'ret-pos' : 'ret-neg'
                const sign = u.avgReturn >= 0 ? '+' : '−'
                const isTop3 = u.rank <= 3
                return (
                  <tr key={u.rank} className="lb-row border-b last:border-b-0 cursor-pointer" style={{ borderColor: 'var(--border)', ...(u.isYou ? { background: 'var(--bg-warm)' } : {}) }} onClick={() => navigate('profile')}>
                    <td className="px-4 py-3.5">
                      {isTop3
                        ? <span className="font-serif text-lg font-medium">{u.rank}</span>
                        : <span className="font-mono text-sm">{u.rank}</span>}
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
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-6 text-xs" style={{ color: 'var(--muted)' }}>
          <span>Showing 1–15 of 2,841 analysts</span>
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 border rounded" style={{ borderColor: 'var(--border)' }}>Previous</button>
            <span className="font-mono">Page 1 of 190</span>
            <button className="px-2 py-1 border rounded" style={{ borderColor: 'var(--border)' }}>Next</button>
          </div>
        </div>
      </div>
    </>
  )
}
