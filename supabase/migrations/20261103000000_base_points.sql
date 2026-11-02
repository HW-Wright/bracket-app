-- Harry (2026-11-03): how many people nominated an entry should matter more than how they ranked it, with both
-- still counting. Every counted nomination now earns a base 15 points on top of 16 - rank (#1 = 30 ... #15 = 16),
-- so anything two people nominate (at least 32) outranks any single pick (at most 30), while rankings still order
-- everything and can outweigh one extra nominator further up (two #1s = 60 beat three #15s = 48).
--
-- The base is stored per bracket so brackets scored before this keep their points: existing rows get 0 (plain
-- 16 - rank), new brackets default to 15. Mirrors nominationPoints() in src/lib/normalise.ts.

alter table public.brackets add column base_points smallint not null default 0 check (base_points >= 0);
alter table public.brackets alter column base_points set default 15;

-- Same as before except the points line, which now adds the bracket's base once per nominator.
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
    select b.root, sum(k.base_points + 16 - b.best_rank)::int as pts, count(*)::int as noms
      from best b
      cross join (select base_points from public.brackets where id = p_bracket_id) k
     group by b.root
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
