-- Phase 1: founder membership is the access boundary for future CRM records.
-- Apply in a private Supabase project. Add founder user IDs through a trusted
-- administrative path; no browser role can create or modify memberships.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_active_idx
  on public.workspace_members (user_id, active);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

revoke all on public.workspaces from anon, authenticated;
revoke all on public.workspace_members from anon, authenticated;
grant select on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.has_crm_access(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (
      select 1
      from public.workspace_members member
      where member.workspace_id = target_workspace_id
        and member.user_id = auth.uid()
        and member.active = true
    );
$$;

revoke all on function private.has_crm_access(uuid) from public, anon;
grant execute on function private.has_crm_access(uuid) to authenticated;

create policy "founder can see own active membership"
  on public.workspace_members
  for select to authenticated
  using (user_id = (select auth.uid()) and active = true);

create policy "verified founder can see workspace"
  on public.workspaces
  for select to authenticated
  using (private.has_crm_access(id));

-- The schema for future audit entries exists now. Browser sessions cannot
-- insert, edit, or erase audit events; later trusted mutations must write an
-- event in the same transaction as the business change.
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  -- Preserve actor attribution even if the Auth user is later removed.
  actor_user_id uuid,
  action text not null check (char_length(action) between 1 and 80),
  subject_type text check (subject_type is null or char_length(subject_type) between 1 and 80),
  subject_id uuid,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_events_workspace_time_idx
  on public.audit_events (workspace_id, occurred_at desc);

alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;

create policy "verified admin can read workspace audit"
  on public.audit_events
  for select to authenticated
  using (
    private.has_crm_access(workspace_id)
    and exists (
      select 1 from public.workspace_members member
      where member.workspace_id = audit_events.workspace_id
        and member.user_id = (select auth.uid())
        and member.role = 'admin'
        and member.active = true
    )
  );

-- Keep future CRM tables deny-by-default. Each later migration must explicitly
-- enable RLS, revoke broad grants, and define operation-specific policies.
