begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'joe@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'sean@test.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, username, display_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry', 'Harry', true),
  ('00000000-0000-0000-0000-0000000000b2', 'joe', 'Joe', false),
  ('00000000-0000-0000-0000-0000000000c3', 'sean', 'Sean', false);

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.active() returns uuid language sql as $$
  select id from public.brackets where archived_at is null;
$$;
-- Puts the active bracket in review with n manual entries (E001, E002, ... in standings order).
create function pg_temp.fill(n int) returns void language sql as $$
  update public.brackets set phase = 'review' where archived_at is null;
  insert into public.entries (bracket_id, name, manual, tiebreak)
    select pg_temp.active(), 'E' || lpad(i::text, 3, '0'), true, i / 1000.0 from generate_series(1, n) i;
$$;

-- Parity with firstRound() in src/lib/bracket.ts.
select results_eq($$select public.first_round(s) from unnest(array[8, 16, 32, 64, 128]) s$$, $$values (4), (3), (2), (1), (0)$$,
  'first_round matches the TypeScript firstRound');

-- ---------------------------------------------------------------------------
-- Create with a size.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.create_bracket('Odd', null, 12)$$, 'P0001', 'Bracket size must be 8, 16, 32, 64 or 128', 'only the five sizes are allowed');
select lives_ok($$select public.create_bracket('Small', null, 8)$$, 'admin creates an 8-seed bracket');
select is((select size::int from public.brackets where title = 'Small'), 8, 'the size is stored');

-- Size can change until seeding is locked.
reset role;
select pg_temp.fill(10);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.update_bracket(pg_temp.active(), 'Small', null, 16)$$, 'size can change in review');
select throws_ok($$select public.lock_seeding(pg_temp.active())$$, 'P0001', 'Need 16 entries to lock seeding (have 10)', 'locking needs as many entries as the size');
select lives_ok($$select public.update_bracket(pg_temp.active(), 'Small', null, 8)$$, 'and back to 8');

-- ---------------------------------------------------------------------------
-- 8 seeds: QF, SF, final + third place.
select lives_ok($$select public.lock_seeding(pg_temp.active())$$, 'an 8-seed bracket locks');
select throws_ok($$select public.update_bracket(pg_temp.active(), 'Small', null, 16)$$, 'P0001', 'The bracket size is fixed once seeding is locked', 'size is fixed once locked');
select lives_ok($$select public.update_bracket(pg_temp.active(), 'Small renamed', null)$$, 'the title can still change');
select results_eq($$select number::int, round::int, label from public.stages where bracket_id = pg_temp.active() order by number$$,
  $$values (1, 4, 'Quarter-finals'), (2, 5, 'Semi-finals'), (3, 6, 'Final + third-place playoff')$$, 'three stages, starting at the quarter-finals');
select results_eq($$select round::int, count(*)::int from public.matchups where bracket_id = pg_temp.active() group by round order by round$$,
  $$values (4, 4), (5, 2), (6, 2)$$, '4 quarter-finals, 2 semis, final and third place');
select results_eq($$select e.seed::int from public.matchups m join public.entries e on e.id = m.entry_a where m.bracket_id = pg_temp.active() and m.round = 4 order by m.slot$$,
  $$values (1), (4), (2), (3)$$, 'standard 8-seed draw (1v8, 4v5, 2v7, 3v6)');
select is((select count(*)::int from public.entries where bracket_id = pg_temp.active() and seed is not null), 8, 'seeds 1-8 only; the rest are cut');
select is((select status::text from public.stages where bracket_id = pg_temp.active() and number = 1), 'open', 'the quarter-finals open');
-- Mystery seeds: top half is seeds 1-4, enough for the 3 players.
reset role;
select is((select count(*)::int from public.mystery_seeds), 3, 'one mystery seed per player');
select ok((select max(e.seed) from public.mystery_seeds ms join public.entries e on e.id = ms.entry_id) <= 4, 'dealt from the top half (seeds 1-4)');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');

-- Play it out (no votes: every game is a coin toss).
select public.close_stage_and_advance(pg_temp.active());
select public.close_stage_and_advance(pg_temp.active());
select is((select count(*)::int from public.matchups where bracket_id = pg_temp.active() and round = 6 and entry_a is not null and entry_b is not null), 2,
  'semi-final winners reach the final, losers the third-place playoff');
select is(public.close_stage_and_advance(pg_temp.active()), 3, 'the third stage closes');
select is((select phase::text from public.brackets where id = pg_temp.active()), 'complete', 'and the bracket is complete');
select lives_ok($$select public.undo_last_advance(pg_temp.active(), 'UNDO')$$, 'undo still works on a small bracket');
select public.close_stage_and_advance(pg_temp.active());

-- ---------------------------------------------------------------------------
-- Archive without starting the next bracket.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$select public.archive_bracket(pg_temp.active())$$, '42501', null, 'only the admin can archive');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.archive_bracket((select id from public.brackets where title = 'Small renamed'))$$, 'the admin archives a finished bracket');
select is((select count(*)::int from public.brackets where archived_at is null), 0, 'no active bracket afterwards');
select is((select count(*)::int from public.matchups m join public.brackets b on b.id = m.bracket_id where b.title = 'Small renamed' and m.winner is not null), 8,
  'the archived bracket keeps its results');
select lives_ok($$select public.create_bracket('Big', null, 128)$$, 'a new bracket can then be started');
select throws_ok($$select public.archive_bracket(pg_temp.active())$$, 'P0001', 'Only a finished bracket can be archived', 'an unfinished bracket cannot be archived');

-- ---------------------------------------------------------------------------
-- 128 seeds: starts at round 0, seven stages.
reset role;
select pg_temp.fill(130);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.lock_seeding(pg_temp.active());
select results_eq($$select count(*)::int, min(round)::int, max(number)::int from public.stages where bracket_id = pg_temp.active()$$,
  $$values (7, 0, 7)$$, 'seven stages from the Round of 128');
select results_eq($$select count(*)::int, count(*) filter (where round = 0)::int, max(stage)::int from public.matchups where bracket_id = pg_temp.active()$$,
  $$values (128, 64, 7)$$, '64 first-round games and 128 matchups in all (incl. third place)');
reset role;
select ok((select max(e.seed) from public.mystery_seeds ms join public.entries e on e.id = ms.entry_id where ms.bracket_id = pg_temp.active()) <= 64,
  'mystery seeds come from seeds 1-64');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.close_stage_and_advance(pg_temp.active());
select is((select count(*)::int from public.matchups where bracket_id = pg_temp.active() and round = 1 and entry_a is not null and entry_b is not null), 32,
  'Round of 128 winners fill the Round of 64');

select * from finish();
rollback;
