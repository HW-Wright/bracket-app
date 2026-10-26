-- Harry (2026-10-26): step a live bracket back to review to fix missed duplicates. Keeps all review work
-- (entries, merges, removals, manual entries, images); discards everything built from the seeding:
-- matchups (and their votes/tallies), stages, the undo stack, mystery seeds, and the seed numbers.
create or replace function public.unlock_seeding(p_bracket_id uuid, p_confirm text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if upper(trim(coalesce(p_confirm, ''))) <> 'UNLOCK' then
    raise exception 'Type UNLOCK to confirm' using errcode = 'P0001';
  end if;
  perform 1 from public.brackets where id = p_bracket_id and phase = 'live' and archived_at is null for update;
  if not found then
    raise exception 'Only a live bracket can be unlocked (use Undo last advance on a finished one first)' using errcode = 'P0001';
  end if;

  delete from public.mystery_seeds where bracket_id = p_bracket_id;
  delete from public.stage_advances where bracket_id = p_bracket_id;
  delete from public.matchups where bracket_id = p_bracket_id; -- cascades votes and tallies
  delete from public.stages where bracket_id = p_bracket_id;
  update public.entries set seed = null where bracket_id = p_bracket_id;
  update public.brackets set phase = 'review', locked_at = null where id = p_bracket_id;
end;
$$;

revoke all on function public.unlock_seeding(uuid, text) from public, anon;
grant execute on function public.unlock_seeding(uuid, text) to authenticated;
