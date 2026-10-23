-- Phase 5: voting, hidden voters with live tallies, close-and-advance with server-side coin toss,
-- undo last advance, admin override.

-- A coin toss is stored the first time a matchup is tied at close and reused forever after (undo
-- cannot reroll it), as long as the tossed entry is still in the matchup.
alter table public.matchups add column coin_toss_winner uuid references public.entries (id);

create table public.votes (
  matchup_id uuid not null references public.matchups (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  entry_id uuid not null references public.entries (id),
  updated_at timestamptz not null default now(),
  primary key (matchup_id, user_id)
);
create index votes_user_idx on public.votes (user_id);

-- Public counts. Realtime clients subscribe to this, never to votes (RLS hides others' votes).
create table public.matchup_tallies (
  matchup_id uuid primary key references public.matchups (id) on delete cascade,
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  stage smallint not null,
  votes_a int not null default 0,
  votes_b int not null default 0
);
create index matchup_tallies_bracket_idx on public.matchup_tallies (bracket_id, stage);

-- One row per close-and-advance, newest last; undo pops the newest.
create table public.stage_advances (
  id bigint generated always as identity primary key,
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  closed_stage smallint not null,
  created_at timestamptz not null default now()
);

alter table public.votes enable row level security;
alter table public.matchup_tallies enable row level security;
alter table public.stage_advances enable row level security;

revoke all on public.votes, public.matchup_tallies, public.stage_advances from anon, authenticated;
grant select on public.votes, public.matchup_tallies, public.stage_advances to authenticated;

-- Voters are hidden until the stage closes: your own votes always, everyone's once closed.
create policy "own votes, or all once the stage is closed" on public.votes for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
        from public.matchups m
        join public.stages s on s.bracket_id = m.bracket_id and s.number = m.stage
       where m.id = matchup_id and s.status = 'closed'
    )
  );
create policy "tallies readable by signed-in users" on public.matchup_tallies for select to authenticated using (true);
create policy "advances readable by signed-in users" on public.stage_advances for select to authenticated using (true);

-- Live updates: tallies for counts; stages and brackets so phones notice a stage opening/closing.
alter publication supabase_realtime add table public.matchup_tallies, public.stages, public.brackets;

-- ---------------------------------------------------------------------------
-- Tallies

