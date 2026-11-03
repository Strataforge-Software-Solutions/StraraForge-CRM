-- Founder-private assistant history and single-use action proposals.
begin;

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index ai_conversations_owner_time_idx on public.ai_conversations (workspace_id, user_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, conversation_id) references public.ai_conversations(workspace_id, id) on delete cascade
);
create index ai_messages_conversation_time_idx on public.ai_messages (conversation_id, created_at);

create table public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 80),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 20000),
  summary text not null check (char_length(summary) between 1 and 500),
  voice_phrase text,
  signature text not null,
  status text not null default 'pending' check (status in ('pending', 'executing', 'succeeded', 'failed', 'rejected')),
  expires_at timestamptz not null,
  result jsonb,
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  foreign key (workspace_id, conversation_id) references public.ai_conversations(workspace_id, id) on delete cascade
);
create index ai_actions_conversation_time_idx on public.ai_actions (conversation_id, created_at desc);

create or replace function private.guard_ai_action_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.workspace_id, new.conversation_id, new.user_id, new.kind,
      new.payload, new.summary, new.voice_phrase, new.signature, new.expires_at, new.created_at)
     is distinct from
     (old.id, old.workspace_id, old.conversation_id, old.user_id, old.kind,
      old.payload, old.summary, old.voice_phrase, old.signature, old.expires_at, old.created_at) then
    raise exception 'Assistant action details are immutable';
  end if;
  if not ((old.status = 'pending' and new.status in ('executing', 'rejected'))
      or (old.status = 'executing' and new.status in ('succeeded', 'failed'))) then
    raise exception 'Assistant action has already been handled';
  end if;
  if new.status in ('succeeded', 'failed') and (new.result is null or new.executed_at is null) then
    raise exception 'Assistant action result is required';
  end if;
  return new;
end;
$$;
create trigger ai_actions_guard_update before update on public.ai_actions
  for each row execute function private.guard_ai_action_update();

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_actions enable row level security;
revoke all on public.ai_conversations, public.ai_messages, public.ai_actions from public, anon, authenticated;
grant select, insert, update, delete on public.ai_conversations to authenticated;
grant select, insert on public.ai_messages to authenticated;
grant select, insert, update on public.ai_actions to authenticated;

create policy ai_conversations_owner on public.ai_conversations for all to authenticated
  using (user_id = (select auth.uid()) and private.is_workspace_admin(workspace_id))
  with check (user_id = (select auth.uid()) and private.is_workspace_admin(workspace_id));
create policy ai_messages_owner on public.ai_messages for select to authenticated
  using (user_id = (select auth.uid()) and private.is_workspace_admin(workspace_id));
create policy ai_messages_insert on public.ai_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_workspace_admin(workspace_id)
    and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.workspace_id = ai_messages.workspace_id and c.user_id = (select auth.uid())));
create policy ai_actions_owner on public.ai_actions for select to authenticated
  using (user_id = (select auth.uid()) and private.is_workspace_admin(workspace_id));
create policy ai_actions_insert on public.ai_actions for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_workspace_admin(workspace_id)
    and exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.workspace_id = ai_actions.workspace_id and c.user_id = (select auth.uid())));
create policy ai_actions_update on public.ai_actions for update to authenticated
  using (user_id = (select auth.uid()) and private.is_workspace_admin(workspace_id))
  with check (user_id = (select auth.uid()) and private.is_workspace_admin(workspace_id));

create or replace function private.purge_ai_history()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.ai_messages where created_at < now() - interval '90 days';
  delete from public.ai_actions where created_at < now() - interval '90 days';
  delete from public.ai_conversations where updated_at < now() - interval '90 days';
end;
$$;
revoke all on function private.purge_ai_history() from public, anon, authenticated;

