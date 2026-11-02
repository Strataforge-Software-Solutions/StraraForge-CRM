alter table public.leads
  add column if not exists project_type text check (project_type is null or char_length(trim(project_type)) between 1 and 120);

notify pgrst, 'reload schema';
