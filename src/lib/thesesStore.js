import 'server-only'
import { requireUserContext } from './auth.js'
import { sanitizeThesisHtml } from './html.js'

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
  const { data, error } = await supabase
    .from('theses')
    .select('id, user_id, data')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? hydrate(data) : null
}

// Inserts a new thesis owned by the current user. The app-facing id is assigned
// by the database. Returns the saved record (with id).
export async function addThesis(thesis) {
  const { supabase, user } = await ctx()
  const { data, error } = await supabase
    .from('theses')
    .insert({ user_id: user.id, data: thesis, status: thesis.status || 'active' })
    .select('id, user_id, data')
    .single()
  if (error) throw error
  return hydrate(data)
}

// Merges a partial patch into a thesis's stored object. Returns the updated
// record, or null if no such thesis exists for this user. The caller validates
// the patch (e.g. that a close date isn't already sealed).
export async function updateThesis(id, patch) {
  const { supabase, user } = await ctx()
  const { data: row, error: readErr } = await supabase
    .from('theses')
    .select('data')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()
  if (readErr) throw readErr
  if (!row) return null

  const updated = { ...row.data, ...patch }
  const { data, error } = await supabase
    .from('theses')
    .update({ data: updated, status: updated.status || 'active' })
    .eq('user_id', user.id)
    .eq('id', id)
    .select('id, user_id, data')
    .single()
  if (error) throw error
  return hydrate(data)
}

// Appends a timestamped update note. The timestamp is stamped server-side so it
// can't be backdated. Returns the appended update record, or null if no such
// thesis exists for this user.
export async function appendUpdate(id, text) {
  const { supabase, user } = await ctx()
  const { data: row, error: readErr } = await supabase
    .from('theses')
    .select('data')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()
  if (readErr) throw readErr
  if (!row) return null

  const thesis = row.data
  const log = Array.isArray(thesis.updateLog) ? thesis.updateLog : []
  const nextId = log.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0) + 1
  const update = { id: nextId, text, at: new Date().toISOString() }

  const updated = { ...thesis, updateLog: [...log, update], updates: log.length + 1 }
  const { error } = await supabase
    .from('theses')
    .update({ data: updated })
    .eq('user_id', user.id)
    .eq('id', id)
  if (error) throw error
  return update
}
