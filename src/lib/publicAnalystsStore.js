import 'server-only'
import { createAdminClient } from './supabase/admin.js'
import { listPublicThesesByOwner } from './publicThesesStore.js'
import { makeRetOf, selfStats } from './stats.js'

const SLUG = /^[a-z0-9][a-z0-9-]{32,79}$/

export async function getPublicAnalystBySlug(value) {
  const slug = String(value || '').toLowerCase()
  if (!SLUG.test(slug)) return null

  const admin = createAdminClient()
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, name, handle, avatar, bio, location, joined_at, verified, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  if (!profile) return null

  const countResult = await admin
    .from('analyst_follows')
    .select('*', { count: 'exact', head: true })
    .eq('followed_id', profile.id)
  const theses = await listPublicThesesByOwner(profile.id)
  return {
    userId: profile.id,
    name: profile.name || 'Analyst',
    handle: profile.handle || '',
    avatar: profile.avatar || '—',
    bio: profile.bio || '',
    location: profile.location || '',
    joinedAt: profile.joined_at || null,
    verified: profile.verified === true,
    slug: profile.slug,
    followerCount: countResult.error ? 0 : (countResult.count || 0),
    theses,
    stats: selfStats(theses, makeRetOf(null)),
  }
}