create or replace function public.recount_tally(p_matchup_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.matchup_tallies t
     set votes_a = (select count(*) from public.votes v where v.matchup_id = m.id and v.entry_id = m.entry_a),
         votes_b = (select count(*) from public.votes v where v.matchup_id = m.id and v.entry_id = m.entry_b)
    from public.matchups m
   where m.id = p_matchup_id and t.matchup_id = m.id;
$$;

create or replace function public.votes_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recount_tally(coalesce(new.matchup_id, old.matchup_id));
  if tg_op = 'UPDATE' and new.matchup_id <> old.matchup_id then
    perform public.recount_tally(old.matchup_id);
  end if;
  return null;
end;
$$;

create trigger votes_tally after insert or update or delete on public.votes
  for each row execute function public.votes_changed();

create or replace function public.matchup_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.matchup_tallies (matchup_id, bracket_id, stage) values (new.id, new.bracket_id, new.stage);
  return null;
end;
$$;

create trigger matchup_tally_row after insert on public.matchups
  for each row execute function public.matchup_created();

revoke all on function public.recount_tally(uuid), public.votes_changed(), public.matchup_created() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Voting

-- Vote for one side, switch, or clear (p_entry_id null). Only while the matchup's stage is open.
create or replace function public.cast_vote(p_matchup_id uuid, p_entry_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  m public.matchups;
  v_status public.stage_status;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and active) then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  select * into m from public.matchups where id = p_matchup_id;
  if m.id is null then
    raise exception 'Matchup not found' using errcode = 'P0002';
  end if;
  -- FOR SHARE serialises against close_stage_and_advance (which takes FOR UPDATE).
  select status into v_status from public.stages
   where bracket_id = m.bracket_id and number = m.stage for share;
  if v_status is distinct from 'open' then
    raise exception 'Voting is closed for this matchup' using errcode = 'P0001';
  end if;

  if p_entry_id is null then
    delete from public.votes where matchup_id = p_matchup_id and user_id = auth.uid();
    return;
  end if;
  if p_entry_id is distinct from m.entry_a and p_entry_id is distinct from m.entry_b then
    raise exception 'That entry is not in this matchup' using errcode = 'P0001';
  end if;

  insert into public.votes (matchup_id, user_id, entry_id) values (p_matchup_id, auth.uid(), p_entry_id)
  on conflict (matchup_id, user_id) do update set entry_id = excluded.entry_id, updated_at = now();
end;
$$;

-- "6 of 8 people have voted" for a stage: counts only.
create or replace function public.stage_progress(p_bracket_id uuid, p_stage int)
returns table (voters int, total int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(distinct v.user_id)::int
       from public.votes v
       join public.matchups m on m.id = v.matchup_id
       join public.profiles p on p.id = v.user_id and p.active
      where m.bracket_id = p_bracket_id and m.stage = p_stage),
    (select count(*)::int from public.profiles where active);
$$;

-- ---------------------------------------------------------------------------
-- Advancement helpers (internal)

-- Put a decided matchup's winner (and, for semi-finals, loser) into the next round.
-- Round r slot s feeds round r+1 slot s/2, side a if s is even else b. SF losers feed third place (6, 1).
create or replace function public.feed_forward(p_bracket_id uuid, p_round int, p_slot int, p_winner uuid, p_loser uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_next_round int := case when p_round = 5 then 6 else p_round + 1 end;
begin
  if p_round >= 6 then
    return;
  end if;
  update public.matchups
     set entry_a = case when p_slot % 2 = 0 then p_winner else entry_a end,
         entry_b = case when p_slot % 2 = 1 then p_winner else entry_b end
   where bracket_id = p_bracket_id and round = v_next_round and slot = (case when p_round = 5 then 0 else p_slot / 2 end);
  if p_round = 5 then
    update public.matchups
       set entry_a = case when p_slot % 2 = 0 then p_loser else entry_a end,
           entry_b = case when p_slot % 2 = 1 then p_loser else entry_b end
     where bracket_id = p_bracket_id and round = 6 and slot = 1;
  end if;
end;
$$;

-- Matchups fed by (round, slot): the next-round matchup, plus third place for semi-finals.
create or replace function public.fed_matchups(p_bracket_id uuid, p_round int, p_slot int)
returns setof public.matchups
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.matchups
   where bracket_id = p_bracket_id
     and p_round < 6
     and ((p_round < 5 and round = p_round + 1 and slot = p_slot / 2)
       or (p_round = 5 and round = 6));
$$;

revoke all on function public.feed_forward(uuid, int, int, uuid, uuid), public.fed_matchups(uuid, int, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin: close the open stage and advance (single transaction)

create or replace function public.close_stage_and_advance(p_bracket_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_stage int;
  m record;
  v_winner uuid;
  v_loser uuid;
  v_by text;
begin
  perform public.require_admin();
  perform 1 from public.brackets where id = p_bracket_id and phase = 'live' and archived_at is null for update;
  if not found then
    raise exception 'The bracket is not live' using errcode = 'P0001';
  end if;

  -- 1. Lock the stage: no votes can be cast or changed while (or after) we decide it.
  select number into v_stage from public.stages
   where bracket_id = p_bracket_id and status = 'open' for update;
  if v_stage is null then
    raise exception 'No stage is open' using errcode = 'P0001';
  end if;

  for m in
    select mu.*, t.votes_a, t.votes_b
      from public.matchups mu
      join public.matchup_tallies t on t.matchup_id = mu.id
     where mu.bracket_id = p_bracket_id and mu.stage = v_stage
     order by mu.round, mu.slot
  loop
    if m.entry_a is null or m.entry_b is null then
      raise exception 'Matchup %/% is missing an entry', m.round, m.slot using errcode = 'P0001';
    end if;

    -- 2. Most votes wins. 3. Ties (incl. 0-0): server-side coin toss, stored and reused.
    if m.votes_a > m.votes_b then
      v_winner := m.entry_a; v_by := 'votes';
    elsif m.votes_b > m.votes_a then
      v_winner := m.entry_b; v_by := 'votes';
    else
      v_by := 'coin_toss';
      if m.coin_toss_winner is not null and m.coin_toss_winner in (m.entry_a, m.entry_b) then
        v_winner := m.coin_toss_winner;
      else
        v_winner := case when random() < 0.5 then m.entry_a else m.entry_b end;
        update public.matchups set coin_toss_winner = v_winner where id = m.id;
      end if;
    end if;
    v_loser := case when v_winner = m.entry_a then m.entry_b else m.entry_a end;

    update public.matchups set winner = v_winner, decided_by = v_by, decided_at = now() where id = m.id;
    -- 5. Fill the next round.
    perform public.feed_forward(p_bracket_id, m.round, m.slot, v_winner, v_loser);
  end loop;

  -- 4. Closing the stage reveals its voters (votes RLS).
  update public.stages set status = 'closed', closed_at = now() where bracket_id = p_bracket_id and number = v_stage;
  insert into public.stage_advances (bracket_id, closed_stage) values (p_bracket_id, v_stage);

  -- 6. Open the next stage, or finish.
  if v_stage < 10 then
    update public.stages set status = 'open', opened_at = now() where bracket_id = p_bracket_id and number = v_stage + 1;
  else
    update public.brackets set phase = 'complete', completed_at = now() where id = p_bracket_id;
  end if;
  return v_stage;
end;
$$;

-- Revert the most recent advance. Votes cast in the stage it opened are discarded; coin tosses are kept.
create or replace function public.undo_last_advance(p_bracket_id uuid, p_confirm text)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.stage_advances;
  m record;
begin
  perform public.require_admin();
  if upper(trim(coalesce(p_confirm, ''))) <> 'UNDO' then
    raise exception 'Type UNDO to confirm' using errcode = 'P0001';
  end if;
  perform 1 from public.brackets where id = p_bracket_id and phase in ('live', 'complete') and archived_at is null for update;
  if not found then
    raise exception 'The bracket is not live' using errcode = 'P0001';
  end if;
  select * into a from public.stage_advances where bracket_id = p_bracket_id order by id desc limit 1;
  if a.id is null then
    raise exception 'Nothing to undo' using errcode = 'P0001';
  end if;

  if a.closed_stage < 10 then
    perform 1 from public.stages where bracket_id = p_bracket_id and number = a.closed_stage + 1 for update;
    delete from public.votes v using public.matchups mu
     where v.matchup_id = mu.id and mu.bracket_id = p_bracket_id and mu.stage = a.closed_stage + 1;
    update public.stages set status = 'pending', opened_at = null where bracket_id = p_bracket_id and number = a.closed_stage + 1;
  end if;

  -- Pull this stage's winners (and SF losers) back out of the next round.
  for m in select * from public.matchups where bracket_id = p_bracket_id and stage = a.closed_stage loop
    perform public.feed_forward(p_bracket_id, m.round, m.slot, null, null);
  end loop;
  update public.matchups set winner = null, decided_by = null, decided_at = null
   where bracket_id = p_bracket_id and stage = a.closed_stage;

  update public.stages set status = 'open', closed_at = null where bracket_id = p_bracket_id and number = a.closed_stage;
  delete from public.stage_advances where id = a.id;
  update public.brackets set phase = 'live', completed_at = null where id = p_bracket_id;
  return a.closed_stage;
end;
$$;

-- Bug-fixing only: change a decided matchup's winner. Shown publicly as an admin decision.
-- Not allowed once the next matchup has been decided (undo first).
create or replace function public.override_matchup(p_matchup_id uuid, p_winner uuid, p_confirm text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  m public.matchups;
  n public.matchups;
begin
  perform public.require_admin();
  if upper(trim(coalesce(p_confirm, ''))) <> 'OVERRIDE' then
    raise exception 'Type OVERRIDE to confirm' using errcode = 'P0001';
  end if;
  select * into m from public.matchups where id = p_matchup_id for update;
  if m.id is null then
    raise exception 'Matchup not found' using errcode = 'P0002';
  end if;
  perform 1 from public.brackets where id = m.bracket_id and phase in ('live', 'complete') and archived_at is null for update;
  if not found then
    raise exception 'The bracket is not live' using errcode = 'P0001';
  end if;
  if m.winner is null then
    raise exception 'Only decided matchups can be overridden' using errcode = 'P0001';
  end if;
  if p_winner is distinct from m.entry_a and p_winner is distinct from m.entry_b then
    raise exception 'That entry is not in this matchup' using errcode = 'P0001';
  end if;
  if p_winner = m.winner then
    raise exception 'That entry already won this matchup' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fed_matchups(m.bracket_id, m.round, m.slot) f where f.winner is not null) then
    raise exception 'The next matchup is already decided; undo that stage first' using errcode = 'P0001';
  end if;

  update public.matchups set winner = p_winner, decided_by = 'admin', decided_at = now() where id = m.id;
  perform public.feed_forward(m.bracket_id, m.round, m.slot, p_winner, m.winner);

  -- Votes already cast in the next matchup for the entry that's no longer there are void.
  for n in select * from public.fed_matchups(m.bracket_id, m.round, m.slot) loop
    delete from public.votes
     where matchup_id = n.id
       and entry_id is distinct from n.entry_a and entry_id is distinct from n.entry_b;
    perform public.recount_tally(n.id);
  end loop;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'cast_vote(uuid, uuid)', 'stage_progress(uuid, int)', 'close_stage_and_advance(uuid)',
    'undo_last_advance(uuid, text)', 'override_matchup(uuid, uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
