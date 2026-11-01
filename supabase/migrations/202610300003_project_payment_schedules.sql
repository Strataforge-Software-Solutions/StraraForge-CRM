-- Phase 2 follow-up: immutable, versioned schedules for the unpaid project balance.
-- Apply after 202610300002_crm_records.sql.
begin;

-- A lead can have one accepted proposal, and each accepted proposal can have
-- one deposit entry. These constraints close the two-founder double-submit race.
create unique index if not exists proposals_one_accepted_per_lead
  on public.proposals (workspace_id, lead_id)
  where status = 'accepted';

create unique index if not exists payment_entries_one_deposit_per_proposal
  on public.payment_entries (workspace_id, proposal_id)
  where payment_kind = 'deposit';

create table public.project_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  version integer not null check (version > 0),
  status text not null default 'active' check (status in ('active', 'superseded')),
  balance_at_creation numeric(12,2) not null check (balance_at_creation > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, project_id, version),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id)
);

create unique index project_payment_schedules_one_active
  on public.project_payment_schedules (workspace_id, project_id)
  where status = 'active';

create table public.project_payment_milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  schedule_id uuid not null,
  project_id uuid not null,
  position integer not null check (position > 0),
  title text not null check (char_length(trim(title)) between 1 and 120),
  calculation_type text not null check (calculation_type in ('fixed', 'percentage')),
  calculation_value numeric(12,2) not null check (calculation_value > 0),
  scheduled_amount numeric(12,2) not null check (scheduled_amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  due_date date not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, schedule_id, position),
  foreign key (workspace_id, schedule_id) references public.project_payment_schedules(workspace_id, id),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id),
  check (calculation_type <> 'percentage' or calculation_value <= 100)
);

alter table public.payment_entries
  add column milestone_id uuid,
  add constraint payment_entries_milestone_fk
    foreign key (workspace_id, milestone_id)
    references public.project_payment_milestones(workspace_id, id),
  add constraint payment_entries_milestone_progress_only
    check (milestone_id is null or payment_kind = 'progress');

create index project_payment_schedules_project_idx
  on public.project_payment_schedules (workspace_id, project_id, version desc);
create index project_payment_milestones_schedule_idx
  on public.project_payment_milestones (workspace_id, schedule_id, position);
create index payment_entries_milestone_idx
  on public.payment_entries (workspace_id, milestone_id)
  where milestone_id is not null;

alter table public.project_payment_schedules enable row level security;
alter table public.project_payment_milestones enable row level security;
revoke all on public.project_payment_schedules from anon, authenticated;
revoke all on public.project_payment_milestones from anon, authenticated;
grant select on public.project_payment_schedules to authenticated;
grant select on public.project_payment_milestones to authenticated;
create policy project_payment_schedules_select
  on public.project_payment_schedules for select to authenticated
  using (private.has_crm_access(workspace_id));
create policy project_payment_milestones_select
  on public.project_payment_milestones for select to authenticated
  using (private.has_crm_access(workspace_id));

create trigger touch_project_payment_schedules
  before update on public.project_payment_schedules
  for each row execute function private.touch_crm_record();
create trigger audit_project_payment_schedules
  after insert or update on public.project_payment_schedules
  for each row execute function private.audit_crm_record_change();
create trigger audit_project_payment_milestones
  after insert on public.project_payment_milestones
  for each row execute function private.audit_crm_record_change();

