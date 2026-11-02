# Enable lead Location and Timeline

The lead edit form can save other fields and images without these optional columns, but Location and Timeline require the database schema update.

1. In the trusted Supabase project's SQL Editor, run `supabase/migrations/202610310003_lead_location.sql`, `supabase/migrations/202610310005_lead_timeline.sql`, and `supabase/migrations/202611020002_lead_project_type.sql`. These scripts can be rerun safely and notify PostgREST to reload its schema cache.
2. Verify both columns are present:

   ```sql
   select column_name
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'leads'
     and column_name in ('location', 'timeline', 'project_type')
   order by column_name;
   ```

3. Reload `/leads`, reopen the edit dialog, enter a Location and Timeline, and save. Confirm the values remain after another reload. Also test saving a selected image with Save changes.

If the columns exist but the Data API still reports a schema-cache error, run `NOTIFY pgrst, 'reload schema';` in the SQL Editor and retry. This follows [Supabase's schema refresh guidance](https://supabase.com/kb/troubleshooting/refresh-postgrest-schema).
