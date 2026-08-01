// Small process-local cache for read-through provider calls. Concurrent misses
// share one promise, successful values expire after the configured TTL, and
// rejected calls are never cached.
export function createAsyncCache({ ttlMs, maxEntries = 250 }) {
  const entries = new Map()

  const prune = (now) => {
    for (const [key, entry] of entries) {
      if (!entry.promise && entry.expiresAt <= now) entries.delete(key)
    }
    while (entries.size >= maxEntries) {
      const oldestKey = entries.keys().next().value
      entries.delete(oldestKey)
    }
  }

  return {
    async get(key, load) {
      const now = Date.now()
      const existing = entries.get(key)
      if (existing && (existing.promise || existing.expiresAt > now)) {
        return existing.promise || existing.value
      }
      if (existing) entries.delete(key)
      prune(now)

      const entry = { expiresAt: now + ttlMs, promise: null, value: undefined }
      entry.promise = Promise.resolve()
        .then(load)
        .then((value) => {
          entry.value = value
          entry.expiresAt = Date.now() + ttlMs
          entry.promise = null
          return value
        })
        .catch((error) => {
          if (entries.get(key) === entry) entries.delete(key)
          throw error
        })
      entries.set(key, entry)
      return entry.promise
    },

    clear() {
      entries.clear()
    },
  }
}
