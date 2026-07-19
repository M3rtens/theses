import { useEffect, useState } from 'react'

// Loads the community feed (every published thesis across all users, joined to
// author profiles) from /api/discover. Returns [] until it resolves, or on
// failure.
export function useDiscoverFeed() {
  const [feed, setFeed] = useState([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/discover')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { if (!cancelled && Array.isArray(rows)) setFeed(rows) })
      .catch(() => { /* feed unavailable */ })
    return () => { cancelled = true }
  }, [])

  return feed
}
