import { useEffect, useState } from 'react'

// Loads user-created theses from the backend store. Re-runs whenever the view is
// shown (App remounts views on navigate), so a freshly published thesis appears
// without a full reload. Returns [] until the fetch resolves.
//
// Uses the evaluate endpoint (POST) rather than a plain GET so that, on every
// load, each thesis's financial-trigger statuses are recomputed against the
// latest filings and persisted — keeping the My Theses dots and the Trigger
// Dashboard in step with the live thesis page.
export function useStoredTheses() {
  const [stored, setStored] = useState([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/theses/evaluate', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { if (!cancelled && Array.isArray(rows)) setStored(rows) })
      .catch(() => { /* store unavailable — show samples only */ })
    return () => { cancelled = true }
  }, [])

  return stored
}
