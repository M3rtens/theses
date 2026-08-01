import 'server-only'
import { requireUserContext } from './auth.js'
import { createAdminClient } from './supabase/admin.js'

const migrationMissing = (error) => ['42P01', 'PGRST205'].includes(error?.code)
  || /public\.drafts|relation .+drafts.+ does not exist/i.test(error?.message || '')

function mapDraftError(error) {
  const mapped = new Error(migrationMissing(error)
    ? 'cloud drafts migration is not applied'
    : (error?.message || 'cloud draft operation failed'))
  mapped.status = migrationMissing(error) ? 503 : undefined
  return mapped
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function normalizeCloudDraftId(value) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error('invalid cloud draft id')
    error.status = 400
    throw error
  }
  return id
}

export function hydrateCloudDraft(row) {
  const payload = row?.data && typeof row.data === 'object' ? row.data : {}
  const text = String(payload.body || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ')
  return {
    ...payload,
    id: `cloud-${row.id}`,
    cloudDraftId: row.id,
    cloudDraftVersion: Number(row.version || 1),
    localDraftId: row.local_id,
    savedAt: Date.parse(row.updated_at || row.created_at) || Date.now(),
    createdAt: row.created_at,
    wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
    triggersCount: Array.isArray(payload.triggers) ? payload.triggers.length : 0,
  }
}

export async function listCloudDrafts() {
  const { supabase, user } = await requireUserContext()
  const { data, error } = await supabase
    .from('drafts')
    .select('id, user_id, data, local_id, version, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw mapDraftError(error)
  return (data || []).map(hydrateCloudDraft)
}

export async function createCloudDraft(draft, localId) {
  const { user } = await requireUserContext()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('drafts')
    .insert({ user_id: user.id, data: draft, local_id: localId })
    .select('id, user_id, data, local_id, version, created_at, updated_at')
    .single()
  if (!error) return hydrateCloudDraft(data)
  if (error.code !== '23505') throw mapDraftError(error)

  const { data: existing, error: existingError } = await admin
    .from('drafts')
    .select('id, user_id, data, local_id, version, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('local_id', localId)
    .maybeSingle()
  if (existingError) throw mapDraftError(existingError)
  if (!existing) return null
  const hydrated = hydrateCloudDraft(existing)
  if (stableJson(existing.data) === stableJson(draft)) return hydrated

  const conflict = new Error('a different draft already uses this local identity')
  conflict.status = 409
  conflict.current = hydrated
  throw conflict
}

export async function updateCloudDraft(id, draft, expectedVersion) {
  const { user } = await requireUserContext()
  const draftId = normalizeCloudDraftId(id)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('drafts')
    .update({ data: draft })
    .eq('id', draftId)
    .eq('user_id', user.id)
    .eq('version', expectedVersion)
    .select('id, user_id, data, local_id, version, created_at, updated_at')
    .maybeSingle()
  if (error) throw mapDraftError(error)
  if (data) return hydrateCloudDraft(data)

  const { data: current, error: currentError } = await admin
    .from('drafts')
    .select('id, user_id, data, local_id, version, created_at, updated_at')
    .eq('id', draftId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (currentError) throw mapDraftError(currentError)
  if (!current) return null

  const conflict = new Error('draft changed on another device')
  conflict.status = 409
  conflict.current = hydrateCloudDraft(current)
  throw conflict
}

export async function deleteCloudDraft(id) {
  const { user } = await requireUserContext()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('drafts')
    .delete()
    .eq('id', normalizeCloudDraftId(id))
    .eq('user_id', user.id)
    .select('id')
  if (error) throw mapDraftError(error)
  return Boolean(data?.length)
}
