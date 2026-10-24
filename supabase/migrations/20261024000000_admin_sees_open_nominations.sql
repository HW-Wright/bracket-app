-- Harry's decision (2026-10-24): the admin can read everyone's nominations (drafts included) while
-- nominations are open. Everyone else stays blind until close.
drop policy "own nominations, or all once closed" on public.nominations;

create policy "own nominations; admin always; everyone once closed"
  on public.nominations for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.brackets b
      where b.id = bracket_id and b.phase not in ('draft', 'nominations')
    )
  );
