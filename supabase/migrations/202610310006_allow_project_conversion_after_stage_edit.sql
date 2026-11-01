create or replace function private.validate_project_conversion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lead_row public.leads%rowtype;
  proposal_row public.proposals%rowtype;
begin
  select * into lead_row
  from public.leads
  where id = new.lead_id and workspace_id = new.workspace_id;

  select * into proposal_row
  from public.proposals
  where id = new.accepted_proposal_id and workspace_id = new.workspace_id;

  if lead_row.id is null
     or (lead_row.client_id is not null and lead_row.client_id <> new.client_id)
     or proposal_row.lead_id <> new.lead_id
     or proposal_row.status <> 'accepted'
     or proposal_row.amount <> new.agreed_amount
     or proposal_row.currency <> new.currency
     or not exists (
       select 1
       from public.payment_entries payment
       where payment.workspace_id = new.workspace_id
         and payment.lead_id = new.lead_id
         and payment.proposal_id = new.accepted_proposal_id
         and payment.payment_kind = 'deposit'
         and payment.project_id is null
     ) then
    raise exception 'Project conversion requires an accepted proposal and recorded deposit';
  end if;

  return new;
end;
$$;
