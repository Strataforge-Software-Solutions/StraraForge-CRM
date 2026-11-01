# CRM record image storage setup

Image uploads for leads, clients, projects, and project delivery tasks require the private `crm-record-images` Supabase Storage bucket. The browser uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

1. Open the trusted Supabase SQL Editor for the StrataForge project.
2. Run the complete `supabase/migrations/202611010008_crm_record_images.sql` migration after the existing CRM and project-task migrations.
3. Confirm the bucket is private, accepts only JPEG/PNG/WebP, and limits each file to 5 MB.
4. Sign in with an AAL2 workspace account. Add an image to a lead, client, project, and project task; reload each page and confirm the image remains visible. Then remove an image and confirm it disappears after reload.
5. Verify an unrelated workspace member cannot list, download, upload, or remove another workspace's images. Verify an unverified AAL1 session cannot access images. A project-task member should access only project-task images in their own workspace, not lead, client, or project images without CRM permission.

Storage object paths contain the workspace ID, record type, and record ID. The migration checks the referenced record and current workspace membership for every upload, read, and delete. The UI validates file type and size before upload, offers previews, and keeps failed files selected for retry. Image access uses authenticated downloads rather than public URLs.

The migration has not been applied by this repository change. Until it is applied, the UI will report that image storage is unavailable while normal record saving continues.
