import { useData } from '../components/DataProvider.jsx'

// The ranked leaderboard (all analysts, computed from the database). Served from
// the app-wide cache (see DataProvider) — loaded once at startup and refreshed
// after mutations, so switching views is instant.
export function useLeaderboard() {
  return useData().leaderboard
}
