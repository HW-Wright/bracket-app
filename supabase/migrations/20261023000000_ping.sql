-- Tiny real database call used by the app's health check and the keep-alive workflow.
create or replace function public.ping()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
