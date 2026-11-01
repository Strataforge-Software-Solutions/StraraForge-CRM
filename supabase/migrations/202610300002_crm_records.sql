-- Phase 2: shared CRM records. Apply only after the Phase 1 foundation.
-- All data is workspace-scoped. Browser sessions need an active membership
-- and AAL2; deletes are intentionally unavailable (archive records instead).
begin;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 180),
  client_type text not null default 'organization' check (client_type in ('organization', 'person')),
  website text,
  notes text,
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  full_name text not null check (char_length(trim(full_name)) between 1 and 180),
  title text check (title is null or char_length(title) <= 120),
  email text check (email is null or char_length(email) <= 320),
  phone text check (phone is null or char_length(phone) <= 50),
  is_primary boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 5000),
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  company_name text not null check (char_length(trim(company_name)) between 1 and 180),
  contact_name text not null check (char_length(trim(contact_name)) between 1 and 180),
  email text not null check (char_length(email) <= 320),
  phone text check (phone is null or char_length(phone) <= 50),
  website_brief text not null check (char_length(trim(website_brief)) between 1 and 10000),
  source text check (source is null or char_length(source) <= 120),
  owner_user_id uuid not null references auth.users(id),
  stage text not null default 'new' check (stage in ('new', 'contacted', 'discovery', 'proposal_sent', 'accepted_awaiting_deposit', 'won', 'lost')),
  next_follow_up_at timestamptz,
  budget_min numeric(12,2) check (budget_min is null or budget_min >= 0),
  budget_max numeric(12,2) check (budget_max is null or budget_max >= 0),
  budget_currency char(3),
  lost_reason text check (lost_reason is null or char_length(lost_reason) <= 1000),
  client_link_id uuid,
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (budget_min is null or budget_max is null or budget_min <= budget_max),
  check ((budget_min is null and budget_max is null and budget_currency is null) or budget_currency ~ '^[A-Z]{3}$'),
  check ((stage = 'lost') = (lost_reason is not null)),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id),
  foreign key (workspace_id, client_link_id) references public.clients(workspace_id, id)
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  version integer not null check (version > 0),
  scope_summary text not null check (char_length(trim(scope_summary)) between 1 and 20000),
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'withdrawn')),
  sent_at timestamptz,
  accepted_at timestamptz,
  acceptance_note text check (acceptance_note is null or char_length(trim(acceptance_note)) <= 4000),
  acceptance_evidence_type text check (acceptance_evidence_type is null or acceptance_evidence_type in ('signed_document', 'approval_message')),
  acceptance_evidence_ref text check (acceptance_evidence_ref is null or char_length(acceptance_evidence_ref) <= 2000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, lead_id, version),
  foreign key (workspace_id, lead_id) references public.leads(workspace_id, id),
  check (
    (status = 'accepted' and accepted_at is not null and acceptance_note is not null and acceptance_evidence_type is not null and acceptance_evidence_ref is not null and char_length(trim(acceptance_evidence_ref)) > 0)
    or (status <> 'accepted' and accepted_at is null and acceptance_note is null and acceptance_evidence_type is null and acceptance_evidence_ref is null)
  )
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  client_id uuid not null,
  accepted_proposal_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 180),
  agreed_amount numeric(12,2) not null check (agreed_amount >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'on_hold', 'completed', 'cancelled')),
  start_date date,
  target_date date,
  owner_user_id uuid not null references auth.users(id),
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_date is null or start_date is null or target_date >= start_date),
  unique (workspace_id, id),
  unique (workspace_id, lead_id),
  foreign key (workspace_id, lead_id) references public.leads(workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id),
  foreign key (workspace_id, accepted_proposal_id) references public.proposals(workspace_id, id)
);

-- Deposits are recorded against the accepted lead proposal before conversion;
-- the conversion trigger links that entry to the new project atomically.
create table public.payment_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null,
  proposal_id uuid not null,
  project_id uuid,
  payment_kind text not null check (payment_kind in ('deposit', 'progress')),
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  received_at timestamptz not null,
  reference text check (reference is null or char_length(reference) <= 1000),
  recorded_by uuid not null default auth.uid() references auth.users(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (created_by = recorded_by),
  unique (workspace_id, id),
  foreign key (workspace_id, lead_id) references public.leads(workspace_id, id),
  foreign key (workspace_id, proposal_id) references public.proposals(workspace_id, id),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id),
  check (payment_kind = 'deposit' or project_id is not null),
  check (payment_kind <> 'deposit' or (reference is not null and char_length(trim(reference)) > 0))
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text check (description is null or char_length(description) <= 5000),
  lead_id uuid,
  client_id uuid,
  project_id uuid,
  assignee_user_id uuid not null references auth.users(id),
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  completed_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null)),
  check (num_nonnulls(lead_id, client_id, project_id) <= 1),
  unique (workspace_id, id),
  foreign key (workspace_id, lead_id) references public.leads(workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients(workspace_id, id),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id)
);

