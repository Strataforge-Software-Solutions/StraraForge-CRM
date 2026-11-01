begin;

-- A converted lead and its client share one tag set. When a lead first links
-- to a client, preserve tags from both records; subsequent edits from either
-- side keep every linked lead and the client in sync.
create or replace function private.merge_linked_tags_on_lead_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_client_tags text[];
begin
  if new.client_id is distinct from old.client_id and new.client_id is not null then
    select coalesce(client.tags, '{}'::text[])
      into existing_client_tags
    from public.clients as client
    where client.workspace_id = new.workspace_id
      and client.id = new.client_id;

    select coalesce(array_agg(distinct tag order by tag), '{}'::text[])
      into new.tags
    from unnest(
      coalesce(new.tags, '{}'::text[]) || coalesce(existing_client_tags, '{}'::text[])
    ) as linked_tag(tag);
  end if;

  return new;
end;
$$;

create or replace function private.sync_linked_record_tags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'clients' then
    update public.leads as lead
       set tags = coalesce(new.tags, '{}'::text[])
     where lead.workspace_id = new.workspace_id
       and lead.client_id = new.id
       and lead.tags is distinct from coalesce(new.tags, '{}'::text[]);
  else
    if new.client_id is not null then
      update public.clients as client
         set tags = coalesce(new.tags, '{}'::text[])
       where client.workspace_id = new.workspace_id
         and client.id = new.client_id
         and client.tags is distinct from coalesce(new.tags, '{}'::text[]);

      update public.leads as lead
         set tags = coalesce(new.tags, '{}'::text[])
       where lead.workspace_id = new.workspace_id
         and lead.client_id = new.client_id
         and lead.id <> new.id
         and lead.tags is distinct from coalesce(new.tags, '{}'::text[]);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists merge_linked_tags_on_lead_link on public.leads;
create trigger merge_linked_tags_on_lead_link
before update of client_id on public.leads
for each row
execute function private.merge_linked_tags_on_lead_link();

drop trigger if exists sync_linked_lead_client_tags on public.leads;
create trigger sync_linked_lead_client_tags
after update of tags, client_id on public.leads
for each row
when (old.tags is distinct from new.tags or old.client_id is distinct from new.client_id)
execute function private.sync_linked_record_tags();

drop trigger if exists sync_linked_client_lead_tags on public.clients;
create trigger sync_linked_client_lead_tags
after update of tags on public.clients
for each row
when (old.tags is distinct from new.tags)
execute function private.sync_linked_record_tags();

-- Bring already-linked records onto one shared set without dropping tags.
do $$
begin
  if exists (
    select client.id
    from public.clients as client
    left join public.leads as lead
      on lead.workspace_id = client.workspace_id
     and lead.client_id = client.id
    left join lateral unnest(
      coalesce(client.tags, '{}'::text[]) || coalesce(lead.tags, '{}'::text[])
    ) as linked_tag(tag) on true
    group by client.id
    having count(distinct linked_tag.tag) > 12
  ) then
    raise exception 'Cannot synchronize tags: a linked lead/client group exceeds the 12-tag limit';
  end if;
end;
$$;

with merged_tags as (
  select
    client.workspace_id,
    client.id as client_id,
    coalesce(array_agg(distinct linked_tag.tag order by linked_tag.tag)
      filter (where linked_tag.tag is not null), '{}'::text[]) as tags
  from public.clients as client
  left join public.leads as lead
    on lead.workspace_id = client.workspace_id
   and lead.client_id = client.id
  left join lateral unnest(
    coalesce(client.tags, '{}'::text[]) || coalesce(lead.tags, '{}'::text[])
  ) as linked_tag(tag) on true
  group by client.workspace_id, client.id
)
update public.clients as client
   set tags = merged_tags.tags
  from merged_tags
 where client.workspace_id = merged_tags.workspace_id
   and client.id = merged_tags.client_id
   and client.tags is distinct from merged_tags.tags;

update public.leads as lead
   set tags = client.tags
  from public.clients as client
 where client.workspace_id = lead.workspace_id
   and client.id = lead.client_id
   and lead.tags is distinct from client.tags;

commit;
