import 'server-only'
import { requireUserContext } from './auth.js'
import { hydrateScheduledPublication } from './lifecycle.js'
import { createAdminClient } from './supabase/admin.js'
import { getMarketSnapshot, getSchedulingMetadata } from './yahoo.js'

const normalizedId = (value) => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error('invalid scheduled publication id')
    error.status = 400
    throw error
  }
  return id
}

const migrationMissing = (error) => ['PGRST202', 'PGRST205', '42P01'].includes(error?.code)
  || /lifecycle_jobs|could not find the function/i.test(error?.message || '')

function throwScheduledError(error) {
  const message = error?.message || 'scheduled publication operation failed'
  const mapped = new Error(migrationMissing(error)
    ? 'automated lifecycle migration is not applied'
    : message)
  if (migrationMissing(error)) mapped.status = 503
  else if (/processing|completed|not_retryable|not_publishable/i.test(message)) mapped.status = 409
  else if (/invalid_|in_the_past|supported range/i.test(message)) mapped.status = 400
  throw mapped
}

export async function listScheduledPublications() {
  const { supabase, user } = await requireUserContext()
  const { data, error } = await supabase
    .from('lifecycle_jobs')
    .select('id, payload, status, scheduled_date, attempt_count, last_error_code, created_at, updated_at, resolved_symbol, exchange, exchange_timezone')
    .eq('user_id', user.id)
    .eq('kind', 'publish')
    .neq('status', 'completed')
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throwScheduledError(error)
  return (data || []).map(hydrateScheduledPublication)
}

async function scheduleMetadata(ticker) {
  try {
    return await getSchedulingMetadata(ticker)
  } catch (error) {
    const mapped = new Error('could not resolve the security exchange for scheduling')
    mapped.status = 502
    mapped.cause = error
    throw mapped
  }
}

export async function createScheduledPublication(thesis, scheduledDate) {
  const { user } = await requireUserContext()
  const metadata = await scheduleMetadata(thesis.ticker)
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('create_scheduled_publication', {
    p_user_id: user.id,
    p_payload: thesis,
    p_scheduled_date: scheduledDate,
    p_resolved_symbol: metadata.resolvedSymbol,
    p_exchange: metadata.exchange,
    p_exchange_timezone: metadata.exchangeTimezone,
  })
  if (error) throwScheduledError(error)
  return hydrateScheduledPublication(data)
}

export async function updateScheduledPublication(id, thesis, scheduledDate, activate = true) {
  const { user } = await requireUserContext()
  const jobId = normalizedId(id)
  const metadata = await scheduleMetadata(thesis.ticker)
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('update_scheduled_publication', {
    p_job_id: jobId,
    p_user_id: user.id,
    p_payload: thesis,
    p_scheduled_date: scheduledDate,
    p_resolved_symbol: metadata.resolvedSymbol,
    p_exchange: metadata.exchange,
    p_exchange_timezone: metadata.exchangeTimezone,
    p_activate: activate,
  })
  if (error) throwScheduledError(error)
  return data ? hydrateScheduledPublication(data) : null
}

export async function cancelScheduledPublication(id) {
  const { user } = await requireUserContext()
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('cancel_scheduled_publication', {
    p_job_id: normalizedId(id),
    p_user_id: user.id,
  })
  if (error) throwScheduledError(error)
  return data ? hydrateScheduledPublication(data) : null
}

export async function retryScheduledOperation(id) {
  const { user } = await requireUserContext()
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('retry_lifecycle_job', {
    p_job_id: normalizedId(id),
    p_user_id: user.id,
  })
  if (error) throwScheduledError(error)
  return data ? hydrateScheduledPublication(data) : null
}

export async function deleteScheduledPublication(id) {
  const { user } = await requireUserContext()
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('delete_scheduled_publication', {
    p_job_id: normalizedId(id),
    p_user_id: user.id,
  })
  if (error) throwScheduledError(error)
  return data === true
}

export async function publishScheduledPublicationNow(id, thesis) {
  const { user } = await requireUserContext()
  const jobId = normalizedId(id)
  const savedDraft = await updateScheduledPublication(jobId, thesis, new Date().toISOString().slice(0, 10), false)
  if (!savedDraft) return null

  let market
  try {
    market = await getMarketSnapshot(savedDraft.resolvedSymbol || thesis.ticker)
  } catch (error) {
    const mapped = new Error('could not lock the publication price')
    mapped.status = 502
    mapped.cause = error
    throw mapped
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('finalize_publication_job', {
    p_job_id: jobId,
    p_market: market,
    p_lease_token: null,
    p_user_id: user.id,
  })
  if (error) throwScheduledError(error)
  return data
}
