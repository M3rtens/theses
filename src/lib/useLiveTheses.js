import { useData } from '../components/DataProvider.jsx'

// Live native-currency entry/current/return per thesis, side-adjusted for bear
// theses. Served from the app-wide cache (see DataProvider), which fetches quotes
// for the full stored ticker set and polls them in the background.
//
// The `theses` argument is retained for call-site compatibility but no longer
// drives a fetch: the cache holds the signed-in user's thesis-id keyed map.
export function useLiveTheses(_theses) {
  return useData().live
}
