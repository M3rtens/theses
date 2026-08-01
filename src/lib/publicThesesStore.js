import 'server-only'
import { createAdminClient } from './supabase/admin.js'
import { createPublicClient } from './supabase/public.js'
import { hydrateProjectedThesis } from './publicTheses.js'
import { sanitizeThesisHtml } from './html.js'

const missingProjection = (error) => ['42P01', 'PGRST205'].includes(error?.code)
  || /published_theses/i.test(error?.message || '')
const PUBLIC_READ_BATCH_SIZE = 500

async function readAllPages(queryPage) {
  const rows = []
  let expected = Number.POSITIVE_INFINITY
  while (rows.length < expected) {
    const result = await queryPage(rows.length, rows.length + PUBLIC_READ_BATCH_SIZE - 1)
    if (result.error) return result
    const page = result.data || []
    rows.push(...page)
    if (Number.isSafeInteger(result.count)) expected = result.count
    if (!page.length || (result.count == null && page.length < PUBLIC_READ_BATCH_SIZE)) break
  }
  return { data: rows, error: null }
}

function normalizePublicThesisId(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function hydrateLegacyThesis(row, profile = {}) {
  return {
    ...row.data,
    id: row.id,
    ownerId: row.user_id,
    status: row.status || row.data?.status || 'active',
    createdAt: row.data?.createdAt || row.created_at,
    body: sanitizeThesisHtml(row.data?.body),
    author: profile.name || 'Analyst',
    handle: profile.handle || '',
    authorAvatar: profile.avatar || '',
    authorSlug: profile.slug || '',
  }
}

export async function listPublicTheses() {
  const publicClient = createPublicClient()
  const projected = await readAllPages((from, to) => publicClient
    .from('published_theses')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to))

  if (!projected.error) return (projected.data || []).map(hydrateProjectedThesis)
  if (!missingProjection(projected.error)) throw projected.error

  // Additive rollout fallback: older development/preview databases continue to
  // work until the migration is applied. Production uses the restricted view.
  const admin = createAdminClient()
  const [thesesResult, profilesResult] = await Promise.all([
    readAllPages((from, to) => admin
      .from('theses')
      .select('id, user_id, data, status, created_at', { count: 'exact' })
      .in('status', ['active', 'closed'])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)),
    readAllPages((from, to) => admin
      .from('profiles')
      .select('id, name, handle, avatar', { count: 'exact' })
      .order('id', { ascending: true })
      .range(from, to)),
  ])
  if (thesesResult.error) throw thesesResult.error
  if (profilesResult.error) throw profilesResult.error

  const profileById = Object.fromEntries((profilesResult.data || []).map((profile) => [profile.id, profile]))
  return (thesesResult.data || []).map((row) => hydrateLegacyThesis(row, profileById[row.user_id]))
}

export async function getPublicThesisById(value) {
  const id = normalizePublicThesisId(value)
  if (!id) return null

  const publicClient = createPublicClient()
  const projected = await publicClient
    .from('published_theses')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!projected.error) return projected.data ? hydrateProjectedThesis(projected.data) : null
  if (!missingProjection(projected.error)) throw projected.error

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('theses')
    .select('id, user_id, data, status, created_at')
    .eq('id', id)
    .in('status', ['active', 'closed'])
    .maybeSingle()
  if (error) throw error
  if (!row) return null

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('name, handle, avatar')
    .eq('id', row.user_id)
    .maybeSingle()
  if (profileError) throw profileError
  return hydrateLegacyThesis(row, profile)
}

export async function listPublicThesesByOwner(ownerId) {
  const publicClient = createPublicClient()
  const projected = await publicClient
    .from('published_theses')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (!projected.error) return (projected.data || []).map(hydrateProjectedThesis)
  if (!missingProjection(projected.error)) throw projected.error
  return (await listPublicTheses()).filter((thesis) => thesis.ownerId === ownerId)
}
