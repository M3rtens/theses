import 'server-only'
import { requireUserContext } from './auth.js'
import { createAdminClient } from './supabase/admin.js'
import { deriveIdentity } from './user.js'

const migrationMissing = (error) => ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error?.code)
  || /relation .+profiles.+ does not exist|column .+(bio|location|joined_at|verified|slug).+ does not exist|schema cache.+profiles/i.test(error?.message || '')

function mapProfileError(error) {
  const mapped = new Error(migrationMissing(error)
    ? 'cloud profiles migration is not applied'
    : (error?.message || 'profile operation failed'))
  mapped.status = migrationMissing(error) ? 503 : undefined
  return mapped
}

function hydrateProfile(row, user) {
  return {
    bio: row?.bio || '',
    location: row?.location || '',
    joinedAt: row?.joined_at || user?.created_at || null,
    verified: row?.verified === true,
    slug: row?.slug || '',
    updatedAt: row?.updated_at || null,
  }
}

export async function getCloudProfile() {
  const { user } = await requireUserContext()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, bio, location, joined_at, verified, slug, updated_at')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw mapProfileError(error)
  return hydrateProfile(data, user)
}

export async function saveCloudProfile(profile) {
  const { user } = await requireUserContext()
  const identity = deriveIdentity(user)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .upsert({
      id: user.id,
      name: identity.name,
      handle: identity.handle,
      avatar: identity.avatar,
      bio: profile.bio,
      location: profile.location,
    }, { onConflict: 'id' })
    .select('id, bio, location, joined_at, verified, slug, updated_at')
    .single()
  if (error) throw mapProfileError(error)
  return hydrateProfile(data, user)
}
