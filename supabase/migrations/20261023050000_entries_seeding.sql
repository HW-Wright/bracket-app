-- Phase 4: entries (built at close), merge/unmerge/split, manual entries, remove/restore, images,
-- scoring, seeding preview, and lock (seeds + full bracket skeleton + stages).
--
-- Model: every counted nomination points at the entry it ORIGINALLY landed in (nominations.entry_id).
-- Merging sets entries.merged_into; an entry's nominations are those of itself plus everything merged
-- into it (recursively). Scores are always computed from that tree, so unmerge = clear merged_into.
--
-- Tiebreak: each entry gets random() once on creation and it is never rewritten. A merged entry keeps
-- the tiebreak of whichever of the two was created first (the earlier entry is always the merge target).

create extension if not exists pg_trgm with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  -- entry_key the entry was auto-built from at close; null for manual / split-off entries.
  source_key text,
  manual boolean not null default false,
  tiebreak double precision not null default random(),
  merged_into uuid references public.entries (id),
  removed_at timestamptz,
  image_path text,
  seed smallint check (seed between 1 and 64),
  created_at timestamptz not null default clock_timestamp(),
  unique (bracket_id, seed),
  check (merged_into is distinct from id)
);
create index entries_bracket_idx on public.entries (bracket_id);
create index entries_merged_into_idx on public.entries (merged_into);

alter table public.nominations
  add column entry_id uuid references public.entries (id) on delete set null;

create table public.entry_suggestion_dismissals (
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  entry_a uuid not null references public.entries (id) on delete cascade,
  entry_b uuid not null references public.entries (id) on delete cascade,
  primary key (entry_a, entry_b),
  check (entry_a < entry_b)
);

create type public.stage_status as enum ('pending', 'open', 'closed');

create table public.stages (
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  number smallint not null check (number between 1 and 10),
  round smallint not null check (round between 1 and 6),
  label text not null,
  status public.stage_status not null default 'pending',
  opened_at timestamptz,
  closed_at timestamptz,
  primary key (bracket_id, number)
);

-- Rounds: 1 = R64 (32), 2 = R32 (16), 3 = R16 (8), 4 = QF (4), 5 = SF (2), 6 = final (slot 0) + third place (slot 1).
-- Round r slot s is fed by round r-1 slots 2s and 2s+1; third place is fed by the two SF losers.
create table public.matchups (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  round smallint not null check (round between 1 and 6),
  slot smallint not null check (slot >= 0),
  stage smallint not null check (stage between 1 and 10),
  entry_a uuid references public.entries (id),
  entry_b uuid references public.entries (id),
  winner uuid references public.entries (id),
  decided_by text check (decided_by in ('votes', 'coin_toss', 'admin')),
  decided_at timestamptz,
  unique (bracket_id, round, slot)
);
create index matchups_bracket_stage_idx on public.matchups (bracket_id, stage);

alter table public.entries enable row level security;
alter table public.entry_suggestion_dismissals enable row level security;
alter table public.stages enable row level security;
alter table public.matchups enable row level security;

revoke all on public.entries, public.entry_suggestion_dismissals, public.stages, public.matchups from anon, authenticated;
grant select on public.entries, public.entry_suggestion_dismissals, public.stages, public.matchups to authenticated;

create policy "entries readable by signed-in users" on public.entries for select to authenticated using (true);
create policy "dismissals readable by admin" on public.entry_suggestion_dismissals for select to authenticated using (public.is_admin());
create policy "stages readable by signed-in users" on public.stages for select to authenticated using (true);
create policy "matchups readable by signed-in users" on public.matchups for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Pure helpers (mirrored in src/lib/bracket.ts)

