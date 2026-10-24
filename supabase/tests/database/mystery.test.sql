begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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
create function pg_temp.claims(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.claims('00000000-0000-0000-0000-0000000000a1');
select public.lock_seeding('00000000-0000-0000-0000-00000000bb01');

select is((select count(*)::int from public.mystery_seeds), 3, 'locking deals one mystery seed per active player');
select is((select count(distinct entry_id)::int from public.mystery_seeds), 3, 'all different entries');
select is((select count(*)::int from public.mystery_seeds ms join public.entries e on e.id = ms.entry_id where e.seed is null), 0, 'only seeded entries are dealt');
select is(public.deal_mystery_seeds('00000000-0000-0000-0000-00000000bb01'), 0, 'dealing again does nothing (idempotent)');

-- Pin the deal so the test is deterministic: Joe seed 1, Sean seed 2, Harry seed 64.
delete from public.mystery_seeds;
insert into public.mystery_seeds (bracket_id, user_id, entry_id)
select '00000000-0000-0000-0000-00000000bb01', u, (select id from public.entries where seed = s)
  from (values ('00000000-0000-0000-0000-0000000000b2'::uuid, 1), ('00000000-0000-0000-0000-0000000000c3', 2), ('00000000-0000-0000-0000-0000000000a1', 64)) v(u, s);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$select * from public.mystery_seeds$$, '42501', null, 'the table itself is not readable');
select results_eq($$select display_name from public.mystery_board('00000000-0000-0000-0000-00000000bb01') order by "position"$$,
  $$values ('Joe'::text), ('Sean'), ('Harry')$$, 'players listed in seed order, best first');
select is((select entry_seed::int from public.mystery_board('00000000-0000-0000-0000-00000000bb01') where is_mine), 1, 'Joe sees his own entry');
select is((select count(*)::int from public.mystery_board('00000000-0000-0000-0000-00000000bb01') where not is_mine and (entry_id is not null or entry_seed is not null or entry_name is not null)),
  0, 'Joe sees nothing about the others while their entries are alive (no name, no seed)');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.mystery_board('00000000-0000-0000-0000-00000000bb01') where not is_mine and entry_id is not null),
  0, 'the admin cannot see anyone else''s either');

-- Round of 64: everyone backs side a, so seed 64 (Harry's) goes out.
reset role;
do $$
declare mu record;
begin
  for mu in select * from public.matchups where round = 1 loop
    perform pg_temp.claims('00000000-0000-0000-0000-0000000000b2');
    perform public.cast_vote(mu.id, mu.entry_a);
  end loop;
  perform pg_temp.claims('00000000-0000-0000-0000-0000000000a1');
  perform public.close_stage_and_advance('00000000-0000-0000-0000-00000000bb01');
end;
$$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select is((select entry_seed::int || ' ' || status || ' r' || out_round from public.mystery_board('00000000-0000-0000-0000-00000000bb01') where display_name = 'Harry'),
  '64 out r1', 'once Harry''s entry goes out it is revealed to everyone');
select is((select count(*)::int from public.mystery_board('00000000-0000-0000-0000-00000000bb01') where display_name = 'Joe' and entry_id is null and status = 'alive'),
  1, 'Joe''s still-alive entry stays hidden from Sean');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.undo_last_advance('00000000-0000-0000-0000-00000000bb01', 'UNDO');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select is((select entry_id from public.mystery_board('00000000-0000-0000-0000-00000000bb01') where display_name = 'Harry'), null::uuid,
  'undoing the stage hides the reveal again');

reset role;
set local role anon;
select throws_ok($$select * from public.mystery_board('00000000-0000-0000-0000-00000000bb01')$$, '42501', null, 'anon cannot read the board');

reset role;
select lives_ok($$delete from public.brackets$$, 'abandoning a bracket removes its mystery seeds');

select * from finish();
rollback;
