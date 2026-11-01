alter table public.leads
  add column if not exists location text check (location is null or char_length(location) <= 240);

notify pgrst, 'reload schema';
