begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Base points (Harry, 2026-11-03): each counted nomination earns base_points + 16 - rank; new brackets use base 15.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'joe@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'sean@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d4', 'kier@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e5', 'ollie@test.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, username, display_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry', 'Harry', true),
  ('00000000-0000-0000-0000-0000000000b2', 'joe', 'Joe', false),
  ('00000000-0000-0000-0000-0000000000c3', 'sean', 'Sean', false),
  ('00000000-0000-0000-0000-0000000000d4', 'kier', 'Kier', false),
  ('00000000-0000-0000-0000-0000000000e5', 'ollie', 'Ollie', false);

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.active() returns uuid language sql as $$
  select id from public.brackets where archived_at is null;
$$;
-- "points/nominators" and seeding position for a top-level entry by name.
create function pg_temp.st(p_name text) returns text language sql as $$
  select points || '/' || nominators from public.entry_standings(pg_temp.active()) where name = p_name;
$$;
create function pg_temp.pos(p_name text) returns int language sql as $$
  select "position" from public.entry_standings(pg_temp.active()) where name = p_name;
$$;
create function pg_temp.eid(p_name text) returns uuid language sql as $$
  select entry_id from public.entry_standings(pg_temp.active()) where name = p_name;
$$;
-- A complete list: p_first at #1, fillers <prefix>2..<prefix>14, p_last at #15.
create function pg_temp.list(p_first text, p_prefix text, p_last text) returns text[] language sql as $$
  select array[p_first] || array(select p_prefix || i from generate_series(2, 14) i) || array[p_last];
$$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.create_bracket('Scoring', null, 8);
select is((select base_points::int from public.brackets where id = pg_temp.active()), 15, 'a new bracket gets base points 15');
select public.set_bracket_phase(pg_temp.active(), 'nominations');

-- Harry: Solo top #1, Triple low #15.  Joe and Sean: Pair top #1, Triple low #15.  Kier and Ollie: Pair low #15.
select public.save_nominations(pg_temp.active(), pg_temp.list('Solo top', 'H', 'Triple low'));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select public.save_nominations(pg_temp.active(), pg_temp.list('Pair top', 'J', 'Triple low'));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select public.save_nominations(pg_temp.active(), pg_temp.list('Pair top', 'S', 'Triple low'));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
select public.save_nominations(pg_temp.active(), pg_temp.list('K1', 'K', 'Pair low'));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e5');
select public.save_nominations(pg_temp.active(), pg_temp.list('O1', 'O', 'Pair low'));

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.set_bracket_phase(pg_temp.active(), 'review');

select is(pg_temp.st('Pair top') || ' #' || pg_temp.pos('Pair top'), '60/2 #1', 'two #1s: 30 + 30 = 60, first');
select is(pg_temp.st('Triple low') || ' #' || pg_temp.pos('Triple low'), '48/3 #2', 'three #15s: 16 x 3 = 48, behind two #1s');
select is(pg_temp.st('Pair low') || ' #' || pg_temp.pos('Pair low'), '32/2 #3', 'two #15s: 16 + 16 = 32, ahead of any single pick');
select is(pg_temp.st('Solo top'), '30/1', 'a single #1 scores 30');
select is(pg_temp.st('H2'), '29/1', 'a #2 scores 29');
select ok(
  (select max("position") from public.entry_standings(pg_temp.active()) where nominators >= 2 and not removed)
    < (select min("position") from public.entry_standings(pg_temp.active()) where nominators = 1 and not removed),
  'every entry two or more people nominated seeds above every single pick');

-- Merges: the base counts once per person, like the rank.
select public.merge_entries(pg_temp.eid('H2'), pg_temp.eid('H3'), 'H2+3');
select is(pg_temp.st('H2+3'), '29/1', 'same nominator counts once: 15 + 14 = 29, not 29 + 28');
select public.merge_entries(pg_temp.eid('Solo top'), pg_temp.eid('K1'), 'Solo+K1');
select is(pg_temp.st('Solo+K1'), '60/2', 'different nominators add up: 30 + 30');
select public.add_manual_entry(pg_temp.active(), 'Manual one');
select is(pg_temp.st('Manual one'), '0/0', 'manual entries still score 0');

-- The base is fixed per bracket: clients can't change it, and a base of 0 is plain 16 - rank.
select throws_ok(format($$update public.brackets set base_points = 0 where id = %L$$, pg_temp.active()), '42501', null,
  'clients cannot change a bracket''s base points');
reset role;
update public.brackets set base_points = 0 where id = pg_temp.active();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is(pg_temp.st('Pair top'), '30/2', 'a bracket with base 0 (scored before 2026-11-03) keeps 16 - rank');

select * from finish();
rollback;