create index leads_workspace_stage_idx on public.leads (workspace_id, stage) where archived_at is null;
create index contacts_workspace_client_idx on public.contacts (workspace_id, client_id) where archived_at is null;
create unique index contacts_one_primary_per_client_idx on public.contacts (workspace_id, client_id) where is_primary and archived_at is null;
create index leads_workspace_follow_up_idx on public.leads (workspace_id, next_follow_up_at) where archived_at is null;
create index proposals_workspace_lead_version_idx on public.proposals (workspace_id, lead_id, version desc);
create index projects_workspace_status_idx on public.projects (workspace_id, status) where archived_at is null;
create index tasks_workspace_due_idx on public.tasks (workspace_id, due_at) where archived_at is null;

create or replace function private.touch_crm_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'Workspace cannot be changed';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.validate_payment_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare proposal_row public.proposals%rowtype;
begin
  select * into proposal_row
  from public.proposals
  where id = new.proposal_id and workspace_id = new.workspace_id and lead_id = new.lead_id;
  if not found then raise exception 'Payment proposal does not belong to this lead'; end if;

  if new.payment_kind = 'deposit' then
    if new.project_id is not null or proposal_row.status <> 'accepted' or proposal_row.currency <> new.currency or new.amount > proposal_row.amount then
      raise exception 'A deposit requires an accepted proposal in the same currency';
    end if;
  else
    if not exists (
      select 1 from public.projects project
      where project.id = new.project_id and project.workspace_id = new.workspace_id
        and project.lead_id = new.lead_id and project.accepted_proposal_id = new.proposal_id
    ) then raise exception 'Progress payment must match the related project proposal'; end if;
  end if;
  return new;
end;
$$;

create or replace function private.protect_accepted_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'accepted' then
    raise exception 'An accepted proposal is immutable; create a new version';
  end if;
  return new;
end;
$$;

create or replace function private.protect_project_agreement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Project agreement terms are immutable; create a new proposal version for changed terms';
  end if;
  if new.workspace_id <> old.workspace_id then
    raise exception 'Project agreement terms are immutable; create a new proposal version for changed terms';
  end if;
  if new.lead_id <> old.lead_id then
    raise exception 'Project agreement terms are immutable; create a new proposal version for changed terms';
  end if;
  if new.client_id <> old.client_id then
    raise exception 'Project agreement terms are immutable; create a new proposal version for changed terms';
  end if;
  if new.accepted_proposal_id <> old.accepted_proposal_id then
    raise exception 'Project agreement terms are immutable; create a new proposal version for changed terms';
  end if;
  if new.agreed_amount <> old.agreed_amount then
    raise exception 'Project agreement terms are immutable; create a new proposal version for changed terms';
  end if;
  if new.currency <> old.currency then
    raise exception 'Project agreement terms are immutable; create a new proposal version for changed terms';
  end if;
  if new.created_by <> old.created_by then
    raise exception 'Project agreement terms are immutable; create a new proposal version for changed terms';
  end if;
  if new.created_at <> old.created_at then
    raise exception 'Project agreement terms are immutable; create a new proposal version for changed terms';
  end if;
  return new;
end;
$$;

create or replace function private.validate_project_conversion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare lead_row public.leads%rowtype; proposal_row public.proposals%rowtype;
begin
  select * into lead_row from public.leads where id = new.lead_id and workspace_id = new.workspace_id;
  select * into proposal_row from public.proposals where id = new.accepted_proposal_id and workspace_id = new.workspace_id;
  if lead_row.stage <> 'accepted_awaiting_deposit'
     or lead_row.client_id is not null and lead_row.client_id <> new.client_id
     or proposal_row.lead_id <> new.lead_id
     or proposal_row.status <> 'accepted'
     or proposal_row.amount <> new.agreed_amount
     or proposal_row.currency <> new.currency
     or not exists (
       select 1 from public.payment_entries payment
       where payment.workspace_id = new.workspace_id and payment.lead_id = new.lead_id
         and payment.proposal_id = new.accepted_proposal_id and payment.payment_kind = 'deposit'
         and payment.project_id is null
     ) then
    raise exception 'Project conversion requires an accepted proposal and recorded deposit';
  end if;
  return new;
