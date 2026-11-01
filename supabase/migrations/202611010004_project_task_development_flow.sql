begin;

alter table public.tasks
  add column if not exists development_stage text;

update public.tasks
set development_stage = case
  when status = 'completed' then 'released'
  when status = 'in_progress' then 'building'
  else 'new_feature'
end
where project_id is not null and development_stage is null;

alter table public.tasks
  drop constraint if exists tasks_development_stage_check;
alter table public.tasks
  add constraint tasks_development_stage_check
  check (development_stage is null or development_stage in (
    'new_feature', 'planned', 'building', 'code_review',
    'testing', 'client_review', 'ready_to_deploy', 'released'
  ));

create or replace function private.sync_project_task_development_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is not null then
    if new.status = 'completed' then
      new.development_stage := 'released';
    elsif new.development_stage is null then
      new.development_stage := 'new_feature';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_sync_project_development_stage on public.tasks;
create trigger tasks_sync_project_development_stage
  before insert or update of project_id, status, development_stage on public.tasks
  for each row execute function private.sync_project_task_development_stage();

drop function if exists public.get_project_delivery_tasks(uuid);
create function public.get_project_delivery_tasks(p_project_id uuid)
returns table(
  task_id uuid,
  project_id uuid,
  project_name text,
  title text,
  description text,
  due_at timestamptz,
  task_status text,
  development_stage text,
  is_claimed boolean,
  assigned_to_me boolean
)
language plpgsql
stable
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
  if not exists (
    select 1 from public.projects project
    where project.id = p_project_id and project.workspace_id = current_workspace
      and project.archived_at is null
  ) then raise exception 'Project not found'; end if;
  return query
  select task.id, task.project_id, project.name, task.title, task.description,
    task.due_at, task.status, coalesce(task.development_stage, 'new_feature'),
    task.assignee_user_id is not null, task.assignee_user_id = auth.uid()
  from public.tasks task
  join public.projects project
    on project.id = task.project_id and project.workspace_id = task.workspace_id
  where task.project_id = p_project_id
    and task.workspace_id = current_workspace
    and task.archived_at is null
  order by case when task.assignee_user_id is null then 0 else 1 end,
    task.due_at nulls last, task.created_at desc;
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
    'new_feature', 'planned', 'building', 'code_review',
    'testing', 'client_review', 'ready_to_deploy', 'released'
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

revoke all on function public.get_project_delivery_tasks(uuid) from public, anon;
revoke all on function public.set_project_delivery_task_stage(uuid, text) from public, anon;
grant execute on function public.get_project_delivery_tasks(uuid) to authenticated;
grant execute on function public.set_project_delivery_task_stage(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
