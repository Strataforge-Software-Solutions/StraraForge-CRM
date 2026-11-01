begin;

create or replace function private.require_assignment_for_project_task_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare is_project_task boolean;
begin
  if tg_op = 'INSERT' then
    is_project_task := new.project_id is not null;
  else
    is_project_task := new.project_id is not null or old.project_id is not null;
  end if;

  if is_project_task and new.status = 'completed' and new.assignee_user_id is null then
    raise exception using
      errcode = '23514',
      message = 'Assign this project task before completing it';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_require_assignment_for_project_completion on public.tasks;
create trigger tasks_require_assignment_for_project_completion
  before insert or update of project_id, assignee_user_id, status on public.tasks
  for each row execute function private.require_assignment_for_project_task_completion();

commit;
