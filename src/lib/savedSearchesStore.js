import 'server-only'
import { requireUserContext } from './auth.js'

const savedSearchId = (value) => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error('invalid saved search id')
    error.status = 400
    throw error
  }
  return id
}

const hydrate = (row) => ({
  id: row.id,
  name: row.name,
  filters: {
    query: row.query || '',
    sector: row.sector || 'all',
    side: row.side || 'all',
    status: row.thesis_status || 'all',
    published: row.published_period || 'all',
    performance: row.performance || 'all',
    sort: row.sort || 'trending',
  },
  notifyEnabled: row.notify_enabled !== false,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const columns = 'id, name, query, sector, side, thesis_status, published_period, performance, sort, notify_enabled, created_at, updated_at'

function stored(userId, input) {
  return {
    user_id: userId,
    name: input.name,
    query: input.filters.query,
    sector: input.filters.sector,
    side: input.filters.side,
    thesis_status: input.filters.status,
    published_period: input.filters.published,
    performance: input.filters.performance,
    sort: input.filters.sort,
    notify_enabled: input.notifyEnabled,
  }
}

function mapError(error) {
  const mapped = new Error(error?.message || 'saved search operation failed')
  if (error?.code === '42P01' || error?.code === 'PGRST205') {
    mapped.message = 'saved searches are not configured; apply the latest Supabase migration'
    mapped.status = 503
  } else if (error?.code === '23505') {
    mapped.message = 'a saved search already uses that name'
    mapped.status = 409
  } else if (/saved_search_limit_reached/i.test(mapped.message)) {
    mapped.message = 'no more than 20 saved searches are allowed'
    mapped.status = 409
  }
  throw mapped
}

export async function listSavedSearches() {
  const { supabase, user } = await requireUserContext()
  const { data, error } = await supabase
    .from('saved_searches')
    .select(columns)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) mapError(error)
  return (data || []).map(hydrate)
}

export async function createSavedSearch(input) {
  const { supabase, user } = await requireUserContext()
  const { data, error } = await supabase
    .from('saved_searches')
    .insert(stored(user.id, input))
    .select(columns)
    .single()
  if (error) mapError(error)
  return hydrate(data)
}

export async function updateSavedSearch(value, input) {
  const { supabase, user } = await requireUserContext()
  const payload = stored(user.id, input)
  delete payload.user_id
  const { data, error } = await supabase
    .from('saved_searches')
    .update(payload)
    .eq('id', savedSearchId(value))
    .eq('user_id', user.id)
    .select(columns)
    .maybeSingle()
  if (error) mapError(error)
  return data ? hydrate(data) : null
}

export async function deleteSavedSearch(value) {
  const { supabase, user } = await requireUserContext()
  const { data, error } = await supabase
    .from('saved_searches')
    .delete()
    .eq('id', savedSearchId(value))
    .eq('user_id', user.id)
    .select('id')
  if (error) mapError(error)
  return Boolean(data?.length)
}