-- All schedule writes go through this transaction. Percentage amounts use the
-- accepted project price and round to cents. The schedule covers the remaining
-- balance after recorded payments, and the totals must reconcile exactly.
create or replace function public.save_project_payment_schedule(
  p_project_id uuid,
  p_milestones jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_row public.projects%rowtype;
  item jsonb;
  item_title text;
  item_type text;
  item_value numeric(12,2);
  item_due_date date;
  item_amount numeric(12,2);
  previous_due_date date;
  total_amount numeric(12,2) := 0;
  paid_amount numeric(12,2) := 0;
  balance_amount numeric(12,2);
  next_version integer;
  item_position integer := 0;
  schedule_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_milestones is null or jsonb_typeof(p_milestones) <> 'array' then
    raise exception 'Milestones must be provided as a JSON array';
  end if;
  if octet_length(p_milestones::text) > 50000 then
    raise exception 'Milestone schedule is too large';
  end if;
  if jsonb_array_length(p_milestones) < 1 or jsonb_array_length(p_milestones) > 20 then
    raise exception 'A schedule must contain between 1 and 20 milestones';
  end if;

  select * into project_row
  from public.projects
  where id = p_project_id
  for update;
  if not found then raise exception 'Project not found or access denied'; end if;
  if not private.has_crm_access(project_row.workspace_id) then raise exception 'Project not found or access denied'; end if;
  if project_row.status in ('completed', 'cancelled') then
    raise exception 'A closed project cannot receive a new payment schedule';
  end if;

  select coalesce(sum(payment.amount), 0)::numeric(12,2)
    into paid_amount
  from public.payment_entries payment
  where payment.workspace_id = project_row.workspace_id
    and payment.project_id = project_row.id;
  balance_amount := round(project_row.agreed_amount - paid_amount, 2);
  if balance_amount <= 0 then raise exception 'There is no unpaid balance to schedule'; end if;

  -- Validate and total the entire proposed schedule before changing the active version.
  for item in select value from jsonb_array_elements(p_milestones) loop
    item_position := item_position + 1;
    item_title := trim(coalesce(item ->> 'title', ''));
    item_type := item ->> 'calculation_type';
    begin
      item_value := (item ->> 'calculation_value')::numeric(12,2);
      item_due_date := (item ->> 'due_date')::date;
    exception when others then
      raise exception 'Each milestone needs a valid numeric value and due date';
    end;
    if item_title = '' or char_length(item_title) > 120 then
      raise exception 'Milestone titles must be between 1 and 120 characters';
    end if;
    if item_type is null or item_type not in ('fixed', 'percentage') then
      raise exception 'Milestone type must be fixed or percentage';
    end if;
    if item_value is null or item_due_date is null then
      raise exception 'Each milestone needs a value and due date';
    end if;
    if item_value <= 0 or (item_type = 'percentage' and item_value > 100) then
      raise exception 'Milestone value is outside the allowed range';
    end if;
    if previous_due_date is not null and item_due_date < previous_due_date then
      raise exception 'Milestone due dates must be in chronological order';
    end if;
    previous_due_date := item_due_date;
    if item_type = 'fixed' then
      item_amount := round(item_value, 2);
    else
      item_amount := round(project_row.agreed_amount * item_value / 100, 2);
    end if;
    if item_amount <= 0 then raise exception 'Each milestone must schedule a positive amount'; end if;
    total_amount := total_amount + item_amount;
  end loop;

  if total_amount <> balance_amount then
    raise exception 'Milestones must total the current unpaid balance of % %', project_row.currency, balance_amount;
  end if;

  select coalesce(max(schedule.version), 0) + 1 into next_version
  from public.project_payment_schedules schedule
  where schedule.workspace_id = project_row.workspace_id and schedule.project_id = project_row.id;

  update public.project_payment_schedules
  set status = 'superseded'
  where workspace_id = project_row.workspace_id and project_id = project_row.id and status = 'active';

  insert into public.project_payment_schedules (
    id, workspace_id, project_id, version, status, balance_at_creation, currency, created_by
  ) values (
    schedule_id, project_row.workspace_id, project_row.id, next_version,
    'active', balance_amount, project_row.currency, auth.uid()
  );

  item_position := 0;
  for item in select value from jsonb_array_elements(p_milestones) loop
    item_position := item_position + 1;
    item_title := trim(item ->> 'title');
    item_type := item ->> 'calculation_type';
    item_value := (item ->> 'calculation_value')::numeric(12,2);
    item_due_date := (item ->> 'due_date')::date;
    if item_type = 'fixed' then
      item_amount := round(item_value, 2);
    else
      item_amount := round(project_row.agreed_amount * item_value / 100, 2);
    end if;
    insert into public.project_payment_milestones (
      workspace_id, schedule_id, project_id, position, title,
      calculation_type, calculation_value, scheduled_amount, currency, due_date, created_by
    ) values (
      project_row.workspace_id, schedule_id, project_row.id, item_position, item_title,
      item_type, item_value, item_amount, project_row.currency, item_due_date, auth.uid()
    );
  end loop;

  return schedule_id;
end;
$$;

revoke all on function public.save_project_payment_schedule(uuid, jsonb) from public, anon;
grant execute on function public.save_project_payment_schedule(uuid, jsonb) to authenticated;

-- Serialize payment allocation with schedule revisions, then prevent a
-- milestone's received total from exceeding its scheduled amount.
create or replace function private.validate_payment_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal_row public.proposals%rowtype;
  project_row public.projects%rowtype;
  milestone_row public.project_payment_milestones%rowtype;
  allocated_amount numeric(12,2) := 0;
  has_active_schedule boolean := false;
begin
  select * into proposal_row
  from public.proposals
  where id = new.proposal_id and workspace_id = new.workspace_id and lead_id = new.lead_id;
  if not found then raise exception 'Payment proposal does not belong to this lead'; end if;

  if new.payment_kind = 'deposit' then
    if new.project_id is not null or proposal_row.status <> 'accepted'
       or proposal_row.currency <> new.currency or new.amount > proposal_row.amount then
      raise exception 'A deposit requires an accepted proposal in the same currency';
    end if;
    if new.milestone_id is not null then raise exception 'Deposits are recorded before project milestones'; end if;
  else
    select * into project_row
    from public.projects project
    where project.id = new.project_id and project.workspace_id = new.workspace_id
      and project.lead_id = new.lead_id and project.accepted_proposal_id = new.proposal_id
    for update;
    if not found then raise exception 'Progress payment must match the related project proposal'; end if;
    if proposal_row.status <> 'accepted' or proposal_row.currency <> new.currency
       or project_row.currency <> new.currency then
      raise exception 'Progress payment must use the accepted project currency';
    end if;

    select exists (
      select 1 from public.project_payment_schedules schedule
      where schedule.workspace_id = new.workspace_id and schedule.project_id = new.project_id and schedule.status = 'active'
    ) into has_active_schedule;
    if has_active_schedule and new.milestone_id is null then
      raise exception 'Select an active scheduled milestone for this progress payment';
    end if;

    if new.milestone_id is not null then
      select milestone.* into milestone_row
      from public.project_payment_milestones milestone
      join public.project_payment_schedules schedule
        on schedule.workspace_id = milestone.workspace_id and schedule.id = milestone.schedule_id
      where milestone.id = new.milestone_id and milestone.workspace_id = new.workspace_id
        and milestone.project_id = new.project_id and schedule.status = 'active'
      for update of milestone;
      if not found then raise exception 'Payment milestone is not active for this project'; end if;
      if milestone_row.currency <> new.currency then raise exception 'Payment milestone currency does not match'; end if;

      select coalesce(sum(payment.amount), 0)::numeric(12,2) into allocated_amount
      from public.payment_entries payment
      where payment.workspace_id = new.workspace_id and payment.milestone_id = new.milestone_id;
      if allocated_amount + new.amount > milestone_row.scheduled_amount then
        raise exception 'Payment exceeds the milestone amount still due';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.validate_payment_entry() from public, anon, authenticated;

commit;
