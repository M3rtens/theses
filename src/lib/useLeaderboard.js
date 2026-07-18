import { useEffect, useState } from 'react'

// Loads the ranked leaderboard (all analysts, computed from the database) from
// /api/leaderboard. Returns [] until it resolves, or on failure.
export function useLeaderboard() {
  const [board, setBoard] = useState([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/leaderboard')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { if (!cancelled && Array.isArray(rows)) setBoard(rows) })
      .catch(() => { /* leaderboard unavailable */ })
    return () => { cancelled = true }
  }, [])

  return board
}
