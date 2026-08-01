import 'server-only'
import { listTheses } from './thesesStore.js'
export { buildThesisRefreshPatch } from './refreshMetrics.js'

// Kept as a compatibility endpoint for existing clients. Durable refreshes now
// run through the secured background worker, so page loads only read stored rows.
export function refreshStoredTriggers() {
  return listTheses()
}
