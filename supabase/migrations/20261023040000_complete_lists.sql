-- Harry's rules (2026-10-23): a list counts only when it has exactly 15 entries with no exact repeats.
-- Incomplete lists can be saved as drafts but are excluded from seeding. Admin sees per-user status.

create extension if not exists unaccent with schema extensions;

-- SQL twin of normaliseEntry() in src/lib/normalise.ts. Keep the two in step (tests cover both).
create or replace function public.normalise_entry(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    trim(
      regexp_replace(
        regexp_replace(
          replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, ''))), '&', ' and '),
          '[''’`]', '', 'g'),
        '[^[:alnum:]]+', ' ', 'g')
    ),
    '^(the|a|an) ', '');
$$;

-- SQL twin of entryKey(): normalised with spaces removed. Equality on this = exact duplicate.
create or replace function public.entry_key(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select replace(public.normalise_entry(p_text), ' ', '');
$$;

grant execute on function public.normalise_entry(text), public.entry_key(text) to authenticated;

-- Per-user list status for a bracket. Internal: exposes counts only.
create or replace function public.nomination_list_status(p_bracket_id uuid)
returns table (user_id uuid, display_name text, count int, has_repeats boolean, complete boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.display_name,
    count(n.id)::int,
    count(n.id) <> count(distinct public.entry_key(n.text)),
    count(n.id) = 15 and count(distinct public.entry_key(n.text)) = 15
  from public.profiles p
  left join public.nominations n on n.user_id = p.id and n.bracket_id = p_bracket_id
  where p.active
  group by p.id, p.display_name
  order by p.display_name;
$$;

revoke all on function public.nomination_list_status(uuid) from public, anon, authenticated;

-- "5 of 8 have submitted": complete lists only.
create or replace function public.nomination_progress(p_bracket_id uuid)
returns table (submitted int, total int)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where s.complete)::int, count(*)::int
  from public.nomination_list_status(p_bracket_id) s;
$$;

-- Admin only: who has / hasn't completed (names and counts, never content).
create or replace function public.admin_nomination_status(p_bracket_id uuid)
returns table (user_id uuid, display_name text, count int, has_repeats boolean, complete boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query select * from public.nomination_list_status(p_bracket_id);
end;
$$;

revoke all on function public.admin_nomination_status(uuid) from public, anon;
grant execute on function public.admin_nomination_status(uuid) to authenticated;
