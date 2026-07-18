import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadDrafts } from '../lib/drafts.js'
import { createClient } from '../lib/supabase/client'
import { useUser } from './UserProvider.jsx'

const NAV_MAIN = [
  { view: 'dashboard', icon: 'icon-layout-dashboard', label: 'Dashboard' },
  { view: 'mytheses', icon: 'icon-file-text', label: 'My Theses' },
  { view: 'drafts', icon: 'icon-file-pen', label: 'Drafts' },
]

const NAV_COMMUNITY = [
  { view: 'leaderboard', icon: 'icon-trophy', label: 'Leaderboard' },
  { view: 'discover', icon: 'icon-compass', label: 'Discover' },
  { view: 'profile', icon: 'icon-user', label: 'Profile' },
]

export default function Sidebar({ view, navigate }) {
  const navClass = (v) => `nav-item ${view === v ? 'active' : ''} cursor-pointer flex items-center gap-2.5 py-1`

  const user = useUser()
  const router = useRouter()
  const signOut = async () => {
    await createClient().auth.signOut()
    router.refresh()
  }

  // Published theses from the store, refreshed on every navigation so a freshly
  // published thesis is reflected without a reload. Drives both the workspace count
  // and the watchlist below. Drafts come from localStorage.
  const [stored, setStored] = useState([])
  const [draftCount, setDraftCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch('/api/theses')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { if (!cancelled && Array.isArray(rows)) setStored(rows) })
      .catch(() => { /* store unavailable */ })
    setDraftCount(loadDrafts(user?.id).length)
    return () => { cancelled = true }
  }, [view, user?.id])

  const allTheses = useMemo(() => stored, [stored])
  const counts = { mytheses: allTheses.length, drafts: draftCount }

  // Live count of triggers needing attention (breached or approaching threshold)
  // across active theses — drives the badge on the Triggers nav item.
  const alertCount = useMemo(() => allTheses.reduce((n, t) => (
    t.status === 'closed' ? n : n + (t.triggers || []).filter((tr) => tr.s === 'breached' || tr.s === 'warning').length
  ), 0), [allTheses])

  // Watchlist = the tickers you hold an active thesis on, deduped and in
  // first-seen order.
  const watchlist = useMemo(() => {
    const seen = new Set()
    const list = []
    for (const t of allTheses) {
      if (t.status !== 'active' || !t.ticker || seen.has(t.ticker)) continue
      seen.add(t.ticker)
      list.push(t.ticker)
    }
    return list
  }, [allTheses])

  const [quotes, setQuotes] = useState({})
  const symbolsKey = watchlist.join(',')
  useEffect(() => {
    if (!symbolsKey) { setQuotes({}); return }
    let cancelled = false
    fetch(`/api/quotes?symbols=${symbolsKey}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return
        const map = {}
        rows.forEach((q) => { map[q.symbol] = q })
        setQuotes(map)
      })
      .catch(() => { /* leave percentages blank until the quote loads */ })
    return () => { cancelled = true }
  }, [symbolsKey])

  return (
    <aside className="w-60 border-r flex flex-col shrink-0 self-start sticky top-0 h-screen" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
      <div className="px-6 pt-7 pb-8">
        <div className="flex items-baseline gap-1">
          <span className="font-serif text-2xl font-medium tracking-tight" style={{ color: 'var(--ink)' }}>Theses</span>
          <span className="font-serif text-2xl" style={{ color: 'var(--bear)' }}>.</span>
        </div>
        <div className="text-[10px] font-mono mt-1 tracking-wider uppercase" style={{ color: 'var(--muted)' }}>v2.4 · Integrity Build</div>
      </div>

      <div className="px-4 mb-6">
        <button onClick={() => navigate('editor')} className="w-full btn-primary text-sm font-medium py-2.5 px-3 rounded-md flex items-center justify-center gap-2">
          <i className="icon-plus text-base"></i>
          <span>New Thesis</span>
        </button>
      </div>

      <nav className="px-6 flex-1 min-h-0 overflow-y-auto">
        <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--faint)' }}>Workspace</div>
        <ul className="space-y-1.5 text-sm">
          {NAV_MAIN.map(n => (
            <li key={n.view}>
              <a onClick={() => navigate(n.view)} className={navClass(n.view)} style={{ color: 'var(--ink-soft)' }}>
                <i className={`${n.icon} text-[15px]`}></i> {n.label}
                {counts[n.view] != null && <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--ink-soft)' }}>{counts[n.view]}</span>}
              </a>
            </li>
          ))}
          <li>
            <a onClick={() => navigate('triggers')} className={navClass('triggers')} style={{ color: 'var(--ink-soft)' }}>
              <i className="icon-bell text-[15px]"></i> Triggers
              {alertCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center w-4 h-4 text-[9px] font-mono" style={{ background: 'var(--bear)', color: 'white', borderRadius: '2px' }}>{alertCount}</span>
              )}
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
        {watchlist.length === 0 ? (
          <p className="text-[11px]" style={{ color: 'var(--faint)' }}>No active theses yet.</p>
        ) : (
          <ul className="space-y-1.5 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            {watchlist.map((symbol) => {
              const pct = quotes[symbol]?.changePercent
              const cls = pct == null ? '' : pct >= 0 ? 'ret-pos' : 'ret-neg'
              const sign = pct == null ? '' : pct >= 0 ? '+' : '−'
              return (
                <li key={symbol} className="flex items-center justify-between">
                  <span className="font-mono">{symbol}</span>
                  <span className={`num-mono text-[11px] ${cls}`}>
                    {pct == null ? '—' : `${sign}${Math.abs(pct).toFixed(1)}%`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-semibold" style={{ background: 'var(--ink)', color: 'white' }}>{user?.avatar || '—'}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.name || 'You'}</div>
            <div className="text-[11px] font-mono truncate" style={{ color: 'var(--muted)' }}>{user?.handle || ''} · {allTheses.length} theses</div>
          </div>
          <button className="toolbar-btn" onClick={signOut} title="Sign out"><i className="icon-log-out text-sm"></i></button>
        </div>
      </div>
    </aside>
  )
}
