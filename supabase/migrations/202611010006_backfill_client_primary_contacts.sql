-- Recover the primary contact for clients created from converted inquiries.
-- Prefer explicit client/project links. Use a company-name match only when it
-- uniquely identifies both one client and one inquiry in the workspace.
begin;

create temporary table client_primary_contact_backfill on commit drop as
with candidate_links as (
  select
    c.id as client_id,
    c.workspace_id,
    c.name as client_name,
    c.created_by as client_created_by,
    l.id as lead_id,
    l.contact_name,
    l.email,
    l.phone,
    l.created_by as lead_created_by,
    l.updated_at as lead_updated_at,
    row_number() over (
      partition by c.workspace_id, c.id
      order by
        case
          when l.client_id = c.id or l.client_link_id = c.id then 0
          when exists (
            select 1 from public.projects p
            where p.workspace_id = c.workspace_id and p.client_id = c.id and p.lead_id = l.id
          ) then 1
          else 2
        end,
        l.updated_at desc,
        l.id
    ) as choice_rank
  from public.clients c
  join public.leads l on l.workspace_id = c.workspace_id
  where c.archived_at is null
    and l.archived_at is null
    and (
      l.client_id = c.id
      or l.client_link_id = c.id
      or exists (
        select 1 from public.projects p
        where p.workspace_id = c.workspace_id and p.client_id = c.id and p.lead_id = l.id
      )
      or (
        lower(trim(l.company_name)) = lower(trim(c.name))
        and (
          select count(*) from public.leads same_name_lead
          where same_name_lead.workspace_id = c.workspace_id
            and same_name_lead.archived_at is null
            and lower(trim(same_name_lead.company_name)) = lower(trim(c.name))
        ) = 1
        and (
          select count(*) from public.clients same_name_client
          where same_name_client.workspace_id = c.workspace_id
            and same_name_client.archived_at is null
            and lower(trim(same_name_client.name)) = lower(trim(c.name))
        ) = 1
      )
    )
), missing_primary as (
  select candidate_links.*
  from candidate_links
  where choice_rank = 1
    and contact_name ~* '[[:alpha:]]'
    and not exists (
      select 1 from public.contacts existing_primary
      where existing_primary.workspace_id = candidate_links.workspace_id
        and existing_primary.client_id = candidate_links.client_id
        and existing_primary.archived_at is null
        and existing_primary.is_primary
    )
)
select * from missing_primary;

-- Promote a matching contact already on the client, filling in only blank
-- values so user-entered details remain authoritative.
update public.contacts contact
set
  full_name = case when trim(contact.full_name) = '' then source.contact_name else contact.full_name end,
  email = coalesce(nullif(trim(contact.email), ''), nullif(trim(source.email), '')),
  phone = coalesce(nullif(trim(contact.phone), ''), nullif(trim(source.phone), '')),
  is_primary = true,
  updated_at = now()
from client_primary_contact_backfill source
where contact.workspace_id = source.workspace_id
  and contact.client_id = source.client_id
  and contact.archived_at is null
  and not contact.is_primary
  and source.email is not null
  and lower(trim(contact.email)) = lower(trim(source.email))
  and contact.id = (
    select matching.id
    from public.contacts matching
    where matching.workspace_id = source.workspace_id
      and matching.client_id = source.client_id
      and matching.archived_at is null
      and not matching.is_primary
      and lower(trim(matching.email)) = lower(trim(source.email))
    order by matching.updated_at desc, matching.id
    limit 1
  );

-- If no existing contact matched, restore one from the linked inquiry.
insert into public.contacts (
  workspace_id, client_id, full_name, email, phone, is_primary, created_by
)
select
  source.workspace_id,
  source.client_id,
  source.contact_name,
  nullif(trim(source.email), ''),
  nullif(trim(source.phone), ''),
  true,
  source.lead_created_by
from client_primary_contact_backfill source
where not exists (
  select 1 from public.contacts existing
  where existing.workspace_id = source.workspace_id
    and existing.client_id = source.client_id
    and existing.archived_at is null
    and existing.is_primary
);

commit;
