begin;

-- Developer accounts are limited to project delivery work. Existing CRM access
-- remains for administrators and members; task-page access is separately
-- checked for developers below.
alter table public.workspace_members
  drop constraint workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('admin', 'member', 'developer'));

create or replace function private.has_workspace_access(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (
      select 1
      from public.workspace_members member
      where member.workspace_id = target_workspace_id
        and member.user_id = auth.uid()
        and member.active = true
    );
$$;
revoke all on function private.has_workspace_access(uuid) from public, anon;
grant execute on function private.has_workspace_access(uuid) to authenticated;

create or replace function private.has_crm_access(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_workspace_access(target_workspace_id)
    and exists (
      select 1
      from public.workspace_members member
      where member.workspace_id = target_workspace_id
        and member.user_id = auth.uid()
        and member.active = true
        and member.role in ('admin', 'member')
    );
$$;
revoke all on function private.has_crm_access(uuid) from public, anon;
grant execute on function private.has_crm_access(uuid) to authenticated;

drop policy if exists "verified founder can see workspace" on public.workspaces;
create policy "verified member can see workspace"
  on public.workspaces for select to authenticated
  using (private.has_workspace_access(id));

alter table public.tasks alter column assignee_user_id drop not null;
comment on column public.tasks.assignee_user_id is
  'NULL means the project delivery task is available for a workspace member to claim.';

-- Restrict direct table access. Developers use the scoped RPCs below, which
-- reveal project delivery information without exposing the wider CRM schema.
drop policy if exists crm_tasks_select on public.tasks;
drop policy if exists crm_tasks_insert on public.tasks;
drop policy if exists crm_tasks_update on public.tasks;

create policy crm_tasks_select on public.tasks
  for select to authenticated
  using (
    private.has_crm_access(workspace_id)
    or (
      project_id is not null
      and private.has_workspace_access(workspace_id)
      and exists (
        select 1 from public.workspace_members member
        where member.workspace_id = tasks.workspace_id
          and member.user_id = auth.uid()
          and member.active = true
          and member.role = 'developer'
      )
    )
  );

create policy crm_tasks_insert on public.tasks
  for insert to authenticated
  with check (
    private.has_crm_access(workspace_id)
    and created_by = (select auth.uid())
    and assignee_user_id is not null
  );

create policy crm_tasks_update on public.tasks
  for update to authenticated
  using (private.has_crm_access(workspace_id))
  with check (private.has_crm_access(workspace_id));

create or replace function public.list_project_task_projects()
returns table(project_id uuid, project_name text, project_status text, task_count bigint)
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
  return query
  select project.id, project.name, project.status,
    count(task.id) filter (where task.archived_at is null)
  from public.projects project
  left join public.tasks task
    on task.project_id = project.id and task.workspace_id = project.workspace_id
  where project.workspace_id = current_workspace
    and project.archived_at is null
    and project.status not in ('completed', 'cancelled')
  group by project.id
  order by project.updated_at desc, project.name;
end;
$$;

create or replace function public.get_project_delivery_tasks(p_project_id uuid)
returns table(
  task_id uuid,
  project_id uuid,
  project_name text,
  title text,
  description text,
  due_at timestamptz,
  task_status text,
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
    task.due_at, task.status, task.assignee_user_id is not null,
    task.assignee_user_id = auth.uid()
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

create or replace function public.create_project_delivery_task(
  p_project_id uuid,
  p_title text,
  p_description text default null,
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare current_workspace uuid; new_task_id uuid;
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
      and project.archived_at is null and project.status not in ('completed', 'cancelled')
  ) then raise exception 'Choose an active project'; end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 240 then
    raise exception 'Enter a task title (up to 240 characters)';
  end if;
  if p_description is not null and char_length(p_description) > 5000 then
    raise exception 'Description must be 5000 characters or fewer';
  end if;
  insert into public.tasks (
    workspace_id, project_id, title, description, due_at, status,
    assignee_user_id, created_by
  ) values (
    current_workspace, p_project_id, trim(p_title), nullif(trim(p_description), ''),
    p_due_at, 'open', null, auth.uid()
  ) returning id into new_task_id;
  return new_task_id;
end;
$$;

create or replace function public.claim_project_delivery_task(p_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_workspace uuid; task_owner uuid;
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
  set assignee_user_id = auth.uid()
  where task.id = p_task_id and task.workspace_id = current_workspace
    and task.project_id is not null and task.assignee_user_id is null
    and task.archived_at is null and task.status = 'open'
  returning task.assignee_user_id into task_owner;
  if found then return true; end if;
  select task.assignee_user_id into task_owner
  from public.tasks task
  where task.id = p_task_id and task.workspace_id = current_workspace;
  return coalesce(task_owner = auth.uid(), false);
end;
$$;

create or replace function public.set_project_delivery_task_status(
  p_task_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_workspace uuid; task_owner uuid;
begin
  select member.workspace_id into current_workspace
  from public.workspace_members member
  where member.user_id = auth.uid() and member.active = true
  order by member.joined_at
  limit 1;
  if current_workspace is null or not private.has_workspace_access(current_workspace) then
    raise exception 'Workspace access is required';
  end if;
  if p_status not in ('open', 'in_progress', 'completed') then
    raise exception 'Invalid task status';
  end if;
  select task.assignee_user_id into task_owner
  from public.tasks task
  where task.id = p_task_id and task.workspace_id = current_workspace
    and task.project_id is not null and task.archived_at is null
  for update;
  if not found then raise exception 'Task not found'; end if;
  if task_owner is distinct from auth.uid() and not private.has_crm_access(current_workspace) then
    raise exception 'Claim this task before changing its status';
  end if;
  update public.tasks task
  set status = p_status,
      completed_at = case when p_status = 'completed' then coalesce(task.completed_at, now()) else null end
  where task.id = p_task_id and task.workspace_id = current_workspace;
  return true;
end;
$$;

revoke all on function public.list_project_task_projects() from public, anon;
revoke all on function public.get_project_delivery_tasks(uuid) from public, anon;
revoke all on function public.create_project_delivery_task(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.claim_project_delivery_task(uuid) from public, anon;
revoke all on function public.set_project_delivery_task_status(uuid, text) from public, anon;
grant execute on function public.list_project_task_projects() to authenticated;
grant execute on function public.get_project_delivery_tasks(uuid) to authenticated;
grant execute on function public.create_project_delivery_task(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.claim_project_delivery_task(uuid) to authenticated;
grant execute on function public.set_project_delivery_task_status(uuid, text) to authenticated;

commit;
