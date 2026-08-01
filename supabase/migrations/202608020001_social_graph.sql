begin;

create table if not exists public.analyst_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint analyst_follows_no_self check (follower_id <> followed_id)
);

create index if not exists analyst_follows_followed_idx
  on public.analyst_follows (followed_id, created_at desc);

create table if not exists public.thesis_bookmarks (
  user_id uuid not null references auth.users (id) on delete cascade,
  thesis_id bigint not null references public.theses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, thesis_id)
);

create index if not exists thesis_bookmarks_thesis_idx
  on public.thesis_bookmarks (thesis_id, created_at desc);

create or replace function public.enforce_public_thesis_bookmark()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.theses
    where id = new.thesis_id and status in ('active', 'closed')
  ) then
    raise exception using errcode = '23514', message = 'bookmarks_require_published_thesis';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_public_thesis_bookmark on public.thesis_bookmarks;
create trigger enforce_public_thesis_bookmark
before insert or update on public.thesis_bookmarks
for each row execute function public.enforce_public_thesis_bookmark();

alter table public.analyst_follows enable row level security;
alter table public.thesis_bookmarks enable row level security;

drop policy if exists "Users manage their own analyst follows" on public.analyst_follows;
create policy "Users manage their own analyst follows"
  on public.analyst_follows for all
  to authenticated
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);

drop policy if exists "Users manage their own thesis bookmarks" on public.thesis_bookmarks;
create policy "Users manage their own thesis bookmarks"
  on public.thesis_bookmarks for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.analyst_follows from public, anon, authenticated;
grant select, insert, delete on public.analyst_follows to authenticated;
revoke all on public.thesis_bookmarks from public, anon, authenticated;
grant select, insert, delete on public.thesis_bookmarks to authenticated;

-- Social notifications use distinct types so the client can explain why the
-- recipient received them. The original owner-only lifecycle types remain.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'publication_completed', 'close_completed', 'trigger_clear',
  'trigger_warning', 'trigger_breached', 'action_required',
  'followed_publication', 'thesis_update', 'watched_close', 'watched_trigger'
));

create or replace function public.social_recipients(p_thesis_id bigint, p_owner_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select follows.follower_id
  from public.analyst_follows follows
  where follows.followed_id = p_owner_id
  union
  select bookmarks.user_id
  from public.thesis_bookmarks bookmarks
  where bookmarks.thesis_id = p_thesis_id;
$$;

create or replace function public.notify_new_public_thesis()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  analyst_name text;
  thesis_label text;
begin
  if new.status not in ('active', 'closed') then return new; end if;

  select coalesce(nullif(name, ''), 'An analyst') into analyst_name
  from public.profiles where id = new.user_id;
  analyst_name := coalesce(analyst_name, 'An analyst');
  thesis_label := coalesce(nullif(new.data ->> 'ticker', ''), 'A thesis');

  insert into public.notifications (user_id, type, title, message, thesis_id, event_key)
  select
    follows.follower_id,
    'followed_publication',
    format('%s published a thesis', analyst_name),
    format('%s: %s', thesis_label, coalesce(nullif(new.data ->> 'title', ''), 'New investment thesis')),
    new.id,
    format('social:publication:%s:%s', new.id, follows.follower_id)
  from public.analyst_follows follows
  where follows.followed_id = new.user_id
    and follows.follower_id <> new.user_id
  on conflict (event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists notify_new_public_thesis on public.theses;
create trigger notify_new_public_thesis
after insert on public.theses
for each row execute function public.notify_new_public_thesis();

create or replace function public.notify_social_thesis_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  analyst_name text;
  thesis_label text;
  old_updates integer;
  new_updates integer;
begin
  select coalesce(nullif(name, ''), 'An analyst') into analyst_name
  from public.profiles where id = new.user_id;
  analyst_name := coalesce(analyst_name, 'An analyst');
  thesis_label := coalesce(nullif(new.data ->> 'ticker', ''), 'Thesis');

  if old.status is distinct from new.status and new.status = 'closed' then
    insert into public.notifications (user_id, type, title, message, thesis_id, event_key)
    select
      recipients.user_id,
      'watched_close',
      format('%s closed a thesis', analyst_name),
      format('%s is now closed with its final performance sealed.', thesis_label),
      new.id,
      format('social:close:%s:%s', new.id, recipients.user_id)
    from public.social_recipients(new.id, new.user_id) recipients
    where recipients.user_id <> new.user_id
    on conflict (event_key) do nothing;
  end if;

  old_updates := case when jsonb_typeof(old.data -> 'updateLog') = 'array'
    then jsonb_array_length(old.data -> 'updateLog') else 0 end;
  new_updates := case when jsonb_typeof(new.data -> 'updateLog') = 'array'
    then jsonb_array_length(new.data -> 'updateLog') else 0 end;

  if new_updates > old_updates then
    insert into public.notifications (user_id, type, title, message, thesis_id, event_key)
    select
      recipients.user_id,
      'thesis_update',
      format('%s posted a thesis update', analyst_name),
      format('%s has a new timestamped update.', thesis_label),
      new.id,
      format('social:update:%s:%s:%s', new.id, new_updates, recipients.user_id)
    from public.social_recipients(new.id, new.user_id) recipients
    where recipients.user_id <> new.user_id
    on conflict (event_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_social_thesis_change on public.theses;
create trigger notify_social_thesis_change
after update on public.theses
for each row execute function public.notify_social_thesis_change();

-- Trigger transitions already create an owner notification. Fan that event out
-- to followers and bookmarkers; the recipient union prevents duplicate alerts.
create or replace function public.notify_social_trigger_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  thesis_row public.theses%rowtype;
  analyst_name text;
  social_title text;
begin
  if new.type not in ('trigger_clear', 'trigger_warning', 'trigger_breached')
    or new.thesis_id is null then
    return new;
  end if;

  select * into thesis_row from public.theses where id = new.thesis_id;
  if not found or thesis_row.user_id <> new.user_id then return new; end if;
  select coalesce(nullif(name, ''), 'An analyst') into analyst_name
  from public.profiles where id = thesis_row.user_id;
  analyst_name := coalesce(analyst_name, 'An analyst');
  social_title := case new.type
    when 'trigger_breached' then 'Thesis trigger breached'
    when 'trigger_warning' then 'Thesis trigger warning'
    else 'Thesis trigger cleared'
  end;

  insert into public.notifications (user_id, type, title, message, thesis_id, event_key)
  select
    recipients.user_id,
    'watched_trigger',
    social_title,
    format('%s · %s', analyst_name, new.message),
    new.thesis_id,
    format('social:%s:%s', new.event_key, recipients.user_id)
  from public.social_recipients(new.thesis_id, thesis_row.user_id) recipients
  where recipients.user_id <> thesis_row.user_id
  on conflict (event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists notify_social_trigger_transition on public.notifications;
create trigger notify_social_trigger_transition
after insert on public.notifications
for each row execute function public.notify_social_trigger_transition();

revoke all on function public.social_recipients(bigint, uuid) from public, anon, authenticated;
revoke all on function public.enforce_public_thesis_bookmark() from public, anon, authenticated;
revoke all on function public.notify_new_public_thesis() from public, anon, authenticated;
revoke all on function public.notify_social_thesis_change() from public, anon, authenticated;
revoke all on function public.notify_social_trigger_transition() from public, anon, authenticated;

commit;
