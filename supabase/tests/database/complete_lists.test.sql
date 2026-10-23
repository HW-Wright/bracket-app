begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- normalise_entry / entry_key must agree with src/lib/normalise.ts (same cases as normalise.test.ts)
select is(public.normalise_entry('The Dark-Knight!'), 'dark knight', 'normalise: article + hyphen + punctuation');
select is(public.normalise_entry('Amélie'), 'amelie', 'normalise: diacritics');
select is(public.normalise_entry('A Clockwork Orange'), 'clockwork orange', 'normalise: leading a');
select is(public.normalise_entry('An American Werewolf'), 'american werewolf', 'normalise: leading an');
select is(public.normalise_entry('Schindler''s List'), 'schindlers list', 'normalise: apostrophe');
select is(public.normalise_entry('Fast & Furious'), 'fast and furious', 'normalise: ampersand');
select is(public.normalise_entry('Theatre of Blood'), 'theatre of blood', 'normalise: only a whole leading article');
select is(public.normalise_entry('Beauty and the Beast'), 'beauty and the beast', 'normalise: inner article kept');
select is(
  (select count(distinct public.entry_key(t))::int
     from unnest(array['spiderman', 'Spiderman', 'Spider-Man', 'Spider Man', ' SPIDER-man! ', 'The Spider-Man']) t),
  1, 'entry_key: all Spider-Man spellings collide');
select isnt(public.entry_key('Spider-Man 2'), public.entry_key('Spider-Man'), 'entry_key: sequel stays distinct');

-- Fixtures
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

-- Harry: 15 distinct (complete). Joe: 15 with a repeat. Sean: 9 (draft).
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.save_nominations('00000000-0000-0000-0000-00000000bb01',
  array(select 'Film ' || i from generate_series(1, 15) i))$$, 'harry saves 15 distinct');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select lives_ok($$select public.save_nominations('00000000-0000-0000-0000-00000000bb01',
  array['Spider-Man'] || array(select 'Film ' || i from generate_series(1, 13) i) || array['spiderman'])$$,
  'joe can save a draft containing a repeat');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select lives_ok($$select public.save_nominations('00000000-0000-0000-0000-00000000bb01',
  array(select 'Film ' || i from generate_series(1, 9) i))$$, 'sean can save a 9-entry draft');

select results_eq(
  $$select submitted, total from public.nomination_progress('00000000-0000-0000-0000-00000000bb01')$$,
  $$values (1, 3)$$, 'only harry''s list counts as submitted');

select throws_ok($$select * from public.admin_nomination_status('00000000-0000-0000-0000-00000000bb01')$$,
  '42501', null, 'non-admin cannot see per-user status');
select throws_ok($$select * from public.nomination_list_status('00000000-0000-0000-0000-00000000bb01')$$,
  '42501', null, 'internal status function is not callable by users');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select results_eq(
  $$select display_name, count, has_repeats, complete
      from public.admin_nomination_status('00000000-0000-0000-0000-00000000bb01')$$,
  $$values ('Harry'::text, 15, false, true), ('Joe', 15, true, false), ('Sean', 9, false, false)$$,
  'admin sees each user''s count, repeats and completeness');
select is(
  (select count(*)::int from public.nominations where user_id <> auth.uid()), 0,
  'admin status does not reveal content: still cannot read others'' rows');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select lives_ok($$select public.save_nominations('00000000-0000-0000-0000-00000000bb01',
  array['Spider-Man'] || array(select 'Film ' || i from generate_series(1, 13) i) || array['Heat'])$$,
  'joe replaces his repeat');
select results_eq(
  $$select submitted from public.nomination_progress('00000000-0000-0000-0000-00000000bb01')$$,
  $$values (2)$$, 'joe now counts as submitted');
reset role;

select * from finish();
rollback;
