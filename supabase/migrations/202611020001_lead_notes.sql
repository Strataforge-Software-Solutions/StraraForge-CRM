-- Keep conversation notes with the workspace lead so both founders can read them.
begin;

alter table public.leads
  add column if not exists notes text
  check (notes is null or char_length(notes) <= 5000);

notify pgrst, 'reload schema';

commit;
