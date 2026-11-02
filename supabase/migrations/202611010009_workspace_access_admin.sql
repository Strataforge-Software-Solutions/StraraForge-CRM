begin;

create or replace function private.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (
      select 1 from public.workspace_members member
      where member.workspace_id = target_workspace_id
        and member.user_id = auth.uid()
        and member.active = true
        and member.role = 'admin'
    );
$$;
revoke all on function private.is_workspace_admin(uuid) from public, anon;
grant execute on function private.is_workspace_admin(uuid) to authenticated;

create or replace function public.admin_list_workspace_members(p_workspace_id uuid)
returns table(user_id uuid, email text, role text, active boolean, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_workspace_admin(p_workspace_id) then
    raise exception 'Administrator access is required';
  end if;

  return query
    select member.user_id, auth_user.email::text, member.role, member.active, member.joined_at
    from public.workspace_members member
    join auth.users auth_user on auth_user.id = member.user_id
    where member.workspace_id = p_workspace_id
    order by member.active desc, member.joined_at, auth_user.email;
end;
$$;
revoke all on function public.admin_list_workspace_members(uuid) from public, anon;
grant execute on function public.admin_list_workspace_members(uuid) to authenticated;

create or replace function public.admin_grant_workspace_access(p_workspace_id uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  target_email text := lower(trim(p_email));
  previous_active boolean;
begin
  if not private.is_workspace_admin(p_workspace_id) then
    raise exception 'Administrator access is required';
  end if;
  if p_role is null or p_role not in ('admin', 'member', 'developer') then
    raise exception 'Choose a valid workspace role';
  end if;
  if target_email is null or char_length(target_email) > 320 or position('@' in target_email) < 2 then
    raise exception 'Enter a valid account email';
  end if;

  select auth_user.id into target_user_id
  from auth.users auth_user
  where lower(auth_user.email) = target_email
    and auth_user.email_confirmed_at is not null
  limit 1;
  if target_user_id is null then
    raise exception 'No email-confirmed account was found. The person must sign up and confirm this email first.';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You already have workspace access';
  end if;

  perform 1 from public.workspaces workspace
  where workspace.id = p_workspace_id
  for update;
  if not found then raise exception 'Workspace not found'; end if;

  select member.active into previous_active
  from public.workspace_members member
  where member.workspace_id = p_workspace_id and member.user_id = target_user_id
  for update;

  if previous_active is true then
    raise exception 'This account already has active workspace access';
  elsif previous_active is false then
    update public.workspace_members
    set active = true, role = p_role, joined_at = now()
    where workspace_id = p_workspace_id and user_id = target_user_id;
  else
    insert into public.workspace_members (workspace_id, user_id, role, active)
    values (p_workspace_id, target_user_id, p_role, true);
  end if;

  insert into public.audit_events (workspace_id, actor_user_id, action, subject_type, subject_id, details)
  values (p_workspace_id, auth.uid(), 'workspace_member_granted', 'workspace_member', target_user_id,
    jsonb_build_object('role', p_role));
  return target_user_id;
end;
$$;
revoke all on function public.admin_grant_workspace_access(uuid, text, text) from public, anon;
grant execute on function public.admin_grant_workspace_access(uuid, text, text) to authenticated;

create or replace function public.admin_set_workspace_member_role(p_workspace_id uuid, p_user_id uuid, p_role text)
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
  if p_role is null or p_role not in ('admin', 'member', 'developer') then
    raise exception 'Choose a valid workspace role';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
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
  if previous_role = p_role then return; end if;

  if previous_role = 'admin' and p_role <> 'admin' then
    select count(*) into remaining_admins
    from public.workspace_members member
    where member.workspace_id = p_workspace_id and member.active = true and member.role = 'admin';
    if remaining_admins <= 1 then raise exception 'The workspace must keep at least one active administrator'; end if;
  end if;

  update public.workspace_members
  set role = p_role
  where workspace_id = p_workspace_id and user_id = p_user_id;

  insert into public.audit_events (workspace_id, actor_user_id, action, subject_type, subject_id, details)
  values (p_workspace_id, auth.uid(), 'workspace_member_role_changed', 'workspace_member', p_user_id,
    jsonb_build_object('from_role', previous_role, 'to_role', p_role));
end;
$$;
revoke all on function public.admin_set_workspace_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.admin_set_workspace_member_role(uuid, uuid, text) to authenticated;

commit;
