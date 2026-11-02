# Profile photo storage setup

The Settings photo control needs the private `profile-avatars` bucket and its ownership policies. The app uses only the browser publishable key; do not put a service-role key in a `VITE_` variable.

1. Open the trusted Supabase SQL Editor for the StrataForge project.
2. Run the complete `supabase/migrations/202611010007_profile_avatars.sql` file.
3. Confirm that `profile-avatars` is private, permits only JPEG/PNG/WebP, and has a 2 MB per-file limit.
4. In the CRM, sign in with AAL2 as an active administrator. On Settings, choose a photo, preview it, and select **Save changes**. Refresh the page to check persistence and the top-bar avatar. Then use **Remove photo** and **Save changes** to check the initial returns.
5. When a second founder account is available, verify that its authenticated session cannot download or delete the first founder's photo path. An AAL1 session should also be denied.

To display uploaded member photos on the Admin Access page, apply `supabase/migrations/202611010010_admin_member_profile_avatars.sql` after the original profile avatar migration. It adds the avatar path to the administrator-only member listing and lets an AAL2 workspace administrator read photos owned by members of that same workspace. It does not grant access to other workspaces or allow administrators to edit or delete another member's photo.

The migration grants each administrator access only to objects in their own user-ID folder. An upload error before the migration is applied does not affect the existing display name or workspace records.
