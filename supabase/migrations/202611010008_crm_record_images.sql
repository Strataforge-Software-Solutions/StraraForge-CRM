-- Private images attached to CRM records and project delivery tasks.
-- Paths: workspace-id/record-type/record-id/image-id.ext

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crm-record-images',
  'crm-record-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_access_crm_record_image(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  parts text[];
  target_workspace uuid;
  target_record uuid;
begin
  parts := string_to_array(object_name, '/');
  if array_length(parts, 1) is distinct from 4
    or parts[4] !~* '^[0-9a-f-]{36}[.](jpg|png|webp)$'
  then return false; end if;

  target_workspace := parts[1]::uuid;
  target_record := parts[3]::uuid;

  if parts[2] = 'lead' then
    return private.has_crm_access(target_workspace)
      and exists (
        select 1 from public.leads record
        where record.id = target_record and record.workspace_id = target_workspace
      );
  elsif parts[2] = 'client' then
    return private.has_crm_access(target_workspace)
      and exists (
        select 1 from public.clients record
        where record.id = target_record and record.workspace_id = target_workspace
      );
  elsif parts[2] = 'project' then
    return private.has_crm_access(target_workspace)
      and exists (
        select 1 from public.projects record
        where record.id = target_record and record.workspace_id = target_workspace
      );
  elsif parts[2] = 'task' then
    return exists (
      select 1 from public.tasks record
      where record.id = target_record and record.workspace_id = target_workspace
        and (
          private.has_crm_access(target_workspace)
          or (record.project_id is not null and private.has_workspace_access(target_workspace))
        )
    );
  end if;

  return false;
exception when invalid_text_representation then
  return false;
end;
$$;

revoke all on function private.can_access_crm_record_image(text) from public, anon;
grant execute on function private.can_access_crm_record_image(text) to authenticated;

drop policy if exists "verified workspace uploads CRM record images" on storage.objects;
create policy "verified workspace uploads CRM record images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'crm-record-images'
    and storage.extension(name) in ('jpg', 'png', 'webp')
    and private.can_access_crm_record_image(name)
  );

drop policy if exists "verified workspace reads CRM record images" on storage.objects;
create policy "verified workspace reads CRM record images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'crm-record-images'
    and private.can_access_crm_record_image(name)
  );

drop policy if exists "verified workspace removes CRM record images" on storage.objects;
create policy "verified workspace removes CRM record images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'crm-record-images'
    and private.can_access_crm_record_image(name)
  );

commit;
