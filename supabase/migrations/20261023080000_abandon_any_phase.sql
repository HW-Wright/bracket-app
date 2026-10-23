-- Harry's decision (2026-10-23): any active bracket can be abandoned, including live and complete ones.
-- Still admin-only with the typed-title confirmation. Everything under the bracket cascades.
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
  if lower(trim(coalesce(p_confirm_title, ''))) <> lower(trim(v_bracket.title)) then
    raise exception 'Type the bracket title exactly to confirm' using errcode = 'P0001';
  end if;
  delete from public.brackets where id = p_bracket_id;
end;
$$;
