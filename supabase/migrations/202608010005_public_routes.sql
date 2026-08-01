begin;

alter table public.profiles
  add column if not exists slug text;

create or replace function public.build_profile_slug(
  profile_handle text,
  profile_name text,
  profile_id uuid
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select left(
    coalesce(
      nullif(trim(both '-' from regexp_replace(
        lower(coalesce(nullif(ltrim(btrim(profile_handle), '@'), ''), nullif(btrim(profile_name), ''), 'analyst')),
        '[^a-z0-9]+', '-', 'g'
      )), ''),
      'analyst'
    ),
    40
  ) || '-' || replace(profile_id::text, '-', '');
$$;

update public.profiles
set slug = public.build_profile_slug(handle, name, id)
where slug is null or slug = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profile_slug_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profile_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{32,79}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_slug_unique'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_slug_unique unique (slug);
  end if;
end;
$$;

alter table public.profiles alter column slug set not null;

create or replace function public.enforce_profile_slug()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.slug := public.build_profile_slug(new.handle, new.name, new.id);
  elsif new.slug is distinct from old.slug then
    raise exception using errcode = '23514', message = 'profile_slug_is_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_slug on public.profiles;
create trigger enforce_profile_slug
before insert or update on public.profiles
for each row execute function public.enforce_profile_slug();

-- Add only the canonical analyst slug to the already-restricted public thesis
-- projection. Private bio/location fields remain outside this view.
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
  p.slug as author_slug
from public.theses t
left join public.profiles p on p.id = t.user_id
where t.status in ('active', 'closed');

revoke all on public.published_theses from public;
grant select on public.published_theses to anon, authenticated, service_role;

revoke all on function public.build_profile_slug(text, text, uuid) from public, anon, authenticated;
revoke all on function public.enforce_profile_slug() from public, anon, authenticated;

commit;