-- Standard seeding order: [1, 64, 32, 33, 16, 49, ...]. Adjacent pairs are first-round matchups and sum
-- to size+1; seeds 1 and 2 can only meet in the final, 1-4 sit in different quarters, and so on.
create or replace function public.bracket_order(p_size int)
returns int[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v int[] := array[1];
  nxt int[];
  m int;
  x int;
begin
  while cardinality(v) < p_size loop
    m := cardinality(v) * 2;
    nxt := '{}';
    foreach x in array v loop
      nxt := nxt || x || (m + 1 - x);
    end loop;
    v := nxt;
  end loop;
  return v;
end;
$$;

create or replace function public.stage_for(p_round int, p_slot int)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (case p_round
    when 1 then 1 + p_slot / 8
    when 2 then 5 + p_slot / 8
    when 3 then 7
    when 4 then 8
    when 5 then 9
    else 10
  end)::smallint;
$$;

grant execute on function public.bracket_order(int), public.stage_for(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Standings: points, nominators, order. Invoker rights (RLS applies; entries only exist after close).

create or replace function public.entry_standings(p_bracket_id uuid)
returns table (
  entry_id uuid,
  name text,
  points int,
  nominators int,
  tiebreak double precision,
  manual boolean,
  removed boolean,
  image_path text,
  seed smallint,
  merged_count int,
  spellings text[],
  "position" int
)
language sql
stable
set search_path = ''
as $$
  with recursive tree as (
    select e.id, e.id as root
      from public.entries e
     where e.bracket_id = p_bracket_id and e.merged_into is null
    union all
    select e.id, t.root
      from public.entries e
      join tree t on e.merged_into = t.id
  ),
  -- Best-rank rule: a user contributes once per entry, at their best (lowest) rank.
  best as (
    select t.root, n.user_id, min(n.rank) as best_rank
      from public.nominations n
      join tree t on t.id = n.entry_id
     group by t.root, n.user_id
  ),
  agg as (
    select root, sum(16 - best_rank)::int as pts, count(*)::int as noms from best group by root
  ),
  spell as (
    select t.root, array_agg(distinct trim(n.text) order by trim(n.text)) as spellings
      from public.nominations n
      join tree t on t.id = n.entry_id
     group by t.root
  ),
  members as (
    select root, (count(*) - 1)::int as merged from tree group by root
  ),
  r as (
    select e.id, e.name, coalesce(a.pts, 0) as pts, coalesce(a.noms, 0) as noms, e.tiebreak, e.manual,
           e.removed_at is not null as removed, e.image_path, e.seed, m.merged,
           coalesce(s.spellings, '{}') as spellings
      from public.entries e
      join members m on m.root = e.id
      left join agg a on a.root = e.id
      left join spell s on s.root = e.id
     where e.bracket_id = p_bracket_id and e.merged_into is null
  )
  select r.*,
         case when not r.removed
           then (row_number() over (partition by r.removed order by r.pts desc, r.noms desc, r.tiebreak asc, r.id))::int
         end
    from r
   order by r.removed, r.pts desc, r.noms desc, r.tiebreak asc, r.id;
$$;

grant execute on function public.entry_standings(uuid) to authenticated;

-- Likely duplicates among live top-level entries: trigram similarity or a small edit distance.
create or replace function public.duplicate_suggestions(p_bracket_id uuid)
returns table (entry_a uuid, name_a text, entry_b uuid, name_b text, score real)
language sql
stable
set search_path = ''
as $$
  with live as (
    select id, name, public.normalise_entry(name) as nn, public.entry_key(name) as k
      from public.entries
     where bracket_id = p_bracket_id and merged_into is null and removed_at is null
  ),
  pairs as (
    select a.id as ida, a.name as na, b.id as idb, b.name as nb,
           extensions.similarity(a.nn, b.nn) as sim,
           extensions.levenshtein(left(a.k, 255), left(b.k, 255)) as dist,
           least(length(a.k), length(b.k)) as shortest
      from live a
      join live b on a.id < b.id
  )
  select ida, na, idb, nb,
         greatest(sim, case when shortest >= 4 and dist <= 2 then 0.9 - dist * 0.1 else 0 end)::real
    from pairs
   where (sim >= 0.4 or (shortest >= 4 and dist <= 2))
     and not exists (
       select 1 from public.entry_suggestion_dismissals d where d.entry_a = pairs.ida and d.entry_b = pairs.idb
     )
   order by 5 desc, 2, 4;
$$;

grant execute on function public.duplicate_suggestions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Internal: (re)build entries from complete lists. Exact entry_key matches auto-combine.

create or replace function public.build_entries(p_bracket_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.nominations set entry_id = null where bracket_id = p_bracket_id;
  delete from public.entries where bracket_id = p_bracket_id;

  -- One entry per key, named with the most common spelling (then the best-ranked, then alphabetical).
  with counted as (
    select s.user_id from public.nomination_list_status(p_bracket_id) s where s.complete
  ),
  n as (
    select trim(x.text) as t, public.entry_key(x.text) as k, x.rank
      from public.nominations x
     where x.bracket_id = p_bracket_id and x.user_id in (select user_id from counted)
  ),
  spell as (
    select k, t, count(*) as cnt, min(rank) as best from n group by k, t
  ),
  pick as (
    select distinct on (k) k, t from spell order by k, cnt desc, best asc, t asc
  )
  insert into public.entries (bracket_id, name, source_key)
  select p_bracket_id, t, k from pick order by k;

  update public.nominations x
     set entry_id = e.id
    from public.entries e
   where x.bracket_id = p_bracket_id
     and e.bracket_id = p_bracket_id
     and e.source_key = public.entry_key(x.text)
     and x.user_id in (select s.user_id from public.nomination_list_status(p_bracket_id) s where s.complete);
end;
$$;

revoke all on function public.build_entries(uuid) from public, anon, authenticated;

-- Closing builds entries; reopening throws review work away (lists become editable again).
create or replace function public.set_bracket_phase(p_bracket_id uuid, p_to public.bracket_phase)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_from public.bracket_phase;
begin
  perform public.require_admin();
  select phase into v_from from public.brackets
   where id = p_bracket_id and archived_at is null for update;
  if not found then
    raise exception 'Bracket not found' using errcode = 'P0002';
  end if;

  if (v_from, p_to) not in (
    ('draft'::public.bracket_phase, 'nominations'::public.bracket_phase),
    ('nominations', 'review'),
    ('review', 'nominations')
  ) then
    raise exception 'Cannot move bracket from % to %', v_from, p_to using errcode = 'P0001';
  end if;

  update public.brackets
     set phase = p_to,
         nominations_opened_at = case when p_to = 'nominations' then coalesce(nominations_opened_at, now()) else nominations_opened_at end,
         nominations_closed_at = case when p_to = 'review' then now() when p_to = 'nominations' then null else nominations_closed_at end
   where id = p_bracket_id;

  if p_to = 'review' then
    perform public.build_entries(p_bracket_id);
  elsif v_from = 'review' then
    update public.nominations set entry_id = null where bracket_id = p_bracket_id;
    delete from public.entries where bracket_id = p_bracket_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin review actions (review phase only, except images)

create or replace function public.require_review(p_bracket_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_phase public.bracket_phase;
begin
  perform public.require_admin();
  select phase into v_phase from public.brackets where id = p_bracket_id and archived_at is null;
  if v_phase is distinct from 'review' then
    raise exception 'Entries can only be changed while reviewing, before seeding is locked' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.require_review(uuid) from public, anon, authenticated;

create or replace function public.merge_entries(p_a uuid, p_b uuid, p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.entries;
  b public.entries;
  v_target uuid;
  v_other uuid;
begin
  select * into a from public.entries where id = p_a for update;
  select * into b from public.entries where id = p_b for update;
  if a.id is null or b.id is null or a.id = b.id or a.bracket_id <> b.bracket_id then
    raise exception 'Pick two different entries from the same bracket' using errcode = 'P0001';
  end if;
  perform public.require_review(a.bracket_id);
  if a.merged_into is not null or b.merged_into is not null then
    raise exception 'Only top-level entries can be merged' using errcode = 'P0001';
  end if;
  if a.removed_at is not null or b.removed_at is not null then
    raise exception 'Restore removed entries before merging them' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Choose a name for the merged entry' using errcode = 'P0001';
  end if;

  -- The earlier-created entry is the target, so the merged entry keeps its tiebreak.
  if (a.created_at, a.id) <= (b.created_at, b.id) then
    v_target := a.id; v_other := b.id;
  else
    v_target := b.id; v_other := a.id;
  end if;

  update public.entries set merged_into = v_target where id = v_other;
  update public.entries set name = trim(p_name) where id = v_target;
  return v_target;
end;
$$;

-- Detach an entry that was merged into another (its own nominations and sub-merges go with it).
create or replace function public.unmerge_entry(p_entry_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.entries;
begin
  select * into e from public.entries where id = p_entry_id for update;
  if e.id is null or e.merged_into is null then
    raise exception 'That entry is not merged into anything' using errcode = 'P0001';
  end if;
  perform public.require_review(e.bracket_id);
  update public.entries set merged_into = null where id = p_entry_id;
end;
$$;

-- Undo an auto-combine: each distinct spelling among the entry's own nominations becomes its own entry.
create or replace function public.split_entry(p_entry_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.entries;
  v_texts text[];
  v_keep text;
  v_new uuid;
  t text;
  v_count int := 0;
begin
  select * into e from public.entries where id = p_entry_id for update;
  if e.id is null then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;
  perform public.require_review(e.bracket_id);
  if e.merged_into is not null then
    raise exception 'Unmerge this entry first' using errcode = 'P0001';
  end if;

  select array_agg(distinct trim(text) order by trim(text)) into v_texts
    from public.nominations where entry_id = p_entry_id;
  if coalesce(cardinality(v_texts), 0) < 2 then
    raise exception 'Nothing to split: every nomination uses the same spelling' using errcode = 'P0001';
  end if;

  v_keep := case when trim(e.name) = any (v_texts) then trim(e.name) else v_texts[1] end;
  foreach t in array v_texts loop
    continue when t = v_keep;
    insert into public.entries (bracket_id, name) values (e.bracket_id, t) returning id into v_new;
    update public.nominations set entry_id = v_new where entry_id = p_entry_id and trim(text) = t;
    v_count := v_count + 1;
  end loop;
  update public.entries set name = v_keep, source_key = null where id = p_entry_id;
  return v_count;
end;
$$;

create or replace function public.rename_entry(p_entry_id uuid, p_name text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bracket uuid;
begin
  select bracket_id into v_bracket from public.entries where id = p_entry_id;
  perform public.require_review(v_bracket);
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name cannot be blank' using errcode = 'P0001';
  end if;
  update public.entries set name = trim(p_name) where id = p_entry_id;
end;
$$;

-- Manual entries (to reach 64) score 0 points.
create or replace function public.add_manual_entry(p_bracket_id uuid, p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_review(p_bracket_id);
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name cannot be blank' using errcode = 'P0001';
  end if;
  insert into public.entries (bracket_id, name, manual) values (p_bracket_id, trim(p_name), true) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_entry_removed(p_entry_id uuid, p_removed boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.entries;
begin
  select * into e from public.entries where id = p_entry_id for update;
  if e.id is null then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;
  perform public.require_review(e.bracket_id);
  if e.merged_into is not null then
    raise exception 'Unmerge this entry first' using errcode = 'P0001';
  end if;
  update public.entries set removed_at = case when p_removed then now() end where id = p_entry_id;
end;
$$;

create or replace function public.dismiss_suggestion(p_a uuid, p_b uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bracket uuid;
begin
  select bracket_id into v_bracket from public.entries where id = p_a;
  perform public.require_review(v_bracket);
  insert into public.entry_suggestion_dismissals (bracket_id, entry_a, entry_b)
  values (v_bracket, least(p_a, p_b), greatest(p_a, p_b))
  on conflict do nothing;
end;
$$;

-- Images can be set at any time (including after lock) on an active bracket.
create or replace function public.set_entry_image(p_entry_id uuid, p_path text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.entries;
begin
  perform public.require_admin();
  select * into e from public.entries where id = p_entry_id;
  if e.id is null then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;
  if p_path is not null and p_path not like e.bracket_id::text || '/%' then
    raise exception 'Image path must be inside the bracket''s folder' using errcode = 'P0001';
  end if;
  update public.entries set image_path = p_path where id = p_entry_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock: seeds 1-64, bracket skeleton, stages; opens stage 1.

create or replace function public.lock_seeding(p_bracket_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_order int[] := public.bracket_order(64);
  r int;
  s int;
begin
  perform public.require_admin();
  perform 1 from public.brackets where id = p_bracket_id and phase = 'review' and archived_at is null for update;
  if not found then
    raise exception 'Seeding can only be locked from review' using errcode = 'P0001';
  end if;

  select array_agg(entry_id order by "position") into v_ids
    from public.entry_standings(p_bracket_id)
   where "position" <= 64;
  if coalesce(cardinality(v_ids), 0) < 64 then
    raise exception 'Need 64 entries to lock seeding (have %)', coalesce(cardinality(v_ids), 0) using errcode = 'P0001';
  end if;

  update public.entries set seed = null where bracket_id = p_bracket_id;
  for s in 1..64 loop
    update public.entries set seed = s where id = v_ids[s];
  end loop;

  insert into public.stages (bracket_id, number, round, label) values
    (p_bracket_id, 1, 1, 'Round of 64 · Quarter A'),
    (p_bracket_id, 2, 1, 'Round of 64 · Quarter B'),
    (p_bracket_id, 3, 1, 'Round of 64 · Quarter C'),
    (p_bracket_id, 4, 1, 'Round of 64 · Quarter D'),
    (p_bracket_id, 5, 2, 'Round of 32 · Top half'),
    (p_bracket_id, 6, 2, 'Round of 32 · Bottom half'),
    (p_bracket_id, 7, 3, 'Round of 16'),
    (p_bracket_id, 8, 4, 'Quarter-finals'),
    (p_bracket_id, 9, 5, 'Semi-finals'),
    (p_bracket_id, 10, 6, 'Final + third-place playoff');

  for s in 0..31 loop
    insert into public.matchups (bracket_id, round, slot, stage, entry_a, entry_b)
    values (p_bracket_id, 1, s, public.stage_for(1, s), v_ids[v_order[2 * s + 1]], v_ids[v_order[2 * s + 2]]);
  end loop;
  for r in 2..6 loop
    for s in 0..((64 >> r) - 1) loop
      insert into public.matchups (bracket_id, round, slot, stage) values (p_bracket_id, r, s, public.stage_for(r, s));
    end loop;
  end loop;
  insert into public.matchups (bracket_id, round, slot, stage) values (p_bracket_id, 6, 1, 10); -- third place

  update public.stages set status = 'open', opened_at = now() where bracket_id = p_bracket_id and number = 1;
  update public.brackets set phase = 'live', locked_at = now() where id = p_bracket_id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'merge_entries(uuid, uuid, text)', 'unmerge_entry(uuid)', 'split_entry(uuid)', 'rename_entry(uuid, text)',
    'add_manual_entry(uuid, text)', 'set_entry_removed(uuid, boolean)', 'dismiss_suggestion(uuid, uuid)',
    'set_entry_image(uuid, text)', 'lock_seeding(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: entry images. Public read (bucket is public); only admins can write.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entry-images', 'entry-images', true, 524288, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

create policy "admins read entry image objects" on storage.objects for select to authenticated
  using (bucket_id = 'entry-images' and public.is_admin());
create policy "admins upload entry images" on storage.objects for insert to authenticated
  with check (bucket_id = 'entry-images' and public.is_admin());
create policy "admins update entry images" on storage.objects for update to authenticated
  using (bucket_id = 'entry-images' and public.is_admin())
  with check (bucket_id = 'entry-images' and public.is_admin());
create policy "admins delete entry images" on storage.objects for delete to authenticated
  using (bucket_id = 'entry-images' and public.is_admin());
