begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- Fixtures: Harry (admin), Joe, Sean. 64 manual entries E01..E64 whose tiebreaks force seed = number.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'joe@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'sean@test.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, username, display_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry', 'Harry', true),
  ('00000000-0000-0000-0000-0000000000b2', 'joe', 'Joe', false),
  ('00000000-0000-0000-0000-0000000000c3', 'sean', 'Sean', false);
insert into public.brackets (id, title, phase) values ('00000000-0000-0000-0000-00000000bb01', 'Films', 'review');
insert into public.entries (bracket_id, name, manual, tiebreak)
  select '00000000-0000-0000-0000-00000000bb01', 'E' || lpad(i::text, 2, '0'), true, i / 100.0 from generate_series(1, 64) i;

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
-- claims only (stay superuser) for setup/simulation steps
create function pg_temp.claims(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.m(p_round int, p_slot int) returns public.matchups language sql as $$
  select * from public.matchups where bracket_id = '00000000-0000-0000-0000-00000000bb01' and round = p_round and slot = p_slot;
$$;
create function pg_temp.seed(p_entry uuid) returns int language sql as $$
  select seed::int from public.entries where id = p_entry;
$$;
create function pg_temp.harry() returns void language sql as $$ select pg_temp.claims('00000000-0000-0000-0000-0000000000a1') $$;

select pg_temp.harry();
select public.lock_seeding('00000000-0000-0000-0000-00000000bb01');
select is((select count(*)::int from public.matchup_tallies), 64, 'a tally row exists for every matchup');
select is(pg_temp.seed((pg_temp.m(1, 0)).entry_a) || 'v' || pg_temp.seed((pg_temp.m(1, 0)).entry_b), '1v64', 'game 1 is 1 v 64');

-- ---- Stage 1 voting: slot 0 gets Harry a, Joe a, Sean b. Slot 1 gets nothing (0-0 -> coin toss).
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select lives_ok($$select public.cast_vote((pg_temp.m(1, 0)).id, (pg_temp.m(1, 0)).entry_b)$$, 'joe votes');
select lives_ok($$select public.cast_vote((pg_temp.m(1, 0)).id, (pg_temp.m(1, 0)).entry_a)$$, 'joe switches his vote');
select throws_ok($$select public.cast_vote((pg_temp.m(1, 0)).id, (pg_temp.m(1, 1)).entry_a)$$, 'P0001', 'That entry is not in this matchup', 'cannot vote for an entry outside the matchup');
select throws_ok($$select public.cast_vote((pg_temp.m(1, 8)).id, (pg_temp.m(1, 8)).entry_a)$$, 'P0001', 'Voting is closed for this matchup', 'cannot vote in a stage that is not open');
select throws_ok($$insert into public.votes (matchup_id, user_id, entry_id) select (pg_temp.m(1, 0)).id, auth.uid(), (pg_temp.m(1, 0)).entry_a$$, '42501', null, 'no direct vote writes');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select public.cast_vote((pg_temp.m(1, 0)).id, (pg_temp.m(1, 0)).entry_b);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.cast_vote((pg_temp.m(1, 0)).id, (pg_temp.m(1, 0)).entry_a);

-- ---- Hidden voters, visible tallies (while open)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.votes), 1, 'while open, Joe sees only his own vote');
select is((select count(*)::int from public.votes where user_id <> auth.uid()), 0, 'while open, Joe cannot see who else voted');
select is((select votes_a || '-' || votes_b from public.matchup_tallies where matchup_id = (pg_temp.m(1, 0)).id), '2-1', 'but the live tally is visible: 2-1');
select results_eq($$select voters, total from public.stage_progress('00000000-0000-0000-0000-00000000bb01', 1)$$, $$values (3, 3)$$, '3 of 3 have voted (counts only)');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.votes where user_id <> auth.uid()), 0, 'even the admin cannot see others'' votes while open');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$select public.close_stage_and_advance('00000000-0000-0000-0000-00000000bb01')$$, '42501', null, 'non-admin cannot close a stage');

-- ---- Close stage 1
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is(public.close_stage_and_advance('00000000-0000-0000-0000-00000000bb01'), 1, 'admin closes stage 1');
reset role;
select is(pg_temp.seed((pg_temp.m(1, 0)).winner) || ' ' || (pg_temp.m(1, 0)).decided_by, '1 votes', 'game 1: seed 1 wins 2-1 by votes');
select is((pg_temp.m(1, 1)).decided_by, 'coin_toss', 'game 2 (0-0) decided by coin toss');
select ok((pg_temp.m(1, 1)).coin_toss_winner = (pg_temp.m(1, 1)).winner, 'coin toss result stored');
select is((select count(*)::int from public.matchups where stage = 1 and winner is null), 0, 'every stage-1 matchup decided');
select ok((pg_temp.m(2, 0)).entry_a = (pg_temp.m(1, 0)).winner and (pg_temp.m(2, 0)).entry_b = (pg_temp.m(1, 1)).winner, 'winners fill R32 game 1');
select results_eq($$select status::text from public.stages where number in (1, 2) order by number$$, $$values ('closed'), ('open')$$, 'stage 1 closed, stage 2 open');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.votes where matchup_id = (pg_temp.m(1, 0)).id), 3, 'after close, voters are revealed to everyone');
select throws_ok($$select public.cast_vote((pg_temp.m(1, 0)).id, (pg_temp.m(1, 0)).entry_b)$$, 'P0001', 'Voting is closed for this matchup', 'stage-1 votes are locked');
select lives_ok($$select public.cast_vote((pg_temp.m(1, 8)).id, (pg_temp.m(1, 8)).entry_a)$$, 'joe votes in stage 2');

