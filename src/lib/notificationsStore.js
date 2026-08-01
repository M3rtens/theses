import 'server-only'
import { requireUserContext } from './auth.js'
import { createAdminClient } from './supabase/admin.js'

const lifecycleJobId = (value) => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error('invalid lifecycle job id')
    error.status = 400
    throw error
  }
  return id
}

export async function listNotifications(limit = 100) {
  const { supabase, user } = await requireUserContext()
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, message, thesis_id, lifecycle_job_id, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 100)))
  if (error) throw error
  const jobIds = [...new Set((data || [])
    .map((row) => row.lifecycle_job_id)
    .filter(Boolean))]
  let statusByJob = new Map()
  if (jobIds.length) {
    const { data: jobs, error: jobsError } = await supabase
      .from('lifecycle_jobs')
      .select('id, status')
      .eq('user_id', user.id)
      .in('id', jobIds)
    if (jobsError) throw jobsError
    statusByJob = new Map((jobs || []).map((job) => [job.id, job.status]))
  }
  return (data || []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    thesisId: row.thesis_id,
    lifecycleJobId: row.lifecycle_job_id,
    lifecycleJobStatus: statusByJob.get(row.lifecycle_job_id) || null,
    readAt: row.read_at,
    createdAt: row.created_at,
  }))
}

export async function retryLifecycleJob(id) {
  const { user } = await requireUserContext()
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('retry_lifecycle_job', {
    p_job_id: lifecycleJobId(id),
    p_user_id: user.id,
  })
  if (error) {
    const mapped = new Error(error.message || 'lifecycle retry failed')
    mapped.status = /not_retryable/i.test(mapped.message) ? 409 : undefined
    throw mapped
  }
  return data
}

export async function markNotificationsRead({ all, ids }) {
  const { supabase, user } = await requireUserContext()
  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
  if (!all) query = query.in('id', ids)
  const { data, error } = await query.select('id')
  if (error) throw error
  return (data || []).map((row) => row.id)
}
