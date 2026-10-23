begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Fixtures (as postgres, bypassing RLS)
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'joe@test.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, username, display_name, is_admin, must_change_password) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry', 'Harry', true, true),
  ('00000000-0000-0000-0000-0000000000b2', 'joe', 'Joe', false, true);

-- Anonymous: nothing
set local role anon;
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select public.is_admin()', '42501', null, 'anon cannot call is_admin()');

-- Joe (non-admin)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select is((select count(*)::int from public.profiles), 2, 'signed-in user can read all profiles');
select is(public.is_admin(), false, 'joe is not admin');
select throws_ok(
  $$update public.profiles set is_admin = true where id = auth.uid()$$,
  '42501', null, 'joe cannot make himself admin');
select throws_ok(
  $$insert into public.profiles (id, username, display_name) values (gen_random_uuid(), 'mallory', 'M')$$,
  '42501', null, 'joe cannot insert profiles');
select throws_ok(
  $$delete from public.profiles$$,
  '42501', null, 'joe cannot delete profiles');
select lives_ok('select public.complete_password_change()', 'joe can clear his own flag');

-- Harry (admin)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is(public.is_admin(), true, 'harry is admin');

reset role;
select is(
  (select must_change_password from public.profiles where username = 'joe'), false,
  'complete_password_change cleared joe''s flag');
select is(
  (select must_change_password from public.profiles where username = 'harry'), true,
  '...and did not touch harry''s');

select * from finish();
rollback;
