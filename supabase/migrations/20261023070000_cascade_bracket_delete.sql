-- Deleting a bracket must take everything with it, including votes and matchups that point at its
-- entries (cascaded deletes check NO ACTION foreign keys per cascaded statement, so order mattered).
alter table public.votes drop constraint votes_entry_id_fkey,
  add constraint votes_entry_id_fkey foreign key (entry_id) references public.entries (id) on delete cascade;

alter table public.matchups
  drop constraint matchups_entry_a_fkey,
  drop constraint matchups_entry_b_fkey,
  drop constraint matchups_winner_fkey,
  drop constraint matchups_coin_toss_winner_fkey,
  add constraint matchups_entry_a_fkey foreign key (entry_a) references public.entries (id) on delete set null,
  add constraint matchups_entry_b_fkey foreign key (entry_b) references public.entries (id) on delete set null,
  add constraint matchups_winner_fkey foreign key (winner) references public.entries (id) on delete set null,
  add constraint matchups_coin_toss_winner_fkey foreign key (coin_toss_winner) references public.entries (id) on delete set null;

alter table public.entries drop constraint entries_merged_into_fkey,
  add constraint entries_merged_into_fkey foreign key (merged_into) references public.entries (id) on delete cascade;
