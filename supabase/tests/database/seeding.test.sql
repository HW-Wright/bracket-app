begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'joe@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'sean@test.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, username, display_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry', 'Harry', true),
  ('00000000-0000-0000-0000-0000000000b2', 'joe', 'Joe', false),
  ('00000000-0000-0000-0000-0000000000c3', 'sean', 'Sean', false);
insert into public.brackets (id, title, phase) values ('00000000-0000-0000-0000-00000000bb01', 'Films', 'nominations');

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
-- (points, nominators) for a top-level entry by name
create function pg_temp.st(p_name text) returns text language sql as $$
  select points || '/' || nominators from public.entry_standings('00000000-0000-0000-0000-00000000bb01') where name = p_name;
$$;
create function pg_temp.pos(p_name text) returns int language sql as $$
  select "position" from public.entry_standings('00000000-0000-0000-0000-00000000bb01') where name = p_name;
$$;
create function pg_temp.eid(p_name text) returns uuid language sql as $$
  select entry_id from public.entry_standings('00000000-0000-0000-0000-00000000bb01') where name = p_name;
$$;

-- Harry: Spider-Man #1, Heat #2, Alien #3, Shared #9.   Joe: spiderman #1, Heat #2, Alein #3, Shared #8.
-- Sean: 9 entries incl. Heat #1 (incomplete, must not count).
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.save_nominations('00000000-0000-0000-0000-00000000bb01', array[
  'Spider-Man', 'Heat', 'Alien', 'H4', 'H5', 'H6', 'H7', 'H8', 'Shared', 'H10', 'H11', 'H12', 'H13', 'H14', 'H15']);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select public.save_nominations('00000000-0000-0000-0000-00000000bb01', array[
  'spiderman', 'Heat', 'Alein', 'J4', 'J5', 'J6', 'J7', 'Shared', 'J9', 'J10', 'J11', 'J12', 'J13', 'J14', 'J15']);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select public.save_nominations('00000000-0000-0000-0000-00000000bb01', array['Heat', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']);

-- Close: builds entries
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.set_bracket_phase('00000000-0000-0000-0000-00000000bb01', 'review')$$, 'closing builds entries');

select is((select count(*)::int from public.entries), 27, '27 entries: 15 + 15 minus 3 shared keys; Sean''s incomplete list adds none');
select is((select count(*)::int from public.entries where name like 'S_'), 0, 'incomplete list contributes no entries');

-- Auto-combine + scoring (16 - rank)
select is(pg_temp.st('Spider-Man') || ' #' || pg_temp.pos('Spider-Man'), '30/2 #1', 'Spider-Man + spiderman auto-combined: 15 + 15 = 30 pts, 2 nominators, first');
select is(
  (select spellings from public.entry_standings('00000000-0000-0000-0000-00000000bb01') where name = 'Spider-Man'),
  array['Spider-Man', 'spiderman'], 'combined entry lists both spellings');
select is(pg_temp.st('Heat') || ' #' || pg_temp.pos('Heat'), '28/2 #2', 'Heat: 14 + 14, Sean''s uncounted #1 ignored');
select is(pg_temp.st('Shared') || ' #' || pg_temp.pos('Shared'), '15/2 #3', 'Shared: 7 + 8 = 15 from 2 nominators, ahead of 15-point singles');
select is(pg_temp.st('H4'), '12/1', 'H4 (#4) = 12 pts');

-- Suggestions
select ok(
  exists (select 1 from public.duplicate_suggestions('00000000-0000-0000-0000-00000000bb01')
           where (name_a, name_b) in (('Alien', 'Alein'), ('Alein', 'Alien'))),
  'Alien / Alein suggested as a likely duplicate');

-- Non-admin cannot edit
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select throws_ok(format($$select public.merge_entries(%L, %L, 'x')$$, pg_temp.eid('Alien'), pg_temp.eid('Alein')),
  '42501', null, 'non-admin cannot merge');
select throws_ok(format($$select public.add_manual_entry(%L, 'x')$$, '00000000-0000-0000-0000-00000000bb01'),
  '42501', null, 'non-admin cannot add entries');
select throws_ok($$update public.entries set name = 'hacked'$$, '42501', null, 'no direct entry writes');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');

-- Merge: points add across different users
create temp table t_alien as select pg_temp.eid('Alien') as alien, pg_temp.eid('Alein') as alein,
  (select id from public.entries where id in (pg_temp.eid('Alien'), pg_temp.eid('Alein')) order by created_at, id limit 1) as earlier,
  (select id from public.entries where id in (pg_temp.eid('Alien'), pg_temp.eid('Alein')) order by created_at desc, id desc limit 1) as later;
grant select on t_alien to authenticated;
create temp table t_tb as select id, tiebreak from public.entries;
grant select on t_tb to authenticated;
select is(
  (select public.merge_entries(alien, alein, 'Alien') from t_alien),
  (select earlier from t_alien), 'merge target is the earlier-created entry');
select is(pg_temp.st('Alien'), '26/2', 'merged Alien = 13 + 13 = 26 from 2 nominators');
select is((select count(*)::int from public.entry_standings('00000000-0000-0000-0000-00000000bb01')), 26, 'one fewer top-level entry after merge');
select is(
  (select e.tiebreak from public.entries e join t_alien t on e.id = t.earlier),
  (select tb.tiebreak from t_tb tb join t_alien t on tb.id = t.earlier),
  'merged entry keeps the earlier entry''s stored tiebreak');
select is((select count(*)::int from public.entries e join t_tb tb using (id) where e.tiebreak <> tb.tiebreak), 0,
  'no tiebreak is ever rerolled');

-- Best-rank rule: same user nominated both (H4 #4 = 12, H5 #5 = 11) -> only 12 counts
select lives_ok(format($$select public.merge_entries(%L, %L, 'H4+5')$$, pg_temp.eid('H4'), pg_temp.eid('H5')), 'merge two of Harry''s own');
select is(pg_temp.st('H4+5'), '12/1', 'same nominator counts once at best rank: 12, not 23');

-- Nested merge then unmerge restores
select lives_ok(format($$select public.merge_entries(%L, %L, 'Alien family')$$, pg_temp.eid('Alien'), pg_temp.eid('H6')), 'merge a merged entry with another');
select is(pg_temp.st('Alien family'), '26/2', 'nested merge: Harry best of Alien 13 / H6 10 = 13, plus Joe 13');
select lives_ok($$select public.unmerge_entry((select later from t_alien))$$, 'unmerge the later Alien/Alein entry');
select is(
  (select points || '/' || nominators from public.entry_standings('00000000-0000-0000-0000-00000000bb01') where entry_id = (select later from t_alien))
  || ' ' || pg_temp.st('Alien family'),
  '13/1 23/2', 'unmerge splits the points back: detached entry 13 (1 user); family keeps the other 13 + H6 10');
select throws_ok($$select public.unmerge_entry((select later from t_alien))$$, 'P0001', null, 'cannot unmerge twice');

-- Split auto-combine
select is(public.split_entry(pg_temp.eid('Spider-Man')), 1, 'split Spider-Man into 2 spellings');
select is(pg_temp.st('spiderman') || ' ' || pg_temp.st('Spider-Man'), '15/1 15/1', 'split: each spelling keeps its own nominator''s points');
select ok(pg_temp.pos('Shared') < least(pg_temp.pos('spiderman'), pg_temp.pos('Spider-Man')),
  'at equal points (15), more nominators ranks higher: Shared (2) above the single-nominator spellings');

-- Remove / restore / manual
select lives_ok(format($$select public.set_entry_removed(%L, true)$$, pg_temp.eid('Heat')), 'remove Heat');
select ok((select removed and "position" is null from public.entry_standings('00000000-0000-0000-0000-00000000bb01') where name = 'Heat'), 'removed entry has no position');
select lives_ok(format($$select public.set_entry_removed(%L, false)$$, pg_temp.eid('Heat')), 'restore Heat');
select lives_ok($$select public.add_manual_entry('00000000-0000-0000-0000-00000000bb01', 'Manual one')$$, 'admin adds a manual entry');
select is(pg_temp.st('Manual one'), '0/0', 'manual entry scores 0 from 0 nominators');

-- Lock
select throws_ok($$select public.lock_seeding('00000000-0000-0000-0000-00000000bb01')$$, 'P0001', null, 'cannot lock with fewer than 64');
select public.add_manual_entry('00000000-0000-0000-0000-00000000bb01', 'Manual ' || i) from generate_series(2, 64) i;
select lives_ok($$select public.lock_seeding('00000000-0000-0000-0000-00000000bb01')$$, 'lock with 64+ entries');

select is((select array_agg(seed order by seed)::int[] from public.entries where seed is not null), (select array_agg(i) from generate_series(1, 64) i),
  'seeds 1..64 assigned exactly once');
select is(
  (select seed from public.entries where id = (select entry_id from public.entry_standings('00000000-0000-0000-0000-00000000bb01') where "position" = 1)), 1::smallint,
  'seed 1 is the top of the preview');
select results_eq(
  $$select count(*)::int from public.matchups group by round order by round$$,
  $$values (32), (16), (8), (4), (2), (2)$$, 'bracket skeleton: 32/16/8/4/2 + final and third place');
select is(
  (select count(*)::int from public.matchups m join public.entries a on a.id = m.entry_a join public.entries b on b.id = m.entry_b
    where m.round = 1 and a.seed + b.seed = 65), 32, 'every first-round pair sums to 65');
select is(
  (select array_agg(x order by o) from unnest(public.bracket_order(64)) with ordinality as u(x, o)),
  array[1,64,32,33,16,49,17,48,8,57,25,40,9,56,24,41,4,61,29,36,13,52,20,45,5,60,28,37,12,53,21,44,2,63,31,34,15,50,18,47,7,58,26,39,10,55,23,42,3,62,30,35,14,51,19,46,6,59,27,38,11,54,22,43],
  'SQL bracket_order matches the TypeScript bracketOrder');
select results_eq($$select status::text from public.stages order by number$$,
  $$values ('open'), ('pending'), ('pending'), ('pending'), ('pending'), ('pending')$$,
  'six stages, one per round: stage 1 open, the rest pending');
select is((select count(*)::int from public.matchups where stage = 1), 32, 'stage 1 is the whole Round of 64');
select is((select phase::text from public.brackets), 'live', 'bracket is live');
select throws_ok(format($$select public.rename_entry(%L, 'late')$$, pg_temp.eid('Heat')), 'P0001', null, 'entries are frozen after lock');
select lives_ok(format($$select public.set_entry_image(%L, '00000000-0000-0000-0000-00000000bb01/heat.webp')$$, pg_temp.eid('Heat')),
  'images can still be set after lock');

select * from finish();
rollback;