-- These sales transitions are one transaction, including stage and conversion updates.
create or replace function public.ai_complete_sales_action(p_workspace_id uuid, p_kind text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  proposal_row public.proposals%rowtype;
  lead_row public.leads%rowtype;
  accepted public.proposals%rowtype;
  selected_client_id uuid;
  project_id uuid;
  target_id uuid;
begin
  if not private.is_workspace_admin(p_workspace_id) then raise exception 'Administrator access required'; end if;
  if p_kind in ('mark_proposal_sent', 'accept_proposal') then
    target_id := (p_payload ->> 'proposal_id')::uuid;
    select * into proposal_row from public.proposals where id = target_id and workspace_id = p_workspace_id for update;
    if not found or proposal_row.updated_at is distinct from (p_payload ->> 'expected_updated_at')::timestamptz then
      raise exception 'Proposal changed or not found';
    end if;
    select * into lead_row from public.leads where id = proposal_row.lead_id and workspace_id = p_workspace_id and archived_at is null for update;
    if not found then raise exception 'Lead not found'; end if;
    if p_kind = 'mark_proposal_sent' then
      if proposal_row.status <> 'draft' or lead_row.stage in ('won', 'lost') then raise exception 'Proposal cannot be marked sent'; end if;
      update public.proposals set status = 'sent', sent_at = now() where id = target_id;
      update public.leads set stage = 'proposal_sent' where id = lead_row.id;
    else
      if proposal_row.status <> 'sent' or lead_row.stage in ('won', 'lost') then raise exception 'Proposal cannot be accepted'; end if;
      if (p_payload ->> 'evidence_type') not in ('signed_document', 'approval_message')
        or nullif(trim(p_payload ->> 'acceptance_note'), '') is null
        or nullif(trim(p_payload ->> 'evidence_ref'), '') is null then raise exception 'Acceptance evidence is required'; end if;
      update public.proposals set status = 'accepted', accepted_at = now(),
        acceptance_note = p_payload ->> 'acceptance_note',
        acceptance_evidence_type = p_payload ->> 'evidence_type',
        acceptance_evidence_ref = p_payload ->> 'evidence_ref'
      where id = target_id;
      update public.leads set stage = 'accepted_awaiting_deposit' where id = lead_row.id;
    end if;
    return jsonb_build_object('id', target_id);
  elsif p_kind = 'convert_lead' then
    target_id := (p_payload ->> 'lead_id')::uuid;
    select * into lead_row from public.leads where id = target_id and workspace_id = p_workspace_id and archived_at is null for update;
    if not found or lead_row.updated_at is distinct from (p_payload ->> 'expected_updated_at')::timestamptz then
      raise exception 'Lead changed or not found';
    end if;
    select * into accepted from public.proposals
    where workspace_id = p_workspace_id and lead_id = target_id and status = 'accepted'
    order by version desc limit 1;
    if not found or not exists (select 1 from public.payment_entries payment
      where payment.workspace_id = p_workspace_id and payment.lead_id = target_id
        and payment.proposal_id = accepted.id and payment.payment_kind = 'deposit') then
      raise exception 'Accepted proposal and recorded deposit are required';
    end if;
    if exists (select 1 from public.projects where workspace_id = p_workspace_id and lead_id = target_id) then
      raise exception 'Lead already has a project';
    end if;
    selected_client_id := lead_row.client_id;
    if selected_client_id is null then
      insert into public.clients (workspace_id, name, client_type, relationship_status, created_by)
      values (p_workspace_id, lead_row.company_name, 'organization', 'active', auth.uid()) returning id into selected_client_id;
      insert into public.contacts (workspace_id, client_id, full_name, email, phone, is_primary, created_by)
      values (p_workspace_id, selected_client_id, lead_row.contact_name, lead_row.email, lead_row.phone, true, auth.uid());
      update public.leads set client_id = selected_client_id, client_link_id = selected_client_id where id = target_id;
    elsif not exists (select 1 from public.clients where id = selected_client_id and workspace_id = p_workspace_id and archived_at is null) then
      raise exception 'Linked client is unavailable';
    end if;
    if nullif(trim(p_payload ->> 'name'), '') is null then raise exception 'Project name is required'; end if;
    insert into public.projects (workspace_id, lead_id, client_id, accepted_proposal_id, name,
      agreed_amount, currency, status, start_date, target_date, owner_user_id, created_by)
    values (p_workspace_id, target_id, selected_client_id, accepted.id, trim(p_payload ->> 'name'),
      accepted.amount, accepted.currency, 'planned', nullif(p_payload ->> 'start_date', '')::date,
      nullif(p_payload ->> 'target_date', '')::date, auth.uid(), auth.uid()) returning id into project_id;
    return jsonb_build_object('id', project_id);
  end if;
  raise exception 'Unsupported sales action';
end;
$$;
revoke all on function public.ai_complete_sales_action(uuid, text, jsonb) from public, anon;
grant execute on function public.ai_complete_sales_action(uuid, text, jsonb) to authenticated;

create or replace function public.ai_log_executed_action(p_workspace_id uuid, p_action_id uuid, p_kind text, p_subject_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_workspace_admin(p_workspace_id) then raise exception 'Administrator access required'; end if;
  insert into public.audit_events (workspace_id, actor_user_id, action, subject_type, subject_id, details)
  values (p_workspace_id, auth.uid(), 'assistant_action', p_kind, p_subject_id,
    jsonb_build_object('action_id', p_action_id));
end;
$$;
revoke all on function public.ai_log_executed_action(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.ai_log_executed_action(uuid, uuid, text, uuid) to authenticated;

-- Enable pg_cron in Supabase before applying this migration.
select cron.schedule('strataforge-purge-ai-history', '17 2 * * *', 'select private.purge_ai_history()');

commit;
