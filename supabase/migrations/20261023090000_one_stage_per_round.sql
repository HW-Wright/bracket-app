-- Harry's decision (2026-10-23): the Round of 64 and Round of 32 are each one stage, shown in their
-- entirety. Stages are now one per round: 1 R64, 2 R32, 3 R16, 4 QF, 5 SF, 6 final + third place.
-- Advance/undo follow the stages a bracket actually has, so brackets locked under the old 10-stage
-- layout keep working.

create or replace function public.stage_for(p_round int, p_slot int)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select p_round::smallint;
$$;

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
  update public.brackets set phase = 'live', locked_at = now() where id = p_bracket_id;
end;
$$;

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
  if exists (select 1 from public.stages where bracket_id = p_bracket_id and number = v_stage + 1) then
    update public.stages set status = 'open', opened_at = now() where bracket_id = p_bracket_id and number = v_stage + 1;
  else
    update public.brackets set phase = 'complete', completed_at = now() where id = p_bracket_id;
  end if;
  return v_stage;
end;
$$;

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

  if exists (select 1 from public.stages where bracket_id = p_bracket_id and number = a.closed_stage + 1) then
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
