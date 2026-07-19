import { useData } from '../components/DataProvider.jsx'

// Live native-currency entry/current/return per ticker, side-adjusted for bear
// theses. Served from the app-wide cache (see DataProvider), which fetches quotes
// for the full stored ticker set and polls them in the background.
//
// The `theses` argument is retained for call-site compatibility but no longer
// drives a fetch: the cache holds a superset map keyed by ticker, and every
// consumer indexes into it by `t.ticker`, so returning the shared map is correct.
export function useLiveTheses(_theses) {
  return useData().live
}
