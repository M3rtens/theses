begin;

-- Citations already live inside the sealed thesis JSON document. Append only
-- the explicit structured field to the least-privilege public projection.
create or replace view public.published_theses as
select
  t.id,
  t.user_id as owner_id,
  t.created_at,
  t.version,
  t.status,
  t.data ->> 'title' as title,
  t.data ->> 'ticker' as ticker,
  t.data ->> 'company' as company,
  t.data ->> 'side' as side,
  t.data ->> 'sector' as sector,
  t.data ->> 'publishDate' as publish_date,
  t.data ->> 'entryDate' as entry_date,
  t.data -> 'daysActive' as days_active,
  t.data -> 'entry' as entry,
  t.data -> 'current' as current_price,
  t.data -> 'ret' as return_pct,
  t.data -> 'updates' as updates,
  t.data -> 'triggers' as triggers,
  t.data ->> 'currency' as currency,
  t.data ->> 'resolvedSymbol' as resolved_symbol,
  t.data ->> 'exchange' as exchange,
  t.data ->> 'body' as body,
  t.data -> 'model' as model,
  t.data ->> 'createdAt' as thesis_created_at,
  t.data ->> 'closeDate' as close_date,
  t.data ->> 'closedAt' as closed_at,
  t.data -> 'closePrice' as close_price,
  t.data -> 'closeReturn' as close_return,
  t.data -> 'updateLog' as update_log,
  p.name as author_name,
  p.handle as author_handle,
  p.avatar as author_avatar,
  t.last_refreshed_at,
  p.slug as author_slug,
  t.data -> 'citations' as citations
from public.theses t
left join public.profiles p on p.id = t.user_id
where t.status in ('active', 'closed');

revoke all on public.published_theses from public;
grant select on public.published_theses to anon, authenticated, service_role;

commit;
