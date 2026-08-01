import 'server-only'
import { requireUserContext } from './auth.js'
import { sanitizeThesisHtml } from './html.js'
import { createAdminClient } from './supabase/admin.js'

// Postgres-backed store for user-created theses, scoped to the signed-in user
// via Supabase Row Level Security. Each thesis object is stored whole in the
// `data` JSONB column; the row's `id` is the app-facing thesis id, merged back
// onto the object on read so the shape matches what the app has always used.

// Resolve the request's Supabase client and current user. Throws if there is no
// session — every caller runs inside an authenticated API route.
async function ctx() {
  return requireUserContext()
}

// Fold the row id into the stored thesis object.
const hydrate = (row) => ({
  ...row.data,
  body: sanitizeThesisHtml(row.data?.body),
  id: row.id,
  ownerId: row.user_id,
})

const hydrateRpc = (value, userId) => value ? ({
  ...value,
  body: sanitizeThesisHtml(value.body),
  ownerId: value.ownerId || userId,
}) : null

const thesisId = (value) => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error('invalid thesis id')
    error.status = 400
    throw error
  }
  return id
}

const missingRpc = (error) => error?.code === 'PGRST202'
  || /could not find the function/i.test(error?.message || '')

function throwStoreError(error) {
  const message = error?.message || 'database operation failed'
  const mapped = new Error(message)
  if (message.includes('thesis_already_closed') || message.includes('close_date_already_set')) mapped.status = 409
  else if (
    message.includes('close_date_must_be_future')
    || message.includes('invalid_close_price')
    || message.includes('invalid_update_text')
    || message.includes('unsupported_metrics_patch')
  ) mapped.status = 400
  throw mapped
}

async function legacyUpdate(admin, userId, id, patch) {
  const row = await legacyGet(admin, userId, id)
  if (!row) return null

  const updated = { ...row.data, ...patch }
  const { data, error } = await admin
    .from('theses')
    .update({ data: updated, status: updated.status || row.status || 'active' })
    .eq('user_id', userId)
    .eq('id', id)
    .select('id, user_id, data')
    .single()
  if (error) throw error
  return hydrate(data)
}

async function legacyGet(admin, userId, id) {
  const { data: row, error: readError } = await admin
    .from('theses')
    .select('id, user_id, data, status')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()
  if (readError) throw readError
  if (!row) return null
  return row
}

// Newest first.
export async function listTheses() {
  const { supabase, user } = await ctx()
  const { data, error } = await supabase
    .from('theses')
    .select('id, user_id, data')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw error
  return data.map(hydrate)
}

export async function getThesis(id) {
  const { supabase, user } = await ctx()
  const normalizedId = thesisId(id)
  const { data, error } = await supabase
    .from('theses')
    .select('id, user_id, data')
    .eq('user_id', user.id)
    .eq('id', normalizedId)
    .maybeSingle()
  if (error) throw error
  return data ? hydrate(data) : null
}

// Inserts a new thesis owned by the current user. The app-facing id is assigned
// by the database. Returns the saved record (with id).
export async function addThesis(thesis) {
  const { user } = await ctx()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('theses')
    .insert({ user_id: user.id, data: thesis, status: thesis.status || 'active' })
    .select('id, user_id, data')
    .single()
  if (error) throw error
  return hydrate(data)
}

// Atomically update only volatile market and trigger-status fields. The RPC is
// service-only; its database trigger independently rejects changed trigger
// definitions. A fallback keeps pre-migration development databases usable.
export async function updateThesisMetrics(id, patch) {
  const { user } = await ctx()
  const admin = createAdminClient()
  const normalizedId = thesisId(id)
  const { data, error } = await admin.rpc('update_thesis_metrics', {
    p_thesis_id: normalizedId,
    p_user_id: user.id,
    p_patch: patch,
  })
  if (!error) return hydrateRpc(data, user.id)
  if (missingRpc(error)) return legacyUpdate(admin, user.id, normalizedId, patch)
  throwStoreError(error)
}

// Appends a timestamped update note. The timestamp is stamped server-side so it
// can't be backdated. Returns the appended update record, or null if no such
// thesis exists for this user.
export async function appendUpdate(id, text) {
  const { user } = await ctx()
  const admin = createAdminClient()
  const normalizedId = thesisId(id)
  const { data, error } = await admin.rpc('append_thesis_update', {
    p_thesis_id: normalizedId,
    p_user_id: user.id,
    p_text: text,
  })
  if (!error) return data
  if (!missingRpc(error)) throwStoreError(error)

  const row = await legacyGet(admin, user.id, normalizedId)
  if (!row) return null
  const log = Array.isArray(row.data?.updateLog) ? row.data.updateLog : []
  const nextId = log.reduce((maximum, update) => Math.max(maximum, Number(update.id) || 0), 0) + 1
  const update = { id: nextId, text, at: new Date().toISOString() }
  await legacyUpdate(admin, user.id, normalizedId, { updateLog: [...log, update], updates: log.length + 1 })
  return update
}

export async function scheduleThesisClose(id, closeDate) {
  const { user } = await ctx()
  const admin = createAdminClient()
  const normalizedId = thesisId(id)
  const { data, error } = await admin.rpc('schedule_thesis_close', {
    p_thesis_id: normalizedId,
    p_user_id: user.id,
    p_close_date: closeDate,
  })
  if (!error) return hydrateRpc(data, user.id)
  if (missingRpc(error)) return legacyUpdate(admin, user.id, normalizedId, { closeDate })
  throwStoreError(error)
}

export async function closeThesis(id, closePrice) {
  const { user } = await ctx()
  const admin = createAdminClient()
  const normalizedId = thesisId(id)
  const { data, error } = await admin.rpc('close_thesis', {
    p_thesis_id: normalizedId,
    p_user_id: user.id,
    p_close_price: closePrice,
  })
  if (!error) return hydrateRpc(data, user.id)
  if (!missingRpc(error)) throwStoreError(error)

  const { data: row, error: readError } = await admin
    .from('theses')
    .select('data')
    .eq('user_id', user.id)
    .eq('id', normalizedId)
    .maybeSingle()
  if (readError) throw readError
  if (!row) return null
  const thesis = row.data
  const nowIso = new Date().toISOString()
  const closeReturn = thesis.entry
    ? Number(((thesis.side === 'bear' ? -1 : 1) * ((closePrice - thesis.entry) / thesis.entry) * 100).toFixed(1))
    : thesis.ret
  const daysActive = thesis.entryDate
    ? Math.max(0, Math.round((new Date(nowIso) - new Date(thesis.entryDate)) / 86400000))
    : thesis.daysActive
  return legacyUpdate(admin, user.id, normalizedId, {
    status: 'closed',
    closedAt: nowIso,
    closePrice,
    closeReturn,
    current: closePrice,
    ret: closeReturn,
    daysActive,
  })
}
