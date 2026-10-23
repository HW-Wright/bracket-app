begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry@test.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, username, display_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'harry', 'Harry', true);
insert into public.brackets (id, title, phase) values ('00000000-0000-0000-0000-00000000bb01', 'Films', 'nominations');
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select public.save_nominations('00000000-0000-0000-0000-00000000bb01', array(select 'Film ' || i from generate_series(1, 15) i));
select public.set_bracket_phase('00000000-0000-0000-0000-00000000bb01', 'review');
select is((select count(*)::int from public.entries), 15, 'close builds 15 entries');
select public.add_manual_entry('00000000-0000-0000-0000-00000000bb01', 'Manual');

select lives_ok($$select public.set_bracket_phase('00000000-0000-0000-0000-00000000bb01', 'nominations')$$, 'reopen');
select is((select count(*)::int from public.entries), 0, 'reopening discards entries (incl. manual)');
select is((select count(*)::int from public.nominations where entry_id is not null), 0, 'and unlinks nominations');

select public.set_bracket_phase('00000000-0000-0000-0000-00000000bb01', 'review');
select is((select count(*)::int from public.entries), 15, 'closing again rebuilds');

select * from finish();
rollback;
