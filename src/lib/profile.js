// Client-side profile settings (the editable parts of the profile that have no
// backend yet — currently just the analyst's description). Persisted to
// localStorage, following the same pattern as drafts. Kept in one place so the
// Profile view reads and writes through a single source.

const KEY = 'theses.profile'

export const DEFAULT_BIO =
  'Long-biased equity analyst focused on capital-intensive monopolies and structural supply constraints. CFA Charterholder. Former sell-side at Bernstein.'

// Read stored profile settings. Never throws — a corrupt store yields defaults.
export const loadProfile = () => {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return { bio: DEFAULT_BIO, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
  } catch {
    return { bio: DEFAULT_BIO }
  }
}

// Merge a patch into the stored profile and return the updated settings.
export const saveProfile = (patch) => {
  try {
    const next = { ...loadProfile(), ...patch }
    localStorage.setItem(KEY, JSON.stringify(next))
    return next
  } catch {
    return loadProfile()
  }
}