end;
$$;

create or replace function private.complete_project_conversion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_entries
    set project_id = new.id
    where workspace_id = new.workspace_id and lead_id = new.lead_id
      and proposal_id = new.accepted_proposal_id and payment_kind = 'deposit' and project_id is null;
  update public.leads
    set stage = 'won', client_id = new.client_id
    where workspace_id = new.workspace_id and id = new.lead_id;
  return new;
end;
$$;

create or replace function private.validate_won_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage = 'won' and old.stage is distinct from 'won'
     and not exists (
       select 1 from public.projects project
       join public.payment_entries payment
         on payment.workspace_id = project.workspace_id and payment.project_id = project.id
        and payment.payment_kind = 'deposit'
       join public.proposals proposal
         on proposal.workspace_id = project.workspace_id and proposal.id = project.accepted_proposal_id
        and proposal.status = 'accepted'
       where project.workspace_id = new.workspace_id and project.lead_id = new.id
     ) then
    raise exception 'A lead is won only after proposal acceptance and deposit recording';
  end if;
  return new;
end;
$$;

create or replace function private.audit_crm_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  record_id uuid;
  workspace uuid;
begin
  if tg_op = 'DELETE' then
    record_id := old.id;
    workspace := old.workspace_id;
  else
    record_id := new.id;
    workspace := new.workspace_id;
  end if;

  insert into public.audit_events (workspace_id, actor_user_id, action, subject_type, subject_id)
  values (workspace, auth.uid(), lower(tg_op), tg_table_name, record_id);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.touch_crm_record() from public, anon, authenticated;
revoke all on function private.audit_crm_record_change() from public, anon, authenticated;
revoke all on function private.validate_payment_entry() from public, anon, authenticated;
revoke all on function private.validate_project_conversion() from public, anon, authenticated;
revoke all on function private.complete_project_conversion() from public, anon, authenticated;
revoke all on function private.validate_won_lead() from public, anon, authenticated;
revoke all on function private.protect_accepted_proposal() from public, anon, authenticated;
revoke all on function private.protect_project_agreement() from public, anon, authenticated;

create trigger validate_payment_entry before insert on public.payment_entries
  for each row execute function private.validate_payment_entry();
create trigger validate_project_conversion before insert on public.projects
  for each row execute function private.validate_project_conversion();
create trigger complete_project_conversion after insert on public.projects
  for each row execute function private.complete_project_conversion();
create trigger validate_won_lead before update of stage on public.leads
  for each row execute function private.validate_won_lead();
create trigger protect_accepted_proposal before update on public.proposals
  for each row execute function private.protect_accepted_proposal();
create trigger protect_project_agreement before update on public.projects
  for each row execute function private.protect_project_agreement();

do $$
declare table_name text;
begin
  foreach table_name in array array['clients', 'contacts', 'leads', 'proposals', 'projects', 'payment_entries', 'tasks'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert on public.%I to authenticated', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (private.has_crm_access(workspace_id))', 'crm_' || table_name || '_select', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.has_crm_access(workspace_id) and %s = (select auth.uid()))', 'crm_' || table_name || '_insert', table_name, case when table_name = 'payment_entries' then 'recorded_by' else 'created_by' end);
    if table_name <> 'payment_entries' then
      execute format('grant update on public.%I to authenticated', table_name);
      execute format('create policy %I on public.%I for update to authenticated using (private.has_crm_access(workspace_id)) with check (private.has_crm_access(workspace_id))', 'crm_' || table_name || '_update', table_name);
      execute format('create trigger %I before update on public.%I for each row execute function private.touch_crm_record()', 'touch_' || table_name, table_name);
      execute format('create trigger %I after insert or update on public.%I for each row execute function private.audit_crm_record_change()', 'audit_' || table_name, table_name);
    else
      -- Project conversion links the deposit after inserting the project; record that update too.
      execute format('create trigger %I after insert or update on public.%I for each row execute function private.audit_crm_record_change()', 'audit_' || table_name, table_name);
    end if;
  end loop;
end;
$$;
commit;
