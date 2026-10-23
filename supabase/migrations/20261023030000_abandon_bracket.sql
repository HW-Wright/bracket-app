-- Admin: throw away a bracket that has not gone live (testing, or a false start).
-- Typed confirmation: p_confirm_title must match the bracket title (case/whitespace-insensitive).
-- Everything hanging off the bracket must cascade on delete.
create or replace function public.abandon_bracket(p_bracket_id uuid, p_confirm_title text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bracket public.brackets;
begin
  perform public.require_admin();
  select * into v_bracket from public.brackets where id = p_bracket_id and archived_at is null for update;
  if not found then
    raise exception 'Bracket not found' using errcode = 'P0002';
  end if;
  if v_bracket.phase not in ('draft', 'nominations', 'review') then
    raise exception 'Brackets that have gone live cannot be abandoned' using errcode = 'P0001';
  end if;
  if lower(trim(coalesce(p_confirm_title, ''))) <> lower(trim(v_bracket.title)) then
    raise exception 'Type the bracket title exactly to confirm' using errcode = 'P0001';
  end if;
  delete from public.brackets where id = p_bracket_id;
end;
$$;

revoke all on function public.abandon_bracket(uuid, text) from public, anon;
grant execute on function public.abandon_bracket(uuid, text) to authenticated;
