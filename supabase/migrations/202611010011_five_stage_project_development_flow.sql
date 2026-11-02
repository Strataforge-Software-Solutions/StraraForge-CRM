begin;

update public.tasks
set development_stage = case
  when development_stage in ('code_review', 'client_review') then 'testing'
  when development_stage in ('ready_to_deploy', 'released') then 'deploy'
  when development_stage in ('new_feature', 'planned', 'building', 'testing', 'deploy') then development_stage
  when status = 'completed' then 'deploy'
  when status = 'in_progress' then 'building'
  else 'new_feature'
end
where project_id is not null;

alter table public.tasks
  drop constraint if exists tasks_development_stage_check;
alter table public.tasks
  add constraint tasks_development_stage_check
  check (development_stage is null or development_stage in (
    'new_feature', 'planned', 'building', 'testing', 'deploy'
  ));

create or replace function private.sync_project_task_development_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is not null then
    if new.status = 'completed' then
      new.development_stage := 'deploy';
    elsif new.development_stage is null then
      new.development_stage := 'new_feature';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.set_project_delivery_task_stage(
  p_task_id uuid,
  p_stage text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_workspace uuid; task_owner uuid; task_status text;
begin
  select member.workspace_id into current_workspace
  from public.workspace_members member
  where member.user_id = auth.uid() and member.active = true
  order by member.joined_at
  limit 1;
  if current_workspace is null or not private.has_workspace_access(current_workspace) then
    raise exception 'Workspace access is required';
  end if;
  if p_stage is null or p_stage not in (
    'new_feature', 'planned', 'building', 'testing', 'deploy'
  ) then raise exception 'Choose a valid development stage'; end if;

  select task.assignee_user_id, task.status into task_owner, task_status
  from public.tasks task
  where task.id = p_task_id and task.workspace_id = current_workspace
    and task.project_id is not null and task.archived_at is null
  for update;
  if not found then raise exception 'Project task not found'; end if;
  if task_status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled tasks cannot be moved';
  end if;
  if task_owner is distinct from auth.uid() and not private.has_crm_access(current_workspace) then
    raise exception 'Claim this task before changing its development stage';
  end if;

  update public.tasks task
  set development_stage = p_stage
  where task.id = p_task_id and task.workspace_id = current_workspace;
  return true;
end;
$$;

notify pgrst, 'reload schema';

commit;
