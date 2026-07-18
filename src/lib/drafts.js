// Client-side draft persistence. Drafts live in localStorage until published;
// publishing goes through /api/theses and is handled separately. Kept in one
// place so the Editor (writer) and the Drafts view (reader) stay in sync.
//
// Drafts are namespaced per user id, so two accounts signing in on the same
// browser don't see each other's drafts. Callers pass the signed-in user's id.
const keyFor = (userId) => `theses.drafts::${userId || 'anon'}`

// Count words in the thesis body by stripping HTML down to text.
const wordCount = (html) => {
  const text = (html || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ')
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length
}

// Render a savedAt timestamp as the relative label the draft cards show.
export const relativeTime = (ts) => {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`
  return `${Math.floor(days / 7)} week${days >= 14 ? 's' : ''} ago`
}

// Read all saved drafts for a user, newest first. Never throws — a corrupt
// store yields [].
export const loadDrafts = (userId) => {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.slice().sort((a, b) => b.savedAt - a.savedAt) : []
  } catch {
    return []
  }
}

// Remove a saved draft by id. Returns the remaining drafts (newest first), or
// the current list unchanged if storage is unavailable.
export const deleteDraft = (id, userId) => {
  const next = loadDrafts(userId).filter((d) => d.id !== id)
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(next))
  } catch {
    // Storage unavailable — nothing removed.
  }
  return next
}

// Persist a draft built by the editor. Reuses the row for a given id if present
// (re-saving an open draft), otherwise appends a new one. Returns the saved row.
export const saveDraft = (thesis, id, userId) => {
  const list = loadDrafts(userId)
  const row = {
    id: id || `d-${Date.now()}`,
    title: thesis.title || 'Untitled thesis',
    ticker: thesis.ticker || '—',
    company: thesis.company || '',
    sector: thesis.sector || '',
    side: thesis.side || 'bull',
    body: thesis.body || '',
    triggers: thesis.triggers || [],
    model: thesis.model || null,
    scheduledPublicationDate: thesis.scheduledPublicationDate || null,
    wordCount: wordCount(thesis.body),
    triggersCount: (thesis.triggers || []).length,
    savedAt: Date.now(),
  }
  const next = [row, ...list.filter((d) => d.id !== row.id)]
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(next))
  } catch {
    // Storage unavailable (private mode / quota) — surfaced by caller via toast.
    return null
  }
  return row
}
