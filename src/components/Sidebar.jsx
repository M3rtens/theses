import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../lib/supabase/client'
import { useData } from './DataProvider.jsx'
import { useUser } from './UserProvider.jsx'

const NAV_MAIN = [
  { view: 'dashboard', icon: 'icon-layout-dashboard', label: 'Dashboard' },
  { view: 'mytheses', icon: 'icon-file-text', label: 'My Theses' },
  { view: 'drafts', icon: 'icon-file-pen', label: 'Drafts' },
  { view: 'notifications', icon: 'icon-inbox', label: 'Notifications' },
  { view: 'saved', icon: 'icon-bookmark', label: 'Saved' },
]

const NAV_COMMUNITY = [
  { view: 'leaderboard', icon: 'icon-trophy', label: 'Leaderboard' },
  { view: 'discover', icon: 'icon-compass', label: 'Discover' },
  { view: 'profile', icon: 'icon-user', label: 'Profile' },
]

export default function Sidebar({ view, navigate }) {
  const navClass = (target) => `nav-item ${view === target ? 'active' : ''} cursor-pointer flex items-center gap-2.5 py-1`
  const user = useUser()
  const { stored, drafts, scheduled, notifications, social } = useData()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const signOut = async () => {
    setMobileOpen(false)
    await createClient().auth.signOut()
    router.replace('/')
    router.refresh()
  }

  useEffect(() => {
    setMobileOpen(false)
  }, [view])

  useEffect(() => {
    document.body.classList.toggle('mobile-menu-open', mobileOpen)
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    if (mobileOpen) document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('mobile-menu-open')
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileOpen])

  const allTheses = useMemo(() => stored, [stored])
  const unreadCount = notifications.filter((notification) => !notification.readAt).length
  const counts = {
    mytheses: allTheses.length,
    drafts: drafts.length + scheduled.length,
    notifications: unreadCount,
    saved: (social.following?.length || 0) + (social.bookmarks?.length || 0),
  }
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

  const go = (target) => {
    setMobileOpen(false)
    navigate(target)
  }

  const sidebarContent = (mobile = false) => (
    <>
      <div className="px-6 pt-7 pb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="font-serif text-2xl font-medium tracking-tight" style={{ color: 'var(--ink)' }}>Theses</span>
              <span className="font-serif text-2xl" style={{ color: 'var(--bear)' }}>.</span>
            </div>
            <div className="text-[10px] font-mono mt-1 tracking-wider uppercase" style={{ color: 'var(--muted)' }}>v2.4</div>
          </div>
          {mobile && (
            <button type="button" className="mobile-nav-icon" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
              <i className="icon-x text-lg"></i>
            </button>
          )}
        </div>
      </div>

      {user && (
        <div className="px-4 mb-6">
          <button type="button" onClick={() => go('editor')} className="w-full btn-primary text-sm font-medium py-2.5 px-3 rounded-md flex items-center justify-center gap-2">
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
                  <button type="button" onClick={() => go(item.view)} className={`${navClass(item.view)} w-full text-left`} style={{ color: 'var(--ink-soft)' }}>
                    <i className={`${item.icon} text-[15px]`}></i> {item.label}
                    {counts[item.view] != null && <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--ink-soft)' }}>{counts[item.view]}</span>}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => go('triggers')} className={`${navClass('triggers')} w-full text-left`} style={{ color: 'var(--ink-soft)' }}>
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
              <button type="button" onClick={() => go(item.view)} className={`${navClass(item.view)} w-full text-left`} style={{ color: 'var(--ink-soft)' }}>
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
            onClick={() => {
              setMobileOpen(false)
              router.push('/sign-in')
            }}
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
    </>
  )

  return (
    <>
      <header className="mobile-app-bar md:hidden">
        <button
          type="button"
          className="mobile-nav-icon"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
        >
          <i className="icon-menu text-lg"></i>
        </button>
        <button type="button" className="mobile-wordmark" onClick={() => go(user ? 'dashboard' : 'discover')} aria-label="Go to home">
          <span className="font-serif text-xl font-medium tracking-tight">Theses</span>
          <span className="font-serif text-xl" style={{ color: 'var(--bear)' }}>.</span>
        </button>
        {user ? (
          <button type="button" className="mobile-nav-icon" onClick={() => go('editor')} aria-label="Create a new thesis">
            <i className="icon-plus text-lg"></i>
          </button>
        ) : (
          <button type="button" className="mobile-nav-icon" onClick={() => router.push('/sign-in')} aria-label="Sign in">
            <i className="icon-log-in text-base"></i>
          </button>
        )}
      </header>

      <button
        type="button"
        className={`mobile-nav-backdrop md:hidden ${mobileOpen ? 'open' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-label="Close navigation"
        tabIndex={mobileOpen ? 0 : -1}
      />
      <aside
        id="mobile-navigation"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
        className={`mobile-nav-drawer md:hidden ${mobileOpen ? 'open' : ''}`}
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
      >
        {sidebarContent(true)}
      </aside>

      <aside className="hidden w-60 border-r md:flex flex-col shrink-0 self-start sticky top-0 h-screen" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
        {sidebarContent(false)}
      </aside>
    </>
  )
}