-- ---- Undo
reset role;
create temp table toss as select (pg_temp.m(1, 1)).coin_toss_winner as w;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.undo_last_advance('00000000-0000-0000-0000-00000000bb01', 'yes')$$, 'P0001', 'Type UNDO to confirm', 'undo needs typed confirmation');
select is(public.undo_last_advance('00000000-0000-0000-0000-00000000bb01', 'undo'), 1, 'undo reverts stage 1');
reset role;
select is((select count(*)::int from public.votes v join public.matchups m on m.id = v.matchup_id where m.stage = 2), 0, 'votes in the newly opened stage are discarded');
select results_eq($$select status::text from public.stages where number in (1, 2) order by number$$, $$values ('open'), ('pending')$$, 'stage 1 reopened, stage 2 pending');
select ok((pg_temp.m(2, 0)).entry_a is null and (pg_temp.m(1, 0)).winner is null, 'winners pulled back out of R32');
select is((select count(*)::int from public.votes v join public.matchups m on m.id = v.matchup_id where m.stage = 1), 3, 'stage-1 votes are kept');

select pg_temp.harry();
select public.close_stage_and_advance('00000000-0000-0000-0000-00000000bb01');
select is((pg_temp.m(1, 1)).winner, (select w from toss), 'still tied on re-close: the stored coin toss is reused, never rerolled');

-- ---- Override
select throws_ok($$select public.override_matchup((pg_temp.m(1, 0)).id, (pg_temp.m(1, 0)).entry_b, 'ok')$$, 'P0001', 'Type OVERRIDE to confirm', 'override needs typed confirmation');
select lives_ok($$select public.override_matchup((pg_temp.m(1, 0)).id, (pg_temp.m(1, 0)).entry_b, 'override')$$, 'admin overrides game 1');
select is(pg_temp.seed((pg_temp.m(2, 0)).entry_a) || ' ' || (pg_temp.m(1, 0)).decided_by, '64 admin', 'seed 64 now advances, marked as an admin decision');

-- ---- Simulate the rest: Harry and Joe always vote for side a.
do $$
declare
  mu record;
  guard int := 0;
begin
  while (select phase from public.brackets where id = '00000000-0000-0000-0000-00000000bb01') = 'live' and guard < 20 loop
    guard := guard + 1;
    for mu in
      select m.* from public.matchups m join public.stages s on s.bracket_id = m.bracket_id and s.number = m.stage
       where m.bracket_id = '00000000-0000-0000-0000-00000000bb01' and s.status = 'open'
    loop
      perform pg_temp.claims('00000000-0000-0000-0000-0000000000a1');
      perform public.cast_vote(mu.id, mu.entry_a);
      perform pg_temp.claims('00000000-0000-0000-0000-0000000000b2');
      perform public.cast_vote(mu.id, mu.entry_a);
    end loop;
    perform pg_temp.claims('00000000-0000-0000-0000-0000000000a1');
    perform public.close_stage_and_advance('00000000-0000-0000-0000-00000000bb01');
  end loop;
end;
$$;

select is((select phase::text from public.brackets), 'complete', 'after stage 10 the bracket is complete');
select is((select count(*)::int from public.matchups where winner is null), 0, 'all 64 matchups decided');
select is((select count(*)::int from public.stages where status = 'closed'), 10, 'all 10 stages closed');
select is(pg_temp.seed((pg_temp.m(6, 0)).winner), 64, 'champion: seed 64 (carried by the override)');
select is(pg_temp.seed((pg_temp.m(6, 0)).entry_b), 2, 'runner-up: seed 2, who could only meet the top half in the final');
select is(pg_temp.seed((pg_temp.m(6, 1)).winner) || ' beat ' || pg_temp.seed(case when (pg_temp.m(6, 1)).winner = (pg_temp.m(6, 1)).entry_a then (pg_temp.m(6, 1)).entry_b else (pg_temp.m(6, 1)).entry_a end),
  '4 beat 3', 'third-place playoff between the semi-final losers: 4 beat 3');
select throws_ok($$select public.override_matchup((pg_temp.m(1, 0)).id, (pg_temp.m(1, 0)).entry_a, 'OVERRIDE')$$, 'P0001', 'The next matchup is already decided; undo that stage first', 'cannot override once the next matchup is decided');

select is(public.undo_last_advance('00000000-0000-0000-0000-00000000bb01', 'UNDO'), 10, 'undo works after completion');
select is((select phase::text from public.brackets) || ' ' || (select status::text from public.stages where number = 10), 'live open', 'back to live with the final stage open');

reset role;
select lives_ok($$delete from public.brackets where id = '00000000-0000-0000-0000-00000000bb01'$$, 'a bracket with votes can be deleted outright');
select is((select count(*)::int from public.votes) + (select count(*)::int from public.matchups) + (select count(*)::int from public.entries), 0, 'and everything under it goes too');

select * from finish();
rollback;
