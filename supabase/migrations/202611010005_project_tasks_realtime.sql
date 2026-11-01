begin;

-- Project tasks use the existing RLS policies for event authorization. Only
-- INSERT and UPDATE events are subscribed to by the client; deletes are not
-- broadcast because Postgres Changes cannot apply RLS to DELETE events.
do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication supabase_realtime is missing';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    execute 'alter publication supabase_realtime add table public.tasks';
  end if;
end;
$$;

commit;
