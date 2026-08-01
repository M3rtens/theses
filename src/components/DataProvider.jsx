'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useUser } from './UserProvider.jsx'
import {
  deleteDraft as deleteLocalDraft,
  hasDraftContent,
  isDraftDirty,
  loadDrafts as loadLocalDrafts,
  markDraftSynced,
  saveDraft as saveLocalDraft,
} from '../lib/drafts.js'

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

function cloudPayload(draft) {
  return {
    title: draft.title || '',
    ticker: draft.ticker || '',
    company: draft.company || '',
    sector: draft.sector || '',
    side: draft.side || 'bull',
    body: draft.body || '',
    triggers: draft.triggers || [],
    model: draft.model || null,
    scheduledPublicationDate: draft.scheduledPublicationDate || null,
  }
}

async function readResponse(response) {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error || `HTTP ${response.status}`)
    error.status = response.status
    error.current = data?.current
    throw error
  }
  return data
}

// Turn a raw /api/cards response into the ticker→{currency,entry,current,ret}
// map the views expect. Return is side-adjusted so a bear thesis gains when the
// price falls. (Lifted verbatim from the old useLiveTheses.)
function toLiveMap(rows, theses) {
  const map = {}
  if (!Array.isArray(rows)) return map
  const byRequest = new Map(rows.map((row) => [`${row?.symbol}\u0000${row?.from || ''}`, row]))
  theses.forEach((thesis) => {
    const q = byRequest.get(`${thesis.ticker}\u0000${thesis.entryDate || ''}`)
    if (!q || q.error || q.current == null) return
    const entry = Number(thesis.entry || q.entry)
    const current = Number(q.current)
    if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(current)) return
    const priceReturn = ((current - entry) / entry) * 100
    const ret = (thesis.side === 'bear' ? -1 : 1) * priceReturn
    map[thesis.id] = {
      currency: q.currency,
      entry,
      current,
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
  const [drafts, setDrafts] = useState([])
  const [scheduled, setScheduled] = useState([])
  const [notifications, setNotifications] = useState([])
  const [live, setLive] = useState({})
  const [loading, setLoading] = useState({
    stored: true,
    leaderboard: true,
    discover: true,
    drafts: true,
    scheduled: true,
    notifications: true,
  })

  // Latest stored theses, so the polling interval can fetch quotes for the
  // current ticker set without being torn down and rebuilt on every change.
  const storedRef = useRef(stored)
  storedRef.current = stored
  const draftLoadRef = useRef(null)
  const draftUserRef = useRef(userId)
  draftUserRef.current = userId

  // The user's own stored theses. Durable market and trigger refreshes are
  // performed by the scheduled worker rather than coupling writes to page loads.
  const loadStored = useCallback(async () => {
    if (!userId) {
      setStored([])
      setLoading((l) => ({ ...l, stored: false }))
      return []
    }

    try {
      const r = await fetch('/api/theses')
      const rows = r.ok ? await r.json() : []
      if (Array.isArray(rows)) {
        setStored(rows)
        return rows
      }
    } catch {
      /* store unavailable — keep last-known */
    } finally {
      setLoading((l) => ({ ...l, stored: false }))
    }
    return storedRef.current
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

  // Cloud drafts use optimistic versions to prevent one device from silently
  // overwriting another. localStorage remains a cache and offline write-ahead
  // copy; legacy local-only drafts are imported after the first successful GET.
  const loadDrafts = useCallback(async () => {
    if (!userId) {
      setDrafts([])
      setLoading((current) => ({ ...current, drafts: false }))
      return []
    }
    if (draftLoadRef.current?.userId === userId) return draftLoadRef.current.promise

    const run = (async () => {
      const localRows = loadLocalDrafts(userId)
      if (draftUserRef.current === userId) {
        setDrafts(localRows.map((draft) => ({ ...draft, localDraftId: draft.id, offline: true })))
      }

      try {
        const cloudRows = await readResponse(await fetch('/api/drafts'))
        if (!Array.isArray(cloudRows)) throw new Error('invalid cloud draft response')

        const cloudById = new Map(cloudRows.map((draft) => [String(draft.cloudDraftId), draft]))
        const cloudByLocalId = new Map(cloudRows.map((draft) => [draft.localDraftId, draft]))
        const handled = new Set()
        const resolved = []

        const cacheCloud = (cloud) => {
          const localId = cloud.localDraftId || `cloud-${cloud.cloudDraftId}`
          saveLocalDraft(cloud, localId, userId, {
            cloudDraftId: cloud.cloudDraftId,
            cloudDraftVersion: cloud.cloudDraftVersion,
          })
          markDraftSynced(localId, userId, cloud)
          return cloud
        }

        const createCloud = async (local, localId = local.id) => {
          const created = await readResponse(await fetch('/api/drafts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ draft: cloudPayload(local), localId }),
          }))
          markDraftSynced(localId, userId, created)
          handled.add(String(created.cloudDraftId))
          return created
        }

        const preserveConflict = async (local, current) => {
          const copies = [cacheCloud(current)]
          const conflictId = `d-${Date.now()}-conflict-${Math.random().toString(36).slice(2, 7)}`
          const conflict = {
            ...local,
            title: `${local.title || 'Untitled thesis'} (conflict copy)`,
            cloudDraftId: null,
            cloudDraftVersion: null,
            syncedAt: null,
          }
          const savedConflict = saveLocalDraft(conflict, conflictId, userId, {
            cloudDraftId: null,
            cloudDraftVersion: null,
            syncedAt: null,
          })
          try {
            copies.push(await createCloud(savedConflict || conflict, conflictId))
          } catch {
            copies.push({ ...(savedConflict || conflict), localDraftId: conflictId, offline: true })
          }
          return copies
        }

        for (const local of localRows) {
          const cloud = (local.cloudDraftId && cloudById.get(String(local.cloudDraftId)))
            || cloudByLocalId.get(local.id)

          if (!cloud) {
            // A clean cache whose cloud row disappeared was deleted on another
            // device. Remove the cache instead of resurrecting that draft.
            if (local.cloudDraftId && !isDraftDirty(local)) {
              deleteLocalDraft(local.id, userId)
              continue
            }
            if (!hasDraftContent(local)) continue
            try {
              resolved.push(await createCloud(local))
            } catch (error) {
              if (error.status === 409 && error.current) {
                resolved.push(...await preserveConflict(local, error.current))
              } else {
                resolved.push({ ...local, localDraftId: local.id, offline: true })
              }
            }
            continue
          }

          handled.add(String(cloud.cloudDraftId))
          if (!isDraftDirty(local)) {
            resolved.push(cacheCloud(cloud))
            continue
          }

          try {
            const updated = await readResponse(await fetch(`/api/drafts/${cloud.cloudDraftId}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                draft: cloudPayload(local),
                version: local.cloudDraftVersion || cloud.cloudDraftVersion,
              }),
            }))
            markDraftSynced(local.id, userId, updated)
            resolved.push(updated)
          } catch (error) {
            if (error.status !== 409 || !error.current) {
              resolved.push({ ...local, localDraftId: local.id, offline: true })
              continue
            }

            // Preserve both edits under separate identities instead of
            // choosing a winner.
            resolved.push(...await preserveConflict(local, error.current))
          }
        }

        cloudRows.forEach((cloud) => {
          if (!handled.has(String(cloud.cloudDraftId))) resolved.push(cacheCloud(cloud))
        })
        resolved.sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0))
        if (draftUserRef.current === userId) setDrafts(resolved)
        return resolved
      } catch {
        return localRows.map((draft) => ({ ...draft, localDraftId: draft.id, offline: true }))
      } finally {
        if (draftUserRef.current === userId) {
          setLoading((current) => ({ ...current, drafts: false }))
        }
      }
    })()

    draftLoadRef.current = { userId, promise: run }
    try {
      return await run
    } finally {
      if (draftLoadRef.current?.promise === run) draftLoadRef.current = null
    }
  }, [userId])

  const loadScheduled = useCallback(async () => {
    if (!userId) {
      setScheduled([])
      setLoading((current) => ({ ...current, scheduled: false }))
      return
    }
    try {
      const response = await fetch('/api/scheduled-publications')
      const rows = response.ok ? await response.json() : []
      if (Array.isArray(rows)) setScheduled(rows)
    } catch {
      /* lifecycle migration unavailable — keep last-known */
    } finally {
      setLoading((current) => ({ ...current, scheduled: false }))
    }
  }, [userId])

  const loadNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([])
      setLoading((current) => ({ ...current, notifications: false }))
      return
    }
    try {
      const response = await fetch('/api/notifications')
      const rows = response.ok ? await response.json() : []
      if (Array.isArray(rows)) setNotifications(rows)
    } catch {
      /* notification store unavailable — keep last-known */
    } finally {
      setLoading((current) => ({ ...current, notifications: false }))
    }
  }, [userId])

  // Fetch live prices for the current stored ticker set. Read from the ref so a
  // single stable callback always sees the latest theses.
  const refreshLive = useCallback(async () => {
    const theses = storedRef.current.filter((thesis) => thesis.status !== 'closed')
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
    loadDrafts()
    loadScheduled()
    loadNotifications()
  }, [loadStored, loadLeaderboard, loadDiscover, loadDrafts, loadScheduled, loadNotifications])

  // Initial load: fire all reads in parallel once on mount.
  useEffect(() => {
    loadStored()
    loadLeaderboard()
    loadDiscover()
    loadDrafts()
    loadScheduled()
    loadNotifications()
  }, [loadStored, loadLeaderboard, loadDiscover, loadDrafts, loadScheduled, loadNotifications])

  useEffect(() => {
    if (!userId) return undefined
    const id = setInterval(() => {
      loadNotifications()
      loadScheduled()
    }, LIVE_POLL_MS)
    return () => clearInterval(id)
  }, [userId, loadNotifications, loadScheduled])

  // Live prices track the stored ticker set: fetch whenever it changes, then
  // poll on an interval so quotes stay current while the app is open.
  const tickerKey = stored
    .filter((thesis) => thesis.status !== 'closed')
    .map((thesis) => `${thesis.id}:${thesis.ticker}:${thesis.entryDate || ''}`)
    .join(',')
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
    drafts,
    scheduled,
    notifications,
    live,
    loading,
    refresh,
    refreshLive,
    loadStored,
    loadDrafts,
    loadScheduled,
    loadNotifications,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
