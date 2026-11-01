-- Add the relationship fields shown in the client directory and create
-- a client plus its optional primary contact in one audited transaction.
begin;

alter table public.clients
  add column relationship_status text not null default 'active'
  constraint clients_relationship_status_check
  check (relationship_status in ('active', 'on_hold', 'inactive'));

create or replace function public.create_client_with_primary_contact(
  p_workspace_id uuid,
  p_name text,
  p_client_type text,
  p_relationship_status text,
  p_website text,
  p_notes text,
  p_contact_name text,
  p_contact_title text,
  p_contact_email text,
  p_contact_phone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_client_id uuid;
  has_contact boolean;
begin
  if auth.uid() is null or not private.has_crm_access(p_workspace_id) then
    raise exception 'Client not found or access denied';
  end if;

  if p_relationship_status not in ('active', 'on_hold', 'inactive') then
    raise exception 'Invalid client relationship status';
  end if;

  has_contact := nullif(trim(coalesce(p_contact_name, '')), '') is not null;
  if not has_contact and (
    nullif(trim(coalesce(p_contact_title, '')), '') is not null or
    nullif(trim(coalesce(p_contact_email, '')), '') is not null or
    nullif(trim(coalesce(p_contact_phone, '')), '') is not null
  ) then
    raise exception 'A contact name is required when contact details are provided';
  end if;

  insert into public.clients (
    workspace_id, name, client_type, relationship_status, website, notes, created_by
  ) values (
    p_workspace_id, p_name, p_client_type, p_relationship_status,
    nullif(trim(coalesce(p_website, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning id into new_client_id;

  if has_contact then
    insert into public.contacts (
      workspace_id, client_id, full_name, title, email, phone, is_primary, created_by
    ) values (
      p_workspace_id, new_client_id, trim(p_contact_name),
      nullif(trim(coalesce(p_contact_title, '')), ''),
      nullif(trim(coalesce(p_contact_email, '')), ''),
      nullif(trim(coalesce(p_contact_phone, '')), ''), true, auth.uid()
    );
  end if;

  return new_client_id;
end;
$$;

revoke all on function public.create_client_with_primary_contact(
  uuid, text, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.create_client_with_primary_contact(
  uuid, text, text, text, text, text, text, text, text, text
) to authenticated;

commit;
