begin;

create or replace function public.admin_remove_workspace_access(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_role text;
  remaining_admins integer;
begin
  if not private.is_workspace_admin(p_workspace_id) then
    raise exception 'Administrator access is required';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove your own workspace access';
  end if;

  perform 1 from public.workspaces workspace
  where workspace.id = p_workspace_id
  for update;
  if not found then raise exception 'Workspace not found'; end if;

  select member.role into previous_role
  from public.workspace_members member
  where member.workspace_id = p_workspace_id
    and member.user_id = p_user_id
    and member.active = true
  for update;
  if previous_role is null then raise exception 'Active workspace member not found'; end if;

  if previous_role = 'admin' then
    select count(*) into remaining_admins
    from public.workspace_members member
    where member.workspace_id = p_workspace_id
      and member.active = true
      and member.role = 'admin';
    if remaining_admins <= 1 then
      raise exception 'The workspace must keep at least one active administrator';
    end if;
  end if;

  update public.workspace_members
  set active = false
  where workspace_id = p_workspace_id and user_id = p_user_id and active = true;

  insert into public.audit_events (workspace_id, actor_user_id, action, subject_type, subject_id, details)
  values (p_workspace_id, auth.uid(), 'workspace_member_removed', 'workspace_member', p_user_id,
    jsonb_build_object('role', previous_role));
end;
$$;
revoke all on function public.admin_remove_workspace_access(uuid, uuid) from public, anon;
grant execute on function public.admin_remove_workspace_access(uuid, uuid) to authenticated;

commit;
