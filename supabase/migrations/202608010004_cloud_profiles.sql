begin;

alter table public.profiles
  add column if not exists bio text not null default '',
  add column if not exists location text not null default '',
  add column if not exists joined_at timestamptz not null default now(),
  add column if not exists verified boolean not null default false;

-- Replace the provisional row timestamp with the authoritative Auth account
-- creation time for every existing profile.
update public.profiles as profile
set joined_at = auth_user.created_at
from auth.users as auth_user
where auth_user.id = profile.id
  and profile.joined_at is distinct from auth_user.created_at;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profile_bio_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profile_bio_length check (char_length(bio) <= 280);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profile_location_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profile_location_length check (char_length(location) <= 100);
  end if;
end;
$$;

create or replace function public.enforce_profile_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  account_created_at timestamptz;
  request_role text := coalesce(auth.role(), '');
begin
  if tg_op = 'INSERT' then
    select created_at into account_created_at
    from auth.users
    where id = new.id;

    if account_created_at is null then
      raise exception using errcode = '23503', message = 'profile_auth_user_not_found';
    end if;
    new.joined_at := account_created_at;
    new.verified := false;
  else
    if new.id is distinct from old.id then
      raise exception using errcode = '23514', message = 'profile_owner_is_immutable';
    end if;
    if new.joined_at is distinct from old.joined_at then
      raise exception using errcode = '23514', message = 'profile_joined_at_is_immutable';
    end if;
    if new.verified is distinct from old.verified
      and request_role <> 'service_role'
      and session_user not in ('postgres', 'supabase_admin') then
      raise exception using errcode = '42501', message = 'profile_verification_is_server_managed';
    end if;
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists enforce_profile_integrity on public.profiles;
create trigger enforce_profile_integrity
before insert or update on public.profiles
for each row execute function public.enforce_profile_integrity();

-- Owners may edit presentation fields, but cannot self-assign verification or
-- rewrite their account creation date. RLS continues to scope rows by auth.uid().
revoke update on public.profiles from authenticated;
grant update (id, name, handle, avatar, bio, location, updated_at) on public.profiles to authenticated;

revoke all on function public.enforce_profile_integrity() from public, anon, authenticated;

commit;
