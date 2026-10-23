-- Supabase grants anon/authenticated EXECUTE on new functions by default. Make it opt-in instead:
-- every function in this project grants exactly the roles that need it.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Profiles: one per auth user. Created only by the seed script / admin-users Edge Function (service role).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username = lower(username) and username ~ '^[a-z][a-z0-9_-]{1,23}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  is_admin boolean not null default false,
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Signed-in users can see everyone's profile (names appear throughout the app). Anonymous users see nothing.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create policy "profiles readable by signed-in users"
  on public.profiles for select
  to authenticated
  using (true);

-- No insert/update/delete policies: clients cannot change profiles directly.

-- True when the caller is an active admin. Security definer so policies can use it without recursion.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin and p.active from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Called by the client right after a successful password change to lift the forced-change gate.
create or replace function public.complete_password_change()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

revoke all on function public.complete_password_change() from public, anon;
grant execute on function public.complete_password_change() to authenticated;
