// Browser storage is an offline cache for cloud drafts. Drafts are namespaced
// per user so accounts sharing a browser never see one another's work.
const keyFor = (userId) => `theses.drafts::${userId || 'anon'}`

const wordCount = (html) => {
  const text = (html || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ')
  return text.trim().split(/\s+/).filter(Boolean).length
}

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

export const loadDrafts = (userId) => {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.slice().sort((a, b) => b.savedAt - a.savedAt) : []
  } catch {
    return []
  }
}

export const deleteDraft = (id, userId) => {
  const next = loadDrafts(userId).filter((draft) => draft.id !== id)
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(next))
  } catch {
    // Keep the in-memory result useful even when storage is unavailable.
  }
  return next
}

export const saveDraft = (thesis, id, userId, metadata = {}) => {
  const list = loadDrafts(userId)
  const draftId = id || `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const existing = list.find((draft) => draft.id === draftId) || {}
  const row = {
    id: draftId,
    title: thesis.title || '',
    ticker: thesis.ticker || '',
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
    cloudDraftId: metadata.cloudDraftId ?? thesis.cloudDraftId ?? existing.cloudDraftId ?? null,
    cloudDraftVersion: metadata.cloudDraftVersion ?? thesis.cloudDraftVersion ?? existing.cloudDraftVersion ?? null,
    syncedAt: metadata.syncedAt ?? existing.syncedAt ?? null,
    dirty: true,
  }
  const next = [row, ...list.filter((draft) => draft.id !== row.id)]
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(next))
  } catch {
    return null
  }
  return row
}

export const markDraftSynced = (id, userId, cloudDraft) => {
  const list = loadDrafts(userId)
  const existing = list.find((draft) => draft.id === id)
  if (!existing) return null

  const syncedAt = Date.now()
  const row = {
    ...existing,
    cloudDraftId: cloudDraft.cloudDraftId,
    cloudDraftVersion: cloudDraft.cloudDraftVersion,
    syncedAt,
    dirty: false,
    savedAt: Number(new Date(cloudDraft.savedAt)) || existing.savedAt,
  }
  const next = [row, ...list.filter((draft) => draft.id !== id)]
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(next))
  } catch {
    return null
  }
  return row
}

export const isDraftDirty = (draft) => typeof draft.dirty === 'boolean'
  ? draft.dirty
  : (!draft.syncedAt || draft.savedAt > draft.syncedAt)

export const hasDraftContent = (draft) => Boolean(
  draft?.title?.trim()
  || draft?.ticker?.trim()
  || draft?.body?.replace(/<[^>]*>/g, '').trim()
  || draft?.triggers?.length
  || draft?.model,
)
