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
  const navClass = (target) => `nav-item ${view === target ? 'active' : ''} cursor-pointer flex items-center gap-2.5 py-1`
  const user = useUser()
  const router = useRouter()

  const signOut = async () => {
    await createClient().auth.signOut()
    router.replace('/')
    router.refresh()
  }

  // Owner-scoped workspace data is never requested for guests.
  const [stored, setStored] = useState([])
  const [draftCount, setDraftCount] = useState(0)
  useEffect(() => {
    if (!user?.id) {
      setStored([])
      setDraftCount(0)
      return
    }

    let cancelled = false
    fetch('/api/theses')
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (!cancelled && Array.isArray(rows)) setStored(rows)
      })
      .catch(() => { /* store unavailable */ })
    setDraftCount(loadDrafts(user.id).length)
    return () => { cancelled = true }
  }, [view, user?.id])

  const allTheses = useMemo(() => stored, [stored])
  const counts = { mytheses: allTheses.length, drafts: draftCount }
  const alertCount = useMemo(() => allTheses.reduce((count, thesis) => (
    thesis.status === 'closed'
      ? count
      : count + (thesis.triggers || []).filter((trigger) => trigger.s === 'breached' || trigger.s === 'warning').length
  ), 0), [allTheses])

  const watchlist = useMemo(() => {
    const seen = new Set()
    const list = []
    for (const thesis of allTheses) {
      if (thesis.status !== 'active' || !thesis.ticker || seen.has(thesis.ticker)) continue
      seen.add(thesis.ticker)
      list.push(thesis.ticker)
    }
    return list
  }, [allTheses])

  const [quotes, setQuotes] = useState({})
  const symbolsKey = watchlist.join(',')
  useEffect(() => {
    if (!symbolsKey) {
      setQuotes({})
      return
    }

    let cancelled = false
    fetch(`/api/quotes?symbols=${symbolsKey}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return
        const map = {}
        rows.forEach((quote) => { map[quote.symbol] = quote })
        setQuotes(map)
      })
      .catch(() => { /* leave percentages blank until the quote loads */ })
    return () => { cancelled = true }
  }, [symbolsKey])

  const communityNav = user
    ? NAV_COMMUNITY
    : NAV_COMMUNITY.filter((item) => item.view !== 'profile')

  return (
    <aside className="w-60 border-r flex flex-col shrink-0 self-start sticky top-0 h-screen" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
      <div className="px-6 pt-7 pb-8">
        <div className="flex items-baseline gap-1">
          <span className="font-serif text-2xl font-medium tracking-tight" style={{ color: 'var(--ink)' }}>Theses</span>
          <span className="font-serif text-2xl" style={{ color: 'var(--bear)' }}>.</span>
        </div>
        <div className="text-[10px] font-mono mt-1 tracking-wider uppercase" style={{ color: 'var(--muted)' }}>v2.4</div>
      </div>

      {user && (
        <div className="px-4 mb-6">
          <button type="button" onClick={() => navigate('editor')} className="w-full btn-primary text-sm font-medium py-2.5 px-3 rounded-md flex items-center justify-center gap-2">
            <i className="icon-plus text-base"></i>
            <span>New Thesis</span>
          </button>
        </div>
      )}

      <nav className="px-6 flex-1 min-h-0 overflow-y-auto">
        {user && (
          <>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--faint)' }}>Workspace</div>
            <ul className="space-y-1.5 text-sm">
              {NAV_MAIN.map((item) => (
                <li key={item.view}>
                  <button type="button" onClick={() => navigate(item.view)} className={`${navClass(item.view)} w-full text-left`} style={{ color: 'var(--ink-soft)' }}>
                    <i className={`${item.icon} text-[15px]`}></i> {item.label}
                    {counts[item.view] != null && <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--ink-soft)' }}>{counts[item.view]}</span>}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => navigate('triggers')} className={`${navClass('triggers')} w-full text-left`} style={{ color: 'var(--ink-soft)' }}>
                  <i className="icon-bell text-[15px]"></i> Triggers
                  {alertCount > 0 && (
                    <span className="ml-auto inline-flex items-center justify-center w-4 h-4 text-[9px] font-mono" style={{ background: 'var(--bear)', color: 'white', borderRadius: '2px' }}>{alertCount}</span>
                  )}
                </button>
              </li>
            </ul>
          </>
        )}

        <div className={`text-[10px] font-mono uppercase tracking-wider mb-3 ${user ? 'mt-7' : ''}`} style={{ color: 'var(--faint)' }}>{user ? 'Community' : 'Explore'}</div>
        <ul className="space-y-1.5 text-sm">
          {communityNav.map((item) => (
            <li key={item.view}>
              <button type="button" onClick={() => navigate(item.view)} className={`${navClass(item.view)} w-full text-left`} style={{ color: 'var(--ink-soft)' }}>
                <i className={`${item.icon} text-[15px]`}></i> {item.label}
              </button>
            </li>
          ))}
        </ul>

        {user && (
          <>
            <div className="text-[10px] font-mono uppercase tracking-wider mb-3 mt-7" style={{ color: 'var(--faint)' }}>Watchlist</div>
            {watchlist.length === 0 ? (
              <p className="text-[11px]" style={{ color: 'var(--faint)' }}>No active theses yet.</p>
            ) : (
              <ul className="space-y-1.5 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                {watchlist.map((symbol) => {
                  const percentage = quotes[symbol]?.changePercent
                  const returnClass = percentage == null ? '' : percentage >= 0 ? 'ret-pos' : 'ret-neg'
                  const sign = percentage == null ? '' : percentage >= 0 ? '+' : '−'
                  return (
                    <li key={symbol} className="flex items-center justify-between">
                      <span className="font-mono">{symbol}</span>
                      <span className={`num-mono text-[11px] ${returnClass}`}>
                        {percentage == null ? '—' : `${sign}${Math.abs(percentage).toFixed(1)}%`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </nav>

      <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
        {user ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-semibold" style={{ background: 'var(--ink)', color: 'white' }}>{user.avatar || '—'}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user.name || 'You'}</div>
              <div className="text-[11px] font-mono truncate" style={{ color: 'var(--muted)' }}>{user.handle || ''} · {allTheses.length} theses</div>
            </div>
            <button type="button" className="toolbar-btn" onClick={signOut} title="Sign out" aria-label="Sign out"><i className="icon-log-out text-sm"></i></button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => router.push('/sign-in')}
            className="w-full flex items-center gap-3 p-2 rounded-md text-left hover:bg-gray-50"
            style={{ color: 'var(--ink)', cursor: 'pointer' }}
          >
            <span className="w-8 h-8 rounded-full border flex items-center justify-center" style={{ borderColor: 'var(--border-strong)', background: 'white' }}>
              <i className="icon-log-in text-sm"></i>
            </span>
            <span>
              <span className="block text-sm font-medium">Sign in</span>
              <span className="block text-[10px] font-mono" style={{ color: 'var(--muted)' }}>Publish and track theses</span>
            </span>
          </button>
        )}
      </div>
    </aside>
  )
}
