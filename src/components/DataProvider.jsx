'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useUser } from './UserProvider.jsx'

// Single client-side cache for every shared dataset in the app. It loads all
// data once when the app boots and holds it above the view switch, so navigating
// between tabs reads from memory instead of refetching. Live prices additionally
// poll in the background so quotes stay current without a page reload.
//
// The per-view data hooks (useStoredTheses, useLeaderboard, useDiscoverFeed,
// useLiveTheses) are thin readers of this context — views consume them unchanged.

const DataContext = createContext(null)

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within a DataProvider')
  return ctx
}

// How often to re-fetch live prices while the app is open.
const LIVE_POLL_MS = 60000

// Turn a raw /api/cards response into the ticker→{currency,entry,current,ret}
// map the views expect. Return is side-adjusted so a bear thesis gains when the
// price falls. (Lifted verbatim from the old useLiveTheses.)
function toLiveMap(rows, theses) {
  const bySide = Object.fromEntries(theses.map((t) => [t.ticker, t.side]))
  const map = {}
  if (!Array.isArray(rows)) return map
  rows.forEach((q) => {
    if (!q || q.error || q.priceReturn == null) return
    const ret = bySide[q.symbol] === 'bear' ? -q.priceReturn : q.priceReturn
    map[q.symbol] = {
      currency: q.currency,
      entry: q.entry,
      current: q.current,
      ret: Number(ret.toFixed(1)),
    }
  })
  return map
}

export default function DataProvider({ children }) {
  const user = useUser()
  const userId = user?.id
  const [stored, setStored] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [discover, setDiscover] = useState([])
  const [live, setLive] = useState({})
  const [loading, setLoading] = useState({ stored: true, leaderboard: true, discover: true })

  // Latest stored theses, so the polling interval can fetch quotes for the
  // current ticker set without being torn down and rebuilt on every change.
  const storedRef = useRef(stored)
  storedRef.current = stored

  // The user's own stored theses, with trigger statuses recomputed server-side.
  const loadStored = useCallback(async () => {
    if (!userId) {
      setStored([])
      setLoading((l) => ({ ...l, stored: false }))
      return
    }

    try {
      const r = await fetch('/api/theses/evaluate', { method: 'POST' })
      const rows = r.ok ? await r.json() : []
      if (Array.isArray(rows)) setStored(rows)
    } catch {
      /* store unavailable — keep last-known */
    } finally {
      setLoading((l) => ({ ...l, stored: false }))
    }
  }, [userId])

  const loadLeaderboard = useCallback(async () => {
    try {
      const r = await fetch('/api/leaderboard')
      const rows = r.ok ? await r.json() : []
      if (Array.isArray(rows)) setLeaderboard(rows)
    } catch {
      /* leaderboard unavailable */
    } finally {
      setLoading((l) => ({ ...l, leaderboard: false }))
    }
  }, [])

  const loadDiscover = useCallback(async () => {
    try {
      const r = await fetch('/api/discover')
      const rows = r.ok ? await r.json() : []
      if (Array.isArray(rows)) setDiscover(rows)
    } catch {
      /* feed unavailable */
    } finally {
      setLoading((l) => ({ ...l, discover: false }))
    }
  }, [])

  // Fetch live prices for the current stored ticker set. Read from the ref so a
  // single stable callback always sees the latest theses.
  const refreshLive = useCallback(async () => {
    const theses = storedRef.current
    const items = theses.map((t) => ({ symbol: t.ticker, from: t.entryDate }))
    if (!items.length) {
      setLive({})
      return
    }
    try {
      const r = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!r.ok) return
      const rows = await r.json()
      setLive(toLiveMap(rows, theses))
    } catch {
      /* keep last-known prices */
    }
  }, [])

  // Re-fetch the mutation-driven datasets (call after publish/close/update or an
  // identity change). Live prices refresh on their own poll.
  const refresh = useCallback(() => {
    loadStored()
    loadLeaderboard()
    loadDiscover()
  }, [loadStored, loadLeaderboard, loadDiscover])

  // Initial load: fire all reads in parallel once on mount.
  useEffect(() => {
    loadStored()
    loadLeaderboard()
    loadDiscover()
  }, [loadStored, loadLeaderboard, loadDiscover])

  // Live prices track the stored ticker set: fetch whenever it changes, then
  // poll on an interval so quotes stay current while the app is open.
  const tickerKey = stored.map((t) => t.ticker).join(',')
  useEffect(() => {
    if (!tickerKey) {
      setLive({})
      return
    }
    refreshLive()
    const id = setInterval(refreshLive, LIVE_POLL_MS)
    return () => clearInterval(id)
  }, [tickerKey, refreshLive])

  const value = {
    stored,
    leaderboard,
    discover,
    live,
    loading,
    refresh,
    refreshLive,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
