begin;

grant delete on public.proposals to authenticated;

drop policy if exists crm_proposals_delete_draft on public.proposals;
create policy crm_proposals_delete_draft
  on public.proposals
  for delete to authenticated
  using (private.has_crm_access(workspace_id) and status = 'draft');

drop trigger if exists audit_proposals_delete on public.proposals;
create trigger audit_proposals_delete
  after delete on public.proposals
  for each row execute function private.audit_crm_record_change();

commit;
