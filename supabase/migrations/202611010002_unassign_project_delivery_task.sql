begin;

create or replace function public.unassign_project_delivery_task(p_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_workspace uuid;
begin
  select member.workspace_id into current_workspace
  from public.workspace_members member
  where member.user_id = auth.uid() and member.active = true
  order by member.joined_at
  limit 1;

  if current_workspace is null or not private.has_workspace_access(current_workspace) then
    raise exception 'Workspace access is required';
  end if;

  update public.tasks task
  set assignee_user_id = null,
      status = 'open',
      completed_at = null
  where task.id = p_task_id
    and task.workspace_id = current_workspace
    and task.project_id is not null
    and task.assignee_user_id = auth.uid()
    and task.archived_at is null
    and task.status in ('open', 'in_progress');

  if not found then
    raise exception 'Only your own unfinished task can be unassigned';
  end if;

  return true;
end;
$$;

revoke all on function public.unassign_project_delivery_task(uuid) from public, anon;
grant execute on function public.unassign_project_delivery_task(uuid) to authenticated;

commit;
