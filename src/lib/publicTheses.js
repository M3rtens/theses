import { sanitizeThesisHtml } from './html.js'

// Map the explicit published_theses database view back to the presentation
// shape used throughout the current UI. No opaque JSONB object crosses the
// public API boundary.
export function hydrateProjectedThesis(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title || '',
    ticker: row.ticker || '',
    company: row.company || '',
    side: row.side || 'bull',
    sector: row.sector || '',
    publishDate: row.publish_date || '',
    entryDate: row.entry_date || '',
    daysActive: Number(row.days_active ?? 0),
    entry: Number(row.entry ?? 0),
    current: Number(row.current_price ?? row.entry ?? 0),
    ret: Number(row.return_pct ?? 0),
    status: row.status || 'active',
    updates: Number(row.updates ?? 0),
    triggers: Array.isArray(row.triggers) ? row.triggers : [],
    currency: row.currency || '',
    resolvedSymbol: row.resolved_symbol || '',
    exchange: row.exchange || null,
    body: sanitizeThesisHtml(row.body),
    citations: Array.isArray(row.citations) ? row.citations : [],
    commentCount: Number(row.comment_count ?? 0),
    bookmarkCount: Number(row.bookmark_count ?? 0),
    model: row.model && typeof row.model === 'object' ? row.model : null,
    createdAt: row.thesis_created_at || row.created_at,
    closeDate: row.close_date || null,
    closedAt: row.closed_at || null,
    closePrice: row.close_price == null ? null : Number(row.close_price),
    closeReturn: row.close_return == null ? null : Number(row.close_return),
    updateLog: Array.isArray(row.update_log) ? row.update_log : [],
    author: row.author_name || 'Analyst',
    handle: row.author_handle || '',
    authorAvatar: row.author_avatar || '',
    authorSlug: row.author_slug || '',
    lastRefreshedAt: row.last_refreshed_at || null,
  }
}
