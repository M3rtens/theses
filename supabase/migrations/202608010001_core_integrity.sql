begin;

alter table public.theses
  add column if not exists version bigint not null default 0;

create index if not exists theses_user_created_idx
  on public.theses (user_id, created_at desc, id desc);

create index if not exists theses_status_created_idx
  on public.theses (status, created_at desc, id desc);

create or replace function public.thesis_sealed_snapshot(payload jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    (coalesce(payload, '{}'::jsonb) - array[
      'current', 'ret', 'daysActive', 'updates', 'updateLog', 'status',
      'closeDate', 'closedAt', 'closePrice', 'closeReturn', 'triggers'
    ])
    || jsonb_build_object(
      'triggers',
      coalesce(
        (
          select jsonb_agg(item - 's' order by ordinal)
          from jsonb_array_elements(
            case
              when jsonb_typeof(payload -> 'triggers') = 'array' then payload -> 'triggers'
              else '[]'::jsonb
            end
          ) with ordinality as trigger_rows(item, ordinal)
        ),
        '[]'::jsonb
      )
    );
$$;

create or replace function public.enforce_thesis_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception using errcode = '23514', message = 'thesis_owner_is_immutable';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception using errcode = '23514', message = 'thesis_created_at_is_immutable';
  end if;

  if public.thesis_sealed_snapshot(new.data) is distinct from public.thesis_sealed_snapshot(old.data) then
    raise exception using errcode = '23514', message = 'published_thesis_fields_are_immutable';
  end if;

  if coalesce(new.data ->> 'status', new.status) not in ('active', 'closed', 'scheduled') then
    raise exception using errcode = '23514', message = 'invalid_thesis_status';
  end if;

  new.status := coalesce(new.data ->> 'status', new.status);
  return new;
end;
$$;

drop trigger if exists enforce_thesis_integrity on public.theses;
create trigger enforce_thesis_integrity
before update on public.theses
for each row execute function public.enforce_thesis_integrity();

alter table public.theses enable row level security;
alter table public.profiles enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename in ('theses', 'profiles')
  loop
    execute format(
      'drop policy %I on public.%I',
      policy_record.policyname,
      policy_record.tablename
    );
  end loop;
end;
$$;

create policy "Users can read their own theses"
  on public.theses for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke all on public.profiles from public, anon;
revoke delete, truncate, references, trigger on public.profiles from authenticated;
grant select, insert, update on public.profiles to authenticated;

revoke all on public.theses from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.theses from authenticated;
grant select on public.theses to authenticated;

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
  p.avatar as author_avatar
from public.theses t
left join public.profiles p on p.id = t.user_id
where t.status in ('active', 'closed');

revoke all on public.published_theses from public;
grant select on public.published_theses to anon, authenticated, service_role;

create or replace function public.append_thesis_update(
  p_thesis_id bigint,
  p_user_id uuid,
  p_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  thesis_row public.theses%rowtype;
  update_log jsonb;
  next_id bigint;
  update_record jsonb;
begin
  if p_text is null or length(btrim(p_text)) = 0 or length(p_text) > 5000 then
    raise exception using errcode = '22023', message = 'invalid_update_text';
  end if;

  select * into thesis_row
  from public.theses
  where id = p_thesis_id and user_id = p_user_id
  for update;

  if not found then return null; end if;

  update_log := case
    when jsonb_typeof(thesis_row.data -> 'updateLog') = 'array' then thesis_row.data -> 'updateLog'
    else '[]'::jsonb
  end;

  select coalesce(max((item ->> 'id')::bigint), 0) + 1
  into next_id
  from jsonb_array_elements(update_log) as rows(item)
  where item ->> 'id' ~ '^\d+$';

  update_record := jsonb_build_object(
    'id', next_id,
    'text', p_text,
    'at', clock_timestamp()
  );

  update public.theses
  set data = jsonb_set(
        jsonb_set(thesis_row.data, '{updateLog}', update_log || jsonb_build_array(update_record), true),
        '{updates}', to_jsonb(jsonb_array_length(update_log) + 1), true
      ),
      version = version + 1
  where id = p_thesis_id and user_id = p_user_id;

  return update_record;
end;
$$;

create or replace function public.schedule_thesis_close(
  p_thesis_id bigint,
  p_user_id uuid,
  p_close_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  thesis_row public.theses%rowtype;
  updated_data jsonb;
begin
  if p_close_date is null or p_close_date <= current_date then
    raise exception using errcode = '22007', message = 'close_date_must_be_future';
  end if;

  select * into thesis_row
  from public.theses
  where id = p_thesis_id and user_id = p_user_id
  for update;

  if not found then return null; end if;
  if thesis_row.status = 'closed' then
    raise exception using errcode = 'P0001', message = 'thesis_already_closed';
  end if;
  if thesis_row.data ? 'closeDate' and nullif(thesis_row.data ->> 'closeDate', '') is not null then
    raise exception using errcode = 'P0001', message = 'close_date_already_set';
  end if;

  updated_data := jsonb_set(thesis_row.data, '{closeDate}', to_jsonb(p_close_date::text), true);
  update public.theses
  set data = updated_data, version = version + 1
  where id = p_thesis_id and user_id = p_user_id;

  return updated_data || jsonb_build_object('id', thesis_row.id, 'ownerId', thesis_row.user_id);
end;
$$;

create or replace function public.close_thesis(
  p_thesis_id bigint,
  p_user_id uuid,
  p_close_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  thesis_row public.theses%rowtype;
  entry_price numeric;
  close_return numeric;
  active_days integer;
  closed_at timestamptz := clock_timestamp();
  updated_data jsonb;
begin
  select * into thesis_row
  from public.theses
  where id = p_thesis_id and user_id = p_user_id
  for update;

  if not found then return null; end if;
  if thesis_row.status = 'closed' then
    raise exception using errcode = 'P0001', message = 'thesis_already_closed';
  end if;
  if p_close_price is null or p_close_price <= 0 then
    raise exception using errcode = '22003', message = 'invalid_close_price';
  end if;

  entry_price := nullif(thesis_row.data ->> 'entry', '')::numeric;
  close_return := case
    when entry_price is null or entry_price = 0 then coalesce((thesis_row.data ->> 'ret')::numeric, 0)
    else round(
      (case when thesis_row.data ->> 'side' = 'bear' then -1 else 1 end)
      * ((p_close_price - entry_price) / entry_price) * 100,
      1
    )
  end;
  active_days := greatest(0, current_date - nullif(thesis_row.data ->> 'entryDate', '')::date);

  updated_data := thesis_row.data || jsonb_build_object(
    'status', 'closed',
    'closedAt', closed_at,
    'closePrice', p_close_price,
    'closeReturn', close_return,
    'current', p_close_price,
    'ret', close_return,
    'daysActive', active_days
  );

  update public.theses
  set data = updated_data, status = 'closed', version = version + 1
  where id = p_thesis_id and user_id = p_user_id;

  return updated_data || jsonb_build_object('id', thesis_row.id, 'ownerId', thesis_row.user_id);
end;
$$;

create or replace function public.update_thesis_metrics(
  p_thesis_id bigint,
  p_user_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  thesis_row public.theses%rowtype;
  updated_data jsonb;
begin
  if coalesce(p_patch, '{}'::jsonb) - array['current', 'ret', 'daysActive', 'triggers'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'unsupported_metrics_patch';
  end if;

  select * into thesis_row
  from public.theses
  where id = p_thesis_id and user_id = p_user_id
  for update;

  if not found or thesis_row.status = 'closed' then return null; end if;

  updated_data := thesis_row.data || coalesce(p_patch, '{}'::jsonb);
  update public.theses
  set data = updated_data, version = version + 1
  where id = p_thesis_id and user_id = p_user_id;

  return updated_data || jsonb_build_object('id', thesis_row.id, 'ownerId', thesis_row.user_id);
end;
$$;

revoke all on function public.append_thesis_update(bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.schedule_thesis_close(bigint, uuid, date) from public, anon, authenticated;
revoke all on function public.close_thesis(bigint, uuid, numeric) from public, anon, authenticated;
revoke all on function public.update_thesis_metrics(bigint, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.append_thesis_update(bigint, uuid, text) to service_role;
grant execute on function public.schedule_thesis_close(bigint, uuid, date) to service_role;
grant execute on function public.close_thesis(bigint, uuid, numeric) to service_role;
grant execute on function public.update_thesis_metrics(bigint, uuid, jsonb) to service_role;

commit;
