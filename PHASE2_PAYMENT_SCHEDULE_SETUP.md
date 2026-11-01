# Phase 2 payment schedule migration

The project page now supports versioned payment schedules with fixed amounts, percentages of the accepted project price, due dates, partial payments against a milestone, and a remaining amount. Scheduled amounts must add up exactly to the project's current unpaid balance. Percentage calculations round to cents. Saving a revision preserves the previous schedule and creates a new version.

The database also ensures that an accepted proposal and its deposit cannot be duplicated by simultaneous founder submissions. When a schedule is active, each new progress payment must be assigned to an active milestone and cannot exceed that milestone's unpaid amount. Payment entries remain append-only. The migration does not enable client charges or money transfers.

## Apply it in Supabase

1. Confirm `202610300002_crm_records.sql` has already completed successfully in this project.
2. Open the Supabase SQL Editor for the StrataForge project.
3. Open `supabase/migrations/202610300003_project_payment_schedules.sql` in this repository and copy the entire file into a new SQL query.
4. Run it once. The transaction either applies all schema changes or rolls them all back on an error.
5. Confirm the Results panel reports success. “No rows returned” is normal for this migration because it creates schema objects rather than returning table rows. Then refresh the local CRM project page.

To check that the objects exist, run this read-only query afterward:

```sql
select
  to_regclass('public.project_payment_schedules') as schedules_table,
  to_regclass('public.project_payment_milestones') as milestones_table,
  to_regprocedure('public.save_project_payment_schedule(uuid,jsonb)') as schedule_function;
```

All three result columns should contain their object names rather than `NULL`.

The migration file is the source of truth. Do not run only part of it. If the SQL Editor reports a duplicate accepted proposal or deposit while creating a unique index, stop and inspect the existing records before retrying; do not delete payment or agreement history to force the migration through.

## What the migration adds

- `project_payment_schedules`: versioned active and superseded schedules for each project.
- `project_payment_milestones`: ordered, immutable milestone terms with fixed or percentage-based calculations and due dates.
- `payment_entries.milestone_id`: an optional link from a received progress payment to its scheduled milestone. Deposits stay separately recorded.
- `save_project_payment_schedule`: an authenticated, workspace-scoped transaction that checks dates, amounts, remaining balance, and version history before replacing the active schedule.
- Row-level security for schedule reads and audit events for schedule changes. Direct browser inserts/updates are not granted; schedule creation goes through the checked database function.

The local app can still show and record actual unscheduled payments while this migration is absent. Schedule creation and milestone allocation become available after it is applied and the page is refreshed.
