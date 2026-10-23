begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'joe@test.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, username, display_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry', 'Harry', true),
  ('00000000-0000-0000-0000-0000000000b2', 'joe', 'Joe', false);
insert into public.brackets (id, title, phase) values
  ('00000000-0000-0000-0000-00000000bb01', 'Test – ignore', 'nominations');
insert into public.nominations (bracket_id, user_id, rank, text) values
  ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-0000000000b2', 1, 'Heat');

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$select public.abandon_bracket('00000000-0000-0000-0000-00000000bb01', 'Test – ignore')$$,
  '42501', null, 'non-admin cannot abandon');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.abandon_bracket('00000000-0000-0000-0000-00000000bb01', 'test')$$,
  'P0001', 'Type the bracket title exactly to confirm', 'wrong confirmation is refused');
select lives_ok($$select public.abandon_bracket('00000000-0000-0000-0000-00000000bb01', '  test – IGNORE ')$$,
  'admin abandons with matching title (case-insensitive)');

reset role;
select is((select count(*)::int from public.brackets), 0, 'bracket deleted');
select is((select count(*)::int from public.nominations), 0, 'its nominations cascaded');

insert into public.brackets (id, title, phase) values ('00000000-0000-0000-0000-00000000bb02', 'Live one', 'live');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.abandon_bracket('00000000-0000-0000-0000-00000000bb02', 'Live one')$$,
  'live brackets can be abandoned too (typed title)');

select * from finish();
rollback;
