import { useEffect, useState } from 'react'

const WATCHLIST = [
  { symbol: 'ASML', fallback: 15.1 },
  { symbol: 'CRM', fallback: -8.4 },
  { symbol: 'CRWD', fallback: 22.7 },
  { symbol: 'CVX', fallback: 6.2 },
]

const NAV_MAIN = [
  { view: 'dashboard', icon: 'lucide-layout-dashboard', label: 'Dashboard' },
  { view: 'mytheses', icon: 'lucide-file-text', label: 'My Theses', count: '12' },
  { view: 'drafts', icon: 'lucide-file-edit', label: 'Drafts', count: '3' },
]

const NAV_COMMUNITY = [
  { view: 'leaderboard', icon: 'lucide-trophy', label: 'Leaderboard' },
  { view: 'discover', icon: 'lucide-compass', label: 'Discover' },
  { view: 'profile', icon: 'lucide-user', label: 'Profile' },
]

export default function Sidebar({ view, navigate }) {
  const navClass = (v) => `nav-item ${view === v ? 'active' : ''} cursor-pointer flex items-center gap-2.5 py-1`

  const [quotes, setQuotes] = useState({})
  useEffect(() => {
    let cancelled = false
    const symbols = WATCHLIST.map((w) => w.symbol).join(',')
    fetch(`/api/quotes?symbols=${symbols}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return
        const map = {}
        rows.forEach((q) => { map[q.symbol] = q })
        setQuotes(map)
      })
      .catch(() => { /* keep fallback values */ })
    return () => { cancelled = true }
  }, [])

  return (
    <aside className="w-60 border-r flex flex-col shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
      <div className="px-6 pt-7 pb-8">
        <div className="flex items-baseline gap-1">
          <span className="font-serif text-2xl font-medium tracking-tight" style={{ color: 'var(--ink)' }}>Theses</span>
          <span className="font-serif text-2xl" style={{ color: 'var(--bear)' }}>.</span>
        </div>
        <div className="text-[10px] font-mono mt-1 tracking-wider uppercase" style={{ color: 'var(--muted)' }}>v2.4 · Integrity Build</div>
      </div>

      <div className="px-4 mb-6">
        <button onClick={() => navigate('editor')} className="w-full btn-primary text-sm font-medium py-2.5 px-3 rounded-md flex items-center justify-center gap-2">
          <i className="lucide-plus text-base"></i>
          <span>New Thesis</span>
        </button>
      </div>

      <nav className="px-6 flex-1">
        <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--faint)' }}>Workspace</div>
        <ul className="space-y-1.5 text-sm">
          {NAV_MAIN.map(n => (
            <li key={n.view}>
              <a onClick={() => navigate(n.view)} className={navClass(n.view)} style={{ color: 'var(--ink-soft)' }}>
                <i className={`${n.icon} text-[15px]`}></i> {n.label}
                {n.count && <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--faint)' }}>{n.count}</span>}
              </a>
            </li>
          ))}
          <li>
            <a onClick={() => navigate('triggers')} className={navClass('triggers')} style={{ color: 'var(--ink-soft)' }}>
              <i className="lucide-bell text-[15px]"></i> Triggers
              <span className="ml-auto inline-flex items-center justify-center w-4 h-4 text-[9px] font-mono" style={{ background: 'var(--bear)', color: 'white', borderRadius: '2px' }}>2</span>
            </a>
          </li>
        </ul>

        <div className="text-[10px] font-mono uppercase tracking-wider mb-3 mt-7" style={{ color: 'var(--faint)' }}>Community</div>
        <ul className="space-y-1.5 text-sm">
          {NAV_COMMUNITY.map(n => (
            <li key={n.view}>
              <a onClick={() => navigate(n.view)} className={navClass(n.view)} style={{ color: 'var(--ink-soft)' }}>
                <i className={`${n.icon} text-[15px]`}></i> {n.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="text-[10px] font-mono uppercase tracking-wider mb-3 mt-7" style={{ color: 'var(--faint)' }}>Watchlist</div>
        <ul className="space-y-1.5 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
          {WATCHLIST.map((w) => {
            const pct = quotes[w.symbol]?.changePercent
            const val = pct == null ? w.fallback : pct
            const cls = val >= 0 ? 'ret-pos' : 'ret-neg'
            const sign = val >= 0 ? '+' : '−'
            return (
              <li key={w.symbol} className="flex items-center justify-between">
                <span className="font-mono">{w.symbol}</span>
                <span className={`num-mono text-[11px] ${cls}`}>{sign}{Math.abs(val).toFixed(1)}%</span>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-semibold" style={{ background: 'var(--ink)', color: 'white' }}>EV</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">Elena Vance</div>
            <div className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>@evance · 12 theses</div>
          </div>
          <button className="toolbar-btn"><i className="lucide-settings text-sm"></i></button>
        </div>
      </div>
    </aside>
  )
}
