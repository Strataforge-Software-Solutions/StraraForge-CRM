alter table public.clients
  add column if not exists tags text[] not null default '{}'::text[]
  check (cardinality(tags) <= 12 and array_position(tags, null) is null);
