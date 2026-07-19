import { useData } from '../components/DataProvider.jsx'

// The signed-in user's stored theses, with trigger statuses recomputed
// server-side (via the evaluate endpoint). Served from the app-wide cache (see
// DataProvider) — loaded once at startup and refreshed after mutations, so
// switching views is instant.
export function useStoredTheses() {
  return useData().stored
}
