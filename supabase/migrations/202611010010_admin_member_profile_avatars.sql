begin;

drop function if exists public.admin_list_workspace_members(uuid);

create function public.admin_list_workspace_members(p_workspace_id uuid)
returns table(user_id uuid, email text, role text, active boolean, joined_at timestamptz, avatar_path text)
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
    select
      member.user_id,
      auth_user.email::text,
      member.role,
      member.active,
      member.joined_at,
      case
        when auth_user.raw_user_meta_data ->> 'avatar_path' like member.user_id::text || '/%'
          then auth_user.raw_user_meta_data ->> 'avatar_path'
        else null
      end
    from public.workspace_members member
    join auth.users auth_user on auth_user.id = member.user_id
    where member.workspace_id = p_workspace_id
    order by member.active desc, member.joined_at, auth_user.email;
end;
$$;
revoke all on function public.admin_list_workspace_members(uuid) from public, anon;
grant execute on function public.admin_list_workspace_members(uuid) to authenticated;

drop policy if exists "verified admin reads own profile photo" on storage.objects;
create policy "verified admin reads workspace profile photos"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and owner_id = (storage.foldername(name))[1]
    and exists (
      select 1
      from public.workspace_members viewer
      join public.workspace_members photo_owner
        on photo_owner.workspace_id = viewer.workspace_id
      where viewer.user_id = (select auth.uid())
        and viewer.workspace_id is not null
        and viewer.active = true
        and viewer.role = 'admin'
        and photo_owner.user_id::text = (storage.foldername(name))[1]
    )
  );

commit;
