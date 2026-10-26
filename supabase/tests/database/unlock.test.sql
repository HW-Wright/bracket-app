begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'joe@test.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, username, display_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry', 'Harry', true),
  ('00000000-0000-0000-0000-0000000000b2', 'joe', 'Joe', false);
insert into public.brackets (id, title, phase) values ('00000000-0000-0000-0000-00000000bb01', 'Films', 'review');
insert into public.entries (bracket_id, name, manual, tiebreak)
  select '00000000-0000-0000-0000-00000000bb01', 'E' || lpad(i::text, 2, '0'), true, i / 100.0 from generate_series(1, 66) i;

create function pg_temp.claims(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- An earlier merge (review work that must survive), then lock and vote.
select pg_temp.claims('00000000-0000-0000-0000-0000000000a1');
select public.merge_entries((select id from public.entries where name = 'E65'), (select id from public.entries where name = 'E66'), 'E65+66');
select public.lock_seeding('00000000-0000-0000-0000-00000000bb01');
select pg_temp.claims('00000000-0000-0000-0000-0000000000b2');
select public.cast_vote(m.id, m.entry_a) from public.matchups m where m.round = 1;

select pg_temp.claims('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$select public.unlock_seeding('00000000-0000-0000-0000-00000000bb01', 'UNLOCK')$$, '42501', null, 'non-admin cannot unlock');
select pg_temp.claims('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.unlock_seeding('00000000-0000-0000-0000-00000000bb01', 'yes')$$, 'P0001', 'Type UNLOCK to confirm', 'needs typed confirmation');
select lives_ok($$select public.unlock_seeding('00000000-0000-0000-0000-00000000bb01', 'unlock')$$, 'admin unlocks');

select is((select phase::text from public.brackets), 'review', 'bracket is back in review');
select is((select count(*)::int from public.matchups) + (select count(*)::int from public.stages) + (select count(*)::int from public.votes)
  + (select count(*)::int from public.matchup_tallies) + (select count(*)::int from public.mystery_seeds), 0,
  'matchups, stages, votes, tallies and mystery seeds are cleared');
select is((select count(*)::int from public.entries where seed is not null), 0, 'seed numbers cleared');
select is((select count(*)::int from public.entries), 66, 'every entry kept');
select is((select count(*)::int from public.entries where merged_into is not null), 1, 'earlier merge kept');

-- Fix a missed duplicate, then re-lock.
select lives_ok($$select public.merge_entries((select id from public.entries where name = 'E01'), (select id from public.entries where name = 'E02'), 'E01+02')$$,
  'can merge again after unlocking');
select lives_ok($$select public.lock_seeding('00000000-0000-0000-0000-00000000bb01')$$, 're-lock works');
select is((select count(*)::int from public.matchups), 64, 'fresh bracket built');
select is((select count(*)::int from public.mystery_seeds), 2, 'mystery seeds re-dealt');

select * from finish();
rollback;
