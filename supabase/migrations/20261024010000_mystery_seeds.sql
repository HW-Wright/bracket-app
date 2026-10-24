-- Mystery seeds (Harry, 2026-10-24): at lock, every active player is dealt a random, distinct seeded entry.
-- Only the player can see theirs; everyone sees the players listed in seed order, and an entry is revealed
-- to all once it goes out (loses a non-third-place matchup) or wins the final. Nobody else (admin included)
-- can see a hidden one. Clients read this only through mystery_board().

create table public.mystery_seeds (
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  entry_id uuid not null references public.entries (id) on delete cascade,
  primary key (bracket_id, user_id),
  unique (bracket_id, entry_id)
);

alter table public.mystery_seeds enable row level security;
revoke all on public.mystery_seeds from anon, authenticated;
-- No policies and no grants: the table is only reachable through the security-definer functions below.

-- Deal one random seeded entry to each active player (idempotent: does nothing if already dealt).
create or replace function public.assign_mystery_seeds(p_bracket_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if exists (select 1 from public.mystery_seeds where bracket_id = p_bracket_id) then
    return 0;
  end if;
  with players as (
    select id, row_number() over (order by random()) as n from public.profiles where active
  ),
  picks as (
    select id, row_number() over (order by random()) as n
      from public.entries where bracket_id = p_bracket_id and seed is not null
  )
  insert into public.mystery_seeds (bracket_id, user_id, entry_id)
  select p_bracket_id, pl.id, pk.id from players pl join picks pk using (n);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.assign_mystery_seeds(uuid) from public, anon, authenticated;

-- Admin: deal mystery seeds for a bracket that was locked before this feature existed.
create or replace function public.deal_mystery_seeds(p_bracket_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.brackets where id = p_bracket_id and phase in ('live', 'complete')) then
    raise exception 'Mystery seeds are dealt once seeding is locked' using errcode = 'P0001';
  end if;
  return public.assign_mystery_seeds(p_bracket_id);
end;
$$;

revoke all on function public.deal_mystery_seeds(uuid) from public, anon;
grant execute on function public.deal_mystery_seeds(uuid) to authenticated;

-- The board everyone sees: players in seed order (best seed first). Entry details only for the caller's
-- own row, or once revealed. Seed numbers are never sent for hidden rows.
create or replace function public.mystery_board(p_bracket_id uuid)
returns table (
  "position" int,
  user_id uuid,
  display_name text,
  is_mine boolean,
  revealed boolean,
  status text,
  out_round smallint,
  entry_id uuid,
  entry_name text,
  entry_seed smallint,
  image_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select ms.user_id, p.display_name, e.id as eid, e.name, e.seed, e.image_path,
           (select min(m.round) from public.matchups m
             where m.bracket_id = ms.bracket_id
               and m.winner is not null
               and not (m.round = 6 and m.slot = 1)
               and e.id in (m.entry_a, m.entry_b)
               and m.winner <> e.id) as lost_round,
           exists (select 1 from public.matchups m
                    where m.bracket_id = ms.bracket_id and m.round = 6 and m.slot = 0 and m.winner = e.id) as champion
      from public.mystery_seeds ms
      join public.entries e on e.id = ms.entry_id
      join public.profiles p on p.id = ms.user_id
     where ms.bracket_id = p_bracket_id
  ),
  r as (
    select s.*, (s.lost_round is not null or s.champion) as rev, s.user_id = auth.uid() as mine from s
  )
  select (row_number() over (order by r.seed))::int,
         r.user_id,
         r.display_name,
         r.mine,
         r.rev,
         case when r.champion then 'champion' when r.lost_round is not null then 'out' else 'alive' end,
         case when r.rev then r.lost_round::smallint end,
         case when r.rev or r.mine then r.eid end,
         case when r.rev or r.mine then r.name end,
         case when r.rev or r.mine then r.seed end,
         case when r.rev or r.mine then r.image_path end
    from r
   where auth.uid() is not null
   order by r.seed;
$$;

revoke all on function public.mystery_board(uuid) from public, anon;
grant execute on function public.mystery_board(uuid) to authenticated;

create or replace function public.lock_seeding(p_bracket_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_order int[] := public.bracket_order(64);
  r int;
  s int;
begin
  perform public.require_admin();
  perform 1 from public.brackets where id = p_bracket_id and phase = 'review' and archived_at is null for update;
  if not found then
    raise exception 'Seeding can only be locked from review' using errcode = 'P0001';
  end if;

  select array_agg(entry_id order by "position") into v_ids
    from public.entry_standings(p_bracket_id)
   where "position" <= 64;
  if coalesce(cardinality(v_ids), 0) < 64 then
    raise exception 'Need 64 entries to lock seeding (have %)', coalesce(cardinality(v_ids), 0) using errcode = 'P0001';
  end if;

  update public.entries set seed = null where bracket_id = p_bracket_id;
  for s in 1..64 loop
    update public.entries set seed = s where id = v_ids[s];
  end loop;

  insert into public.stages (bracket_id, number, round, label) values
    (p_bracket_id, 1, 1, 'Round of 64'),
    (p_bracket_id, 2, 2, 'Round of 32'),
    (p_bracket_id, 3, 3, 'Round of 16'),
    (p_bracket_id, 4, 4, 'Quarter-finals'),
    (p_bracket_id, 5, 5, 'Semi-finals'),
    (p_bracket_id, 6, 6, 'Final + third-place playoff');

  for s in 0..31 loop
    insert into public.matchups (bracket_id, round, slot, stage, entry_a, entry_b)
    values (p_bracket_id, 1, s, public.stage_for(1, s), v_ids[v_order[2 * s + 1]], v_ids[v_order[2 * s + 2]]);
  end loop;
  for r in 2..6 loop
    for s in 0..((64 >> r) - 1) loop
      insert into public.matchups (bracket_id, round, slot, stage) values (p_bracket_id, r, s, public.stage_for(r, s));
    end loop;
  end loop;
  insert into public.matchups (bracket_id, round, slot, stage) values (p_bracket_id, 6, 1, public.stage_for(6, 1)); -- third place

  update public.stages set status = 'open', opened_at = now() where bracket_id = p_bracket_id and number = 1;
  perform public.assign_mystery_seeds(p_bracket_id);
  update public.brackets set phase = 'live', locked_at = now() where id = p_bracket_id;
end;
$$;
