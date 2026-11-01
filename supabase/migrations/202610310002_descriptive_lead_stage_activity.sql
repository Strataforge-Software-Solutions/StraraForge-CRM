-- Preserve the destination of lead stage changes in the existing workspace audit feed.
create or replace function private.audit_crm_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_id uuid;
  workspace uuid;
  event_action text := lower(tg_op);
  event_details jsonb := '{}'::jsonb;
begin
  if tg_op = 'DELETE' then
    record_id := old.id;
    workspace := old.workspace_id;
  else
    record_id := new.id;
    workspace := new.workspace_id;
  end if;

  if tg_table_name = 'leads' and tg_op = 'UPDATE' and old.stage is distinct from new.stage then
    event_action := 'stage_changed';
    event_details := jsonb_build_object('from', old.stage, 'to', new.stage);
  end if;

  insert into public.audit_events (workspace_id, actor_user_id, action, subject_type, subject_id, details)
  values (workspace, auth.uid(), event_action, tg_table_name, record_id, event_details);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.audit_crm_record_change() from public, anon, authenticated;
