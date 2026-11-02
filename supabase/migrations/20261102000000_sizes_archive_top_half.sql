-- Harry (2026-11-02):
--   1. Brackets of 8, 16, 32, 64 or 128 seeds (chosen per bracket; existing brackets are 64).
--   2. Archive a finished bracket without starting the next one.
--   3. Mystery seeds are dealt from the top half of the seeds.
--
-- Rounds are numbered by how many entries are left, on one scale for every size: round r holds 2^(7-r)
-- entries. 0 = R128, 1 = R64, 2 = R32, 3 = R16, 4 = QF, 5 = SF, 6 = final (slot 0) + third place (slot 1).
-- The final is always round 6 (as before) and a smaller bracket simply starts later, so existing data and
-- every "final / third place / semi-final" rule stay as they were. Stages are still one per round,
-- numbered from 1 in play order (stage = round - first round + 1).

alter table public.brackets
  add column size smallint not null default 64 check (size in (8, 16, 32, 64, 128));

alter table public.entries drop constraint entries_seed_check;
alter table public.entries add constraint entries_seed_check check (seed between 1 and 128);
alter table public.stages drop constraint stages_round_check;
alter table public.stages add constraint stages_round_check check (round between 0 and 6);
alter table public.matchups drop constraint matchups_round_check;
alter table public.matchups add constraint matchups_round_check check (round between 0 and 6);

-- First round a bracket of this size plays. Mirrors firstRound() in src/lib/bracket.ts.
create or replace function public.first_round(p_size int)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_size when 128 then 0 when 64 then 1 when 32 then 2 when 16 then 3 when 8 then 4 end;
$$;

-- Stages are now numbered by lock_seeding from the bracket size; the old per-round helper is unused.
drop function public.stage_for(int, int);

-- ---------------------------------------------------------------------------
-- Create / edit with a size. The size can change until seeding is locked.

drop function public.create_bracket(text, text);
create function public.create_bracket(p_title text, p_description text default null, p_size int default 64)
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
  if p_size is null or p_size not in (8, 16, 32, 64, 128) then
    raise exception 'Bracket size must be 8, 16, 32, 64 or 128' using errcode = 'P0001';
  end if;

  select * into v_active from public.brackets where archived_at is null for update;
  if found then
    if v_active.phase <> 'complete' then
      raise exception 'Finish the current bracket before starting a new one' using errcode = 'P0001';
    end if;
    update public.brackets set archived_at = now() where id = v_active.id;
  end if;

  insert into public.brackets (title, description, size, created_by)
    values (trim(p_title), nullif(trim(p_description), ''), p_size, auth.uid())
    returning id into v_id;
  return v_id;
end;
$$;

drop function public.update_bracket(uuid, text, text);
create function public.update_bracket(p_bracket_id uuid, p_title text, p_description text default null, p_size int default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.brackets;
begin
  perform public.require_admin();
  select * into v from public.brackets where id = p_bracket_id and archived_at is null for update;
  if not found then
    raise exception 'Bracket not found' using errcode = 'P0002';
  end if;
  if p_size is not null and p_size <> v.size then
    if p_size not in (8, 16, 32, 64, 128) then
      raise exception 'Bracket size must be 8, 16, 32, 64 or 128' using errcode = 'P0001';
    end if;
    if v.phase not in ('draft', 'nominations', 'review') then
      raise exception 'The bracket size is fixed once seeding is locked' using errcode = 'P0001';
    end if;
  end if;
  update public.brackets
     set title = trim(p_title), description = nullif(trim(p_description), ''), size = coalesce(p_size, size)
   where id = p_bracket_id;
end;
$$;

revoke all on function public.create_bracket(text, text, int) from public, anon;
revoke all on function public.update_bracket(uuid, text, text, int) from public, anon;
grant execute on function public.create_bracket(text, text, int) to authenticated;
grant execute on function public.update_bracket(uuid, text, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Archive a finished bracket now, without starting the next one.

create or replace function public.archive_bracket(p_bracket_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.brackets set archived_at = now()
   where id = p_bracket_id and archived_at is null and phase = 'complete';
  if not found then
    raise exception 'Only a finished bracket can be archived' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.archive_bracket(uuid) from public, anon;
grant execute on function public.archive_bracket(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Mystery seeds: one random entry from the top half of the seeds per active player. The pool only widens
-- (up to the whole bracket) when there are more players than top-half seeds, e.g. 8 players in an 8 bracket.

create or replace function public.assign_mystery_seeds(p_bracket_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_size int;
  v_players int;
  v_pool int;
  v_count int;
begin
  if exists (select 1 from public.mystery_seeds where bracket_id = p_bracket_id) then
    return 0;
  end if;
  select size into v_size from public.brackets where id = p_bracket_id;
  select count(*) into v_players from public.profiles where active;
  v_pool := least(v_size, greatest(v_size / 2, v_players));

  with players as (
    select id, row_number() over (order by random()) as n from public.profiles where active
  ),
  picks as (
    select id, row_number() over (order by random()) as n
      from public.entries where bracket_id = p_bracket_id and seed is not null and seed <= v_pool
  )
  insert into public.mystery_seeds (bracket_id, user_id, entry_id)
  select p_bracket_id, pl.id, pk.id from players pl join picks pk using (n);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.assign_mystery_seeds(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lock seeding for the bracket's size: seeds 1..size, one stage per round from its first round to the final.

create or replace function public.lock_seeding(p_bracket_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_size int;
  v_first int;
  v_ids uuid[];
  v_order int[];
  v_labels text[] := array['Round of 128', 'Round of 64', 'Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final + third-place playoff'];
  r int;
  s int;
begin
  perform public.require_admin();
  select size into v_size from public.brackets where id = p_bracket_id and phase = 'review' and archived_at is null for update;
  if not found then
    raise exception 'Seeding can only be locked from review' using errcode = 'P0001';
  end if;
  v_first := public.first_round(v_size);
  v_order := public.bracket_order(v_size);

  select array_agg(entry_id order by "position") into v_ids
    from public.entry_standings(p_bracket_id)
   where "position" <= v_size;
  if coalesce(cardinality(v_ids), 0) < v_size then
    raise exception 'Need % entries to lock seeding (have %)', v_size, coalesce(cardinality(v_ids), 0) using errcode = 'P0001';
  end if;

  update public.entries set seed = null where bracket_id = p_bracket_id;
  for s in 1..v_size loop
    update public.entries set seed = s where id = v_ids[s];
  end loop;

  insert into public.stages (bracket_id, number, round, label)
    select p_bracket_id, g.rnd - v_first + 1, g.rnd, v_labels[g.rnd + 1] from generate_series(v_first, 6) as g(rnd);

  for s in 0..(v_size / 2 - 1) loop
    insert into public.matchups (bracket_id, round, slot, stage, entry_a, entry_b)
    values (p_bracket_id, v_first, s, 1, v_ids[v_order[2 * s + 1]], v_ids[v_order[2 * s + 2]]);
  end loop;
  for r in (v_first + 1)..6 loop
    for s in 0..((1 << (6 - r)) - 1) loop
      insert into public.matchups (bracket_id, round, slot, stage) values (p_bracket_id, r, s, r - v_first + 1);
    end loop;
  end loop;
  insert into public.matchups (bracket_id, round, slot, stage) values (p_bracket_id, 6, 1, 7 - v_first); -- third place

  update public.stages set status = 'open', opened_at = now() where bracket_id = p_bracket_id and number = 1;
  perform public.assign_mystery_seeds(p_bracket_id);
  update public.brackets set phase = 'live', locked_at = now() where id = p_bracket_id;
end;
$$;
