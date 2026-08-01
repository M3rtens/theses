import 'server-only'
import { requireUserContext } from './auth.js'
import { createAdminClient } from './supabase/admin.js'
import { createClient } from './supabase/server.js'

const normalizeId = (value, label) => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error(`invalid ${label} id`)
    error.status = 400
    throw error
  }
  return id
}

const fail = (message, status) => {
  const error = new Error(message)
  error.status = status
  throw error
}

async function viewerIdentity() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user || null
}

async function publishedThesis(admin, id) {
  const { data, error } = await admin
    .from('theses')
    .select('id, user_id, status')
    .eq('id', id)
    .in('status', ['active', 'closed'])
    .maybeSingle()
  if (error) throw error
  if (!data) fail('thesis not found', 404)
  return data
}

export async function listThesisComments(value) {
  const thesisId = normalizeId(value, 'thesis')
  const admin = createAdminClient()
  const [thesis, viewer] = await Promise.all([
    publishedThesis(admin, thesisId),
    viewerIdentity(),
  ])
  const { data: rows, error } = await admin
    .from('thesis_comments')
    .select('id, thesis_id, user_id, parent_id, body, status, created_at')
    .eq('thesis_id', thesisId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(500)
  if (error) throw error

  const userIds = [...new Set((rows || []).map((row) => row.user_id))]
  let profiles = []
  if (userIds.length) {
    const { data, error: profileError } = await admin
      .from('profiles')
      .select('id, name, handle, avatar, slug, verified')
      .in('id', userIds)
    if (profileError) throw profileError
    profiles = data || []
  }
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))

  let viewerReports = new Set()
  let reportCounts = new Map()
  if (viewer && rows?.length) {
    const commentIds = rows.map((row) => row.id)
    const { data: reports, error: reportError } = await admin
      .from('comment_reports')
      .select('comment_id, user_id')
      .in('comment_id', commentIds)
    if (reportError) throw reportError
    viewerReports = new Set((reports || [])
      .filter((report) => report.user_id === viewer.id)
      .map((report) => report.comment_id))
    if (viewer.id === thesis.user_id) {
      reportCounts = (reports || []).reduce((counts, report) => {
        counts.set(report.comment_id, (counts.get(report.comment_id) || 0) + 1)
        return counts
      }, new Map())
    }
  }

  return (rows || []).map((row) => {
    const profile = profileById.get(row.user_id) || {}
    const visible = row.status === 'visible'
    return {
      id: row.id,
      thesisId: row.thesis_id,
      userId: row.user_id,
      parentId: row.parent_id,
      body: visible ? row.body : '',
      status: row.status,
      createdAt: row.created_at,
      author: profile.name || 'Analyst',
      handle: profile.handle || '',
      avatar: profile.avatar || '',
      authorSlug: profile.slug || '',
      verified: profile.verified === true,
      canRemove: visible && Boolean(viewer && (viewer.id === row.user_id || viewer.id === thesis.user_id)),
      canReport: visible && Boolean(viewer && viewer.id !== row.user_id),
      reportedByViewer: viewerReports.has(row.id),
      reportCount: reportCounts.get(row.id) || 0,
    }
  })
}

export async function createThesisComment(value, input) {
  const thesisId = normalizeId(value, 'thesis')
  const { user } = await requireUserContext()
  const admin = createAdminClient()
  await publishedThesis(admin, thesisId)

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: countError } = await admin
    .from('thesis_comments')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)
  if (countError) throw countError
  if ((count || 0) >= 20) fail('comment limit reached; try again later', 429)

  const { data, error } = await admin
    .from('thesis_comments')
    .insert({
      thesis_id: thesisId,
      user_id: user.id,
      parent_id: input.parentId,
      body: input.body,
    })
    .select('id, created_at')
    .single()
  if (error) {
    if (/reply_|cannot_reply|comments_require/i.test(error.message || '')) fail('comment thread is no longer available', 409)
    throw error
  }
  return { id: data.id, createdAt: data.created_at }
}

export async function removeThesisComment(value) {
  const commentId = normalizeId(value, 'comment')
  const { user } = await requireUserContext()
  const admin = createAdminClient()
  const { data: comment, error } = await admin
    .from('thesis_comments')
    .select('id, user_id, thesis_id, status')
    .eq('id', commentId)
    .maybeSingle()
  if (error) throw error
  if (!comment) fail('comment not found', 404)
  if (comment.status === 'removed') return { id: commentId, removed: true }

  const { data: thesis, error: thesisError } = await admin
    .from('theses')
    .select('user_id')
    .eq('id', comment.thesis_id)
    .maybeSingle()
  if (thesisError) throw thesisError
  if (comment.user_id !== user.id && thesis?.user_id !== user.id) fail('not allowed to remove this comment', 403)

  const { error: updateError } = await admin
    .from('thesis_comments')
    .update({ status: 'removed', removed_by: user.id, removed_at: new Date().toISOString() })
    .eq('id', commentId)
  if (updateError) throw updateError
  return { id: commentId, removed: true }
}

export async function reportThesisComment(value, input) {
  const commentId = normalizeId(value, 'comment')
  const { user } = await requireUserContext()
  const admin = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: countError } = await admin
    .from('comment_reports')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)
  if (countError) throw countError
  if ((count || 0) >= 20) fail('report limit reached; try again later', 429)

  const { data: existing, error: existingError } = await admin
    .from('comment_reports')
    .select('id')
    .eq('comment_id', commentId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return { commentId, reported: true }

  const { error } = await admin.from('comment_reports').insert({
    comment_id: commentId,
    user_id: user.id,
    reason: input.reason,
    details: input.details,
  })
  if (error) {
    if (/comment_cannot_be_reported/i.test(error.message || '')) fail('comment cannot be reported', 409)
    throw error
  }
  return { commentId, reported: true }
}
