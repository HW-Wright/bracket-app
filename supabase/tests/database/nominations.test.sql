begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Fixtures
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

-- ---- Bracket lifecycle permissions
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$select public.create_bracket('Joe''s bracket')$$, '42501', null, 'non-admin cannot create a bracket');
select throws_ok($$insert into public.brackets (title) values ('sneaky')$$, '42501', null, 'no direct bracket inserts');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.create_bracket('Best films', 'Any film, any era')$$, 'admin creates a bracket');
select throws_ok($$select public.create_bracket('Second')$$, 'P0001', null, 'cannot create while one is active and unfinished');

create temp table b as select id from public.brackets where title = 'Best films';
grant select on b to authenticated;

select throws_ok(
  format($$select public.save_nominations(%L, array['Heat'])$$, (select id from b)),
  'P0001', 'Nominations are not open', 'cannot nominate in draft');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select throws_ok(
  format($$select public.set_bracket_phase(%L, 'nominations')$$, (select id from b)),
  '42501', null, 'non-admin cannot open nominations');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select lives_ok(format($$select public.set_bracket_phase(%L, 'nominations')$$, (select id from b)), 'admin opens nominations');
select throws_ok(
  format($$select public.set_bracket_phase(%L, 'live')$$, (select id from b)),
  'P0001', null, 'cannot jump straight to live');

-- ---- Nominating
select lives_ok(format($$select public.save_nominations(%L, array['Heat', 'Alien', 'Up'])$$, (select id from b)), 'harry saves 3');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select lives_ok(format($$select public.save_nominations(%L, array['  Jaws ', 'Heat'])$$, (select id from b)), 'joe saves 2');
select throws_ok(
  format($$select public.save_nominations(%L, array_fill('x'::text, array[16]))$$, (select id from b)),
  'P0001', 'At most 15 nominations', 'max 15');
select throws_ok(
  format($$select public.save_nominations(%L, array['ok', '   '])$$, (select id from b)),
  'P0001', 'Nominations cannot be blank', 'no blanks');
select throws_ok(
  $$insert into public.nominations (bracket_id, user_id, rank, text) select id, auth.uid(), 3, 'x' from b$$,
  '42501', null, 'no direct nomination inserts');
select throws_ok(
  $$update public.nominations set text = 'hacked'$$,
  '42501', null, 'no direct nomination updates');

-- BLIND WHILE OPEN
select results_eq(
  $$select text from public.nominations order by rank$$,
  array['Jaws', 'Heat'],
  'while open, joe sees only his own (trimmed, ranked) list');
select is(
  (select count(*)::int from public.nominations where user_id = '00000000-0000-0000-0000-0000000000a1'),
  0, 'while open, joe cannot read harry''s nominations');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.nominations where user_id <> auth.uid()),
  0, 'while open, even the admin cannot read others'' nominations');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select results_eq(
  format($$select submitted, total from public.nomination_progress(%L)$$, (select id from b)),
  $$values (0, 3)$$,
  'progress counts complete (15-entry) lists only: 0 of 3');

-- Re-saving replaces the list
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select lives_ok(format($$select public.save_nominations(%L, array['Heat', 'Jaws', 'Ran'])$$, (select id from b)), 'joe reorders + adds');
select results_eq($$select rank::int, text from public.nominations order by rank$$,
  $$values (1, 'Heat'), (2, 'Jaws'), (3, 'Ran')$$, 'list replaced with new ranks');

-- ---- Close: reveal
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select lives_ok(format($$select public.set_bracket_phase(%L, 'review')$$, (select id from b)), 'admin closes nominations');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.nominations), 6, 'after close, joe sees all 6 nominations');
select throws_ok(
  format($$select public.save_nominations(%L, array['late'])$$, (select id from b)),
  'P0001', 'Nominations are not open', 'cannot edit after close');

-- anon sees nothing
reset role;
set local role anon;
select throws_ok($$select * from public.nominations$$, '42501', null, 'anon cannot read nominations');

select * from finish();
rollback;
