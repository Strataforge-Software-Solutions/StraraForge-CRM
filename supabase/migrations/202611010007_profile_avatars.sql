-- Private founder profile photos. Apply through a trusted Supabase migration session.
-- Storage owns the object bytes; browser clients only receive the publishable key.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "verified admin uploads own profile photo"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and storage.extension(name) in ('jpg', 'png', 'webp')
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.workspace_members member
      where member.user_id = (select auth.uid())
        and member.active = true
        and member.role = 'admin'
    )
  );

create policy "verified admin reads own profile photo"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-avatars'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.workspace_members member
      where member.user_id = (select auth.uid())
        and member.active = true
        and member.role = 'admin'
    )
  );

create policy "verified admin removes own profile photo"
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-avatars'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1 from public.workspace_members member
      where member.user_id = (select auth.uid())
        and member.active = true
        and member.role = 'admin'
    )
  );
