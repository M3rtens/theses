import 'server-only'
import { requireUserContext } from './auth.js'
import { createAdminClient } from './supabase/admin.js'
import { getPublicThesisById, listPublicThesesByIds } from './publicThesesStore.js'

const missingTarget = (label) => {
  const error = new Error(`${label} not found`)
  error.status = 404
  throw error
}

export async function listSocialWorkspace() {
  const { supabase, user } = await requireUserContext()
  const [followsResult, bookmarksResult] = await Promise.all([
    supabase
      .from('analyst_follows')
      .select('followed_id, created_at')
      .eq('follower_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('thesis_bookmarks')
      .select('thesis_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])
  if (followsResult.error) throw followsResult.error
  if (bookmarksResult.error) throw bookmarksResult.error

  const followRows = followsResult.data || []
  const bookmarkRows = bookmarksResult.data || []
  const followedIds = followRows.map((row) => row.followed_id)
  const admin = createAdminClient()
  let profiles = []
  if (followedIds.length) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, name, handle, avatar, bio, location, joined_at, verified, slug')
      .in('id', followedIds)
    if (error) throw error
    profiles = data || []
  }
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const following = followRows.flatMap((row) => {
    const profile = profileById.get(row.followed_id)
    return profile ? [{
      userId: profile.id,
      name: profile.name || 'Analyst',
      handle: profile.handle || '',
      avatar: profile.avatar || '',
      bio: profile.bio || '',
      location: profile.location || '',
      joinedAt: profile.joined_at || null,
      verified: profile.verified === true,
      slug: profile.slug || '',
      followedAt: row.created_at,
    }] : []
  })
  const bookmarks = await listPublicThesesByIds(bookmarkRows.map((row) => row.thesis_id))
  return { following, bookmarks }
}

export async function setSocialRelationship({ kind, targetId }, enabled) {
  const { supabase, user } = await requireUserContext()
  if (kind === 'follow') {
    if (targetId === user.id) {
      const error = new Error('you cannot follow yourself')
      error.status = 400
      throw error
    }
    const admin = createAdminClient()
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id')
      .eq('id', targetId)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile) missingTarget('analyst')
    const query = enabled
      ? supabase.from('analyst_follows').upsert(
        { follower_id: user.id, followed_id: targetId },
        { onConflict: 'follower_id,followed_id', ignoreDuplicates: true },
      )
      : supabase.from('analyst_follows').delete()
        .eq('follower_id', user.id).eq('followed_id', targetId)
    const { error } = await query
    if (error) throw error
    return { kind, targetId, enabled }
  }

  if (enabled && !(await getPublicThesisById(targetId))) missingTarget('thesis')
  const query = enabled
    ? supabase.from('thesis_bookmarks').upsert(
      { user_id: user.id, thesis_id: targetId },
      { onConflict: 'user_id,thesis_id', ignoreDuplicates: true },
    )
    : supabase.from('thesis_bookmarks').delete()
      .eq('user_id', user.id).eq('thesis_id', targetId)
  const { error } = await query
  if (error) throw error
  return { kind, targetId, enabled }
}
