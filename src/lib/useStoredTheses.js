import { useEffect, useState } from 'react'

// Loads user-created theses from the backend store. Re-runs whenever the view is
// shown (App remounts views on navigate), so a freshly published thesis appears
// without a full reload. Returns [] until the fetch resolves.
export function useStoredTheses() {
  const [stored, setStored] = useState([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/theses')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { if (!cancelled && Array.isArray(rows)) setStored(rows) })
      .catch(() => { /* store unavailable — show samples only */ })
    return () => { cancelled = true }
  }, [])

  return stored
}
