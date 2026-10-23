-- Brackets and ranked nominations.

create type public.bracket_phase as enum ('draft', 'nominations', 'review', 'live', 'complete');

create table public.brackets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 80),
  description text check (description is null or length(description) <= 280),
  phase public.bracket_phase not null default 'draft',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  nominations_opened_at timestamptz,
  nominations_closed_at timestamptz,
  locked_at timestamptz,
  completed_at timestamptz,
  -- Set when Harry starts the next bracket. Archived brackets are read-only history.
  archived_at timestamptz
);

-- Only one active (non-archived) bracket at a time.
create unique index brackets_one_active on public.brackets ((true)) where archived_at is null;

create table public.nominations (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  rank smallint not null check (rank between 1 and 15),
  text text not null check (length(trim(text)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (bracket_id, user_id, rank)
);

create index nominations_bracket_idx on public.nominations (bracket_id);

alter table public.brackets enable row level security;
alter table public.nominations enable row level security;

revoke all on public.brackets, public.nominations from anon, authenticated;
grant select on public.brackets, public.nominations to authenticated;

create policy "brackets readable by signed-in users"
  on public.brackets for select to authenticated
  using (true);

-- Blind until close: your own list always; everyone's once the bracket has left the nominations phase.
create policy "own nominations, or all once closed"
  on public.nominations for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.brackets b
      where b.id = bracket_id and b.phase not in ('draft', 'nominations')
    )
  );

-- No write policies: nominations change only via save_nominations().

-- ---------------------------------------------------------------------------
-- Helpers

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.require_admin() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Nominations

-- Replaces the caller's whole ranked list (index 1 = rank 1). Empty array clears it.
create or replace function public.save_nominations(p_bracket_id uuid, p_items text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_phase public.bracket_phase;
  v_items text[];
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  select phase into v_phase from public.brackets where id = p_bracket_id for share;
  if v_phase is distinct from 'nominations' then
    raise exception 'Nominations are not open' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(trim(t) order by ord), '{}')
    into v_items
    from unnest(coalesce(p_items, '{}')) with ordinality as u(t, ord);

  if cardinality(v_items) > 15 then
    raise exception 'At most 15 nominations' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_items) t where length(t) = 0) then
    raise exception 'Nominations cannot be blank' using errcode = 'P0001';
  end if;

  delete from public.nominations where bracket_id = p_bracket_id and user_id = auth.uid();
  insert into public.nominations (bracket_id, user_id, rank, text)
    select p_bracket_id, auth.uid(), ord, t
    from unnest(v_items) with ordinality as u(t, ord);
end;
$$;

revoke all on function public.save_nominations(uuid, text[]) from public, anon;
grant execute on function public.save_nominations(uuid, text[]) to authenticated;

-- "5 of 8 have submitted": counts only, no names or content.
create or replace function public.nomination_progress(p_bracket_id uuid)
returns table (submitted int, total int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(distinct n.user_id)::int
       from public.nominations n
       join public.profiles p on p.id = n.user_id and p.active
      where n.bracket_id = p_bracket_id),
    (select count(*)::int from public.profiles where active);
$$;

revoke all on function public.nomination_progress(uuid) from public, anon;
grant execute on function public.nomination_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: bracket lifecycle

create or replace function public.create_bracket(p_title text, p_description text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_active public.brackets;
  v_id uuid;
begin
  perform public.require_admin();

  select * into v_active from public.brackets where archived_at is null for update;
  if found then
    if v_active.phase <> 'complete' then
      raise exception 'Finish the current bracket before starting a new one' using errcode = 'P0001';
    end if;
    update public.brackets set archived_at = now() where id = v_active.id;
  end if;

  insert into public.brackets (title, description, created_by)
    values (trim(p_title), nullif(trim(p_description), ''), auth.uid())
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_bracket(p_bracket_id uuid, p_title text, p_description text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.brackets
     set title = trim(p_title), description = nullif(trim(p_description), '')
   where id = p_bracket_id and archived_at is null;
  if not found then
    raise exception 'Bracket not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Draft brackets can be thrown away entirely.
create or replace function public.delete_draft_bracket(p_bracket_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  delete from public.brackets where id = p_bracket_id and phase = 'draft';
  if not found then
    raise exception 'Only draft brackets can be deleted' using errcode = 'P0001';
  end if;
end;
$$;

-- Manual phase moves handled here: open nominations, close them, or reopen (before seeding is locked).
-- Locking (review -> live) and completion are done by dedicated RPCs in later migrations.
create or replace function public.set_bracket_phase(p_bracket_id uuid, p_to public.bracket_phase)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_from public.bracket_phase;
begin
  perform public.require_admin();
  select phase into v_from from public.brackets
   where id = p_bracket_id and archived_at is null for update;
  if not found then
    raise exception 'Bracket not found' using errcode = 'P0002';
  end if;

  if (v_from, p_to) not in (
    ('draft'::public.bracket_phase, 'nominations'::public.bracket_phase),
    ('nominations', 'review'),
    ('review', 'nominations')
  ) then
    raise exception 'Cannot move bracket from % to %', v_from, p_to using errcode = 'P0001';
  end if;

  update public.brackets
     set phase = p_to,
         nominations_opened_at = case when p_to = 'nominations' then coalesce(nominations_opened_at, now()) else nominations_opened_at end,
         nominations_closed_at = case when p_to = 'review' then now() when p_to = 'nominations' then null else nominations_closed_at end
   where id = p_bracket_id;
end;
$$;

revoke all on function public.create_bracket(text, text) from public, anon;
revoke all on function public.update_bracket(uuid, text, text) from public, anon;
revoke all on function public.delete_draft_bracket(uuid) from public, anon;
revoke all on function public.set_bracket_phase(uuid, public.bracket_phase) from public, anon;
grant execute on function public.create_bracket(text, text) to authenticated;
grant execute on function public.update_bracket(uuid, text, text) to authenticated;
grant execute on function public.delete_draft_bracket(uuid) to authenticated;
grant execute on function public.set_bracket_phase(uuid, public.bracket_phase) to authenticated;
