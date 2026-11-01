alter table public.leads
  add column if not exists timeline text check (timeline is null or char_length(timeline) <= 120);

notify pgrst, 'reload schema';
