import { useData } from '../components/DataProvider.jsx'

// The community feed (every published thesis across all users, joined to author
// profiles). Served from the app-wide cache (see DataProvider) — loaded once at
// startup and refreshed after mutations, so switching views is instant.
export function useDiscoverFeed() {
  return useData().discover
}
