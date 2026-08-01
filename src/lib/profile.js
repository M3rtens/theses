// Browser profile storage is an offline cache for the owner-only cloud row.
// The old unscoped key is read once so existing bios can migrate safely.
const LEGACY_KEY = 'theses.profile'
const keyFor = (userId) => `theses.profile::${userId || 'anon'}`

export const DEFAULT_BIO = ''
export const DEFAULT_PROFILE = {
  bio: DEFAULT_BIO,
  location: '',
  joinedAt: null,
  verified: false,
  updatedAt: null,
  savedAt: null,
  dirty: false,
}

const normalize = (value, metadata = {}) => ({
  ...DEFAULT_PROFILE,
  ...(value && typeof value === 'object' ? value : {}),
  ...metadata,
})

export const loadProfile = (userId) => {
  try {
    const scoped = localStorage.getItem(keyFor(userId))
    if (scoped) return normalize(JSON.parse(scoped))

    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) return normalize(JSON.parse(legacy), { dirty: true, legacy: true })
  } catch {
    // Corrupt or unavailable browser storage falls through to safe defaults.
  }
  return { ...DEFAULT_PROFILE }
}

export const saveProfile = (patch, userId, { dirty = true } = {}) => {
  const next = normalize({
    ...loadProfile(userId),
    ...patch,
    savedAt: Date.now(),
    dirty,
    legacy: false,
  })
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(next))
    return next
  } catch {
    return null
  }
}

export const markProfileSynced = (profile, userId) => {
  const next = saveProfile(profile, userId, { dirty: false })
  if (!next) return null
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // The scoped copy was written successfully; legacy cleanup is optional.
  }
  return next
}
