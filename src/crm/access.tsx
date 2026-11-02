import { useEffect, useRef, useState, type FormEvent } from "react";
import { db, useAuth, useToast, PageHeader, Loading, ErrorBox, Modal, CrmIcon } from "./shared";

type WorkspaceMember = { user_id: string; email: string; role: "admin" | "member" | "developer"; active: boolean; joined_at: string; avatar_path: string | null; avatar_url?: string | null };
type Role = WorkspaceMember["role"];
const roles: Array<{ value: Role; label: string; description: string }> = [
  { value: "admin", label: "Administrator", description: "Full CRM access and workspace access management." },
  { value: "member", label: "Member", description: "Access to CRM records, reports, and project tasks." },
  { value: "developer", label: "Developer", description: "Access only to assigned project delivery tasks." }
];

function RoleDropdown({ role, label, disabled = false, onSelect, grant = false }: { role: Role; label: string; disabled?: boolean; onSelect: (role: Role) => void; grant?: boolean }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = roles.find(item => item.value === role) ?? roles[1];

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return <div className={`access-role-select is-${role}${grant ? " access-role-select-grant" : ""}`} ref={pickerRef}>
    <button ref={triggerRef} className="access-role-trigger" type="button" aria-label={`${label}: ${selected.label}`} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)}>
      <span className="access-role-icon" aria-hidden="true"><CrmIcon name={role === "admin" ? "security" : role === "developer" ? "inbox" : "users"}/></span>
      <span className="access-role-trigger-copy"><strong>{selected.label}</strong><small>{selected.description}</small></span>
      <svg className="access-role-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>
    </button>
    {open && <div className="access-role-menu" role="menu" aria-label={`Choose ${label.toLowerCase()}`}>
      {roles.map(item => <button key={item.value} type="button" role="menuitemradio" aria-checked={item.value === role} className={`access-role-option${item.value === role ? " is-selected" : ""}`} onClick={() => { setOpen(false); onSelect(item.value); }}>
        <span className={`access-role-option-icon is-${item.value}`} aria-hidden="true"><CrmIcon name={item.value === "admin" ? "security" : item.value === "developer" ? "inbox" : "users"}/></span>
        <span className="access-role-option-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
        {item.value === role && <CrmIcon name="check"/>}
      </button>)}
    </div>}
  </div>;
}

export function WorkspaceAccess() {
  const { founder } = useAuth();
  const notify = useToast();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantError, setGrantError] = useState("");
  const [pendingGrant, setPendingGrant] = useState(false);
  const [roleChange, setRoleChange] = useState<{ member: WorkspaceMember; role: Role } | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<WorkspaceMember | null>(null);
  const [removingMember, setRemovingMember] = useState(false);
  const [removeMemberError, setRemoveMemberError] = useState("");
  const memberLoadId = useRef(0);
  const avatarUrls = useRef<string[]>([]);

  async function load() {
    if (!founder?.workspaceId || founder.role !== "admin") { setLoading(false); return; }
    const requestId = ++memberLoadId.current;
    setLoading(true);
    setLoadError("");
    const { data, error } = await db().rpc("admin_list_workspace_members", { p_workspace_id: founder.workspaceId });
    if (requestId !== memberLoadId.current) return;
    if (error) { setLoadError("Workspace members could not be loaded. Try again."); setMembers([]); }
    else {
      const records = (data ?? []) as WorkspaceMember[];
      const withPhotos = await Promise.all(records.map(async member => {
        const path = member.avatar_path;
        if (!path || !path.startsWith(`${member.user_id}/`)) return { ...member, avatar_url: null };
        const { data: image } = await db().storage.from("profile-avatars").download(path);
        return { ...member, avatar_url: image ? URL.createObjectURL(image) : null };
      }));
      const nextUrls = withPhotos.flatMap(member => member.avatar_url ? [member.avatar_url] : []);
      if (requestId !== memberLoadId.current) { nextUrls.forEach(URL.revokeObjectURL); return; }
      avatarUrls.current.forEach(URL.revokeObjectURL);
      avatarUrls.current = nextUrls;
      setMembers(withPhotos);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [founder?.workspaceId, founder?.role]);
  useEffect(() => () => { memberLoadId.current += 1; avatarUrls.current.forEach(URL.revokeObjectURL); }, []);

  async function grant() {
    if (!founder?.workspaceId) return;
    setGrantError("");
    setGrantBusy(true);
    const { error } = await db().rpc("admin_grant_workspace_access", {
      p_workspace_id: founder.workspaceId,
      p_email: email.trim(),
      p_role: role
    });
    setGrantBusy(false);
    setPendingGrant(false);
    if (error) { setGrantError(error.message.includes("No email-confirmed account") ? "No confirmed account was found for that email. The person must create and confirm their sign-in account first." : error.message.includes("already has active") ? "That account already has active workspace access." : "Access could not be granted. Check the details and try again."); return; }
    setEmail("");
    notify("Workspace access granted.");
    await load();
  }

  async function saveRole() {
    if (!founder?.workspaceId || !roleChange) return;
    setSavingRole(true);
    const { error } = await db().rpc("admin_set_workspace_member_role", {
      p_workspace_id: founder.workspaceId,
      p_user_id: roleChange.member.user_id,
      p_role: roleChange.role
    });
    setSavingRole(false);
    if (error) { notify(error.message.includes("at least one active administrator") ? "The workspace must keep at least one active administrator." : "The role could not be changed. Refresh and try again.", true); }
    else notify(`Role updated for ${roleChange.member.email}.`);
    setRoleChange(null);
    await load();
  }

  async function removeMember() {
    if (!founder?.workspaceId || !memberToRemove || removingMember) return;
    setRemovingMember(true);setRemoveMemberError("");
    const {error}=await db().rpc("admin_remove_workspace_access",{
      p_workspace_id:founder.workspaceId,
      p_user_id:memberToRemove.user_id
    });
    setRemovingMember(false);
    if(error){
      setRemoveMemberError(error.message.includes("at least one active administrator")
        ? "The workspace must keep at least one active administrator."
        : error.message.includes("own workspace access")
          ? "You cannot remove your own workspace access."
          : error.message.includes("Active workspace member not found")
            ? "This member no longer has active access. Refresh the list and try again."
            : "Workspace access could not be removed. Refresh and try again.");
      return;
    }
    const emailToRemove=memberToRemove.email;
    setMemberToRemove(null);notify(`Workspace access removed for ${emailToRemove}.`);
    await load();
  }

  if (founder?.role !== "admin") return <><PageHeader eyebrow="Workspace" title="Access" description="Only workspace administrators can manage access."/><section className="record-list-panel access-denied"><ErrorBox>Administrator access is required to manage workspace members.</ErrorBox></section></>;

  return <div className="workspace-access-page">
    <PageHeader eyebrow="Workspace administration" title="Access" description="Grant access to confirmed accounts and manage workspace roles."/>
    <section className="record-list-panel access-grant-panel">
      <div className="access-panel-heading"><span className="access-panel-icon"><CrmIcon name="users"/></span><div className="access-panel-copy"><p className="eyebrow">Add a team member</p><h2>Grant workspace access</h2><p>Invite a confirmed account into this workspace.</p></div></div>
      <form className="access-grant-form" onSubmit={(event) => { event.preventDefault(); setGrantError(""); setPendingGrant(true); }}>
        <label className="field"><span>Account email</span><input type="email" autoComplete="email" required maxLength={320} value={email} onChange={event => setEmail(event.target.value)}/></label>
        <div className="field access-grant-role-field"><span>Role</span><RoleDropdown role={role} label="Role to grant" grant onSelect={setRole}/></div>
        <button className="button button-primary" type="submit" disabled={grantBusy}>{grantBusy ? "Granting…" : "Review access"}</button>
      </form>
      {grantError && <ErrorBox>{grantError}</ErrorBox>}
      <p className="access-role-description">{roles.find(item => item.value === role)?.description} New accounts must first be invited through Supabase Auth and confirm their email.</p>
    </section>
    <section className="record-list-panel access-members-panel">
      <div className="access-panel-heading"><span className="access-panel-icon"><CrmIcon name="users"/></span><div className="access-panel-copy"><p className="eyebrow">Current workspace</p><h2>Members and roles</h2><p>Review access and update workspace roles.</p></div><span className="access-count">{members.filter(member => member.active).length} active <span>· {members.length} total</span></span></div>
      {loading ? <Loading label="Loading workspace members…"/> : loadError ? <><ErrorBox>{loadError}</ErrorBox><button type="button" className="button button-secondary" onClick={() => void load()}>Try again</button></> : members.length === 0 ? <div className="empty-state"><strong>No members found</strong><p>Grant access to a confirmed account to get started.</p></div> : <div className="access-member-list"><div className="access-member-labels"><span>Team member</span><span>Workspace role</span><span>Actions</span></div>{members.map(member => <article className={`access-member-row${member.active ? "" : " is-inactive"}`} key={member.user_id}><div className="access-member-avatar" aria-hidden="true">{member.avatar_url ? <img src={member.avatar_url} alt=""/> : member.email?.[0]?.toUpperCase() ?? "?"}</div><div className="access-member-identity"><strong>{member.email || "Email unavailable"}</strong><span>{member.active ? "Active member" : "Access inactive"} · Joined {new Date(member.joined_at).toLocaleDateString()}</span></div>{member.active ? <RoleDropdown role={member.role} label={`Role for ${member.email}`} disabled={roleChange?.member.user_id === member.user_id || savingRole || removingMember} onSelect={role => setRoleChange({ member, role })}/> : <span className="access-inactive-label">Inactive</span>}{member.active&&member.user_id!==founder?.userId&&<button type="button" className="button button-danger access-remove-member" disabled={removingMember} onClick={()=>{setRemoveMemberError("");setMemberToRemove(member);}}>Remove</button>}</article>)}</div>}
    </section>
    {pendingGrant && <Modal title="Grant workspace access?" description={`${email.trim()} will be added as a ${roles.find(item => item.value === role)?.label.toLowerCase()}.`} onClose={() => setPendingGrant(false)}><div className="access-confirm-actions"><button type="button" className="button button-secondary" onClick={() => setPendingGrant(false)}>Cancel</button><button type="button" className="button button-primary" disabled={grantBusy} onClick={() => void grant()}>{grantBusy ? "Granting…" : "Grant access"}</button></div></Modal>}
    {roleChange && <Modal title="Update member role?" description={`Change ${roleChange.member.email} to ${roles.find(item => item.value === roleChange.role)?.label}.`} onClose={() => setRoleChange(null)}><p className="access-role-description">This changes which CRM pages and records the account can access.</p><div className="access-confirm-actions"><button type="button" className="button button-secondary" disabled={savingRole} onClick={() => setRoleChange(null)}>Cancel</button><button type="button" className="button button-primary" disabled={savingRole} onClick={() => void saveRole()}>{savingRole ? "Saving…" : "Update role"}</button></div></Modal>}
    {memberToRemove&&<Modal title="Remove workspace access?" description={`${memberToRemove.email} will lose access to this workspace.`} onClose={()=>{if(!removingMember)setMemberToRemove(null);}}><div className="access-remove-confirm"><span className="access-remove-warning"><CrmIcon name="security"/></span><p>The account will be marked inactive, and its past audit history will be retained. You can grant access again later.</p></div>{removeMemberError&&<ErrorBox>{removeMemberError}</ErrorBox>}<div className="access-confirm-actions"><button type="button" className="button button-secondary" disabled={removingMember} onClick={()=>setMemberToRemove(null)}>Cancel</button><button type="button" className="button button-danger" disabled={removingMember} onClick={()=>void removeMember()}>{removingMember?"Removing…":"Remove access"}</button></div></Modal>}
  </div>;
}

export function WorkspaceAuditHistory() {
  const { founder } = useAuth();
  const pageSize = 25;
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState<any[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actorEmails, setActorEmails] = useState<Record<string,string>>({});
  const requestId = useRef(0);

  async function load(requestedPage: number) {
    if (!founder?.workspaceId || founder.role !== "admin") return;
    const currentRequest = ++requestId.current;
    setLoading(true);setError("");
    const from = (requestedPage - 1) * pageSize;
    const {data,count,error:queryError}=await db().from("audit_events")
      .select("id,action,subject_type,subject_id,actor_user_id,occurred_at,details",{count:"exact"})
      .eq("workspace_id",founder.workspaceId).order("occurred_at",{ascending:false}).range(from,from+pageSize-1);
    if(currentRequest!==requestId.current)return;
    if(queryError){setEvents([]);setTotal(0);setError("Audit history could not be loaded. Try again.");}
    else {setEvents(data??[]);setTotal(count??0);}
    setLoading(false);
  }

  useEffect(()=>{
    void load(page);
    return()=>{requestId.current+=1;};
  },[founder?.workspaceId,founder?.role,page]);
  useEffect(()=>()=>{requestId.current+=1;},[]);
  useEffect(()=>{
    if(!founder?.workspaceId||founder.role!=="admin")return;
    let active=true;
    void db().rpc("admin_list_workspace_members",{p_workspace_id:founder.workspaceId}).then(({data,error})=>{
      if(!active||error)return;
      setActorEmails(Object.fromEntries(((data??[]) as WorkspaceMember[]).map(member=>[member.user_id,member.email])));
    });
    return()=>{active=false;};
  },[founder?.workspaceId,founder?.role]);

  if(founder?.role!=="admin")return <><PageHeader eyebrow="Workspace" title="Audit history" description="Only workspace administrators can view audit history."/><section className="record-list-panel access-denied"><ErrorBox>Administrator access is required to view workspace audit events.</ErrorBox></section></>;

  const totalPages=Math.max(1,Math.ceil(total/pageSize));
  const first=total===0?0:(page-1)*pageSize+1;
  const last=Math.min(page*pageSize,total);
  const typeLabels:Record<string,string>={clients:"Client",contacts:"Contact",leads:"Lead",projects:"Project",tasks:"Task",proposals:"Proposal",payment_entries:"Payment",workspace_members:"Workspace access",workspace_member:"Workspace member"};
  const actionLabels:Record<string,string>={insert:"created",update:"updated",delete:"deleted",stage_changed:"stage changed",access_granted:"access granted",role_changed:"role changed",access_revoked:"access revoked",workspace_member_removed:"access removed",workspace_member_granted:"access granted",workspace_member_role_changed:"role changed"};

  return <div className="workspace-access-page">
    <PageHeader eyebrow="Workspace administration" title="Audit history" description="Review recent recorded changes across CRM records and workspace access." action={<button type="button" className="button button-secondary" disabled={loading} onClick={()=>void load(page)}>{loading?"Refreshing…":"Refresh"}</button>}/>
    <section className="record-list-panel access-audit-panel">
      <div className="access-panel-heading"><span className="access-panel-icon"><CrmIcon name="activity"/></span><div className="access-panel-copy"><p className="eyebrow">Workspace activity</p><h2>Recorded changes</h2><p>{total.toLocaleString()} event{total===1?"":"s"} · newest first</p></div></div>
      {error?<><ErrorBox>{error}</ErrorBox><button type="button" className="button button-secondary" onClick={()=>void load(page)}>Try again</button></>:events===null||loading&&events===null?<Loading label="Loading audit history…"/>:events.length===0?<div className="empty-state"><strong>No audit events yet</strong><p>Recorded workspace changes will appear here.</p></div>:<>
        <div className="access-audit-table-wrap"><table className="access-audit-table"><thead><tr><th>Activity</th><th>Record</th><th>Actor</th><th>Date and time</th></tr></thead><tbody>{events.map(event=>{
          const recordType=typeLabels[event.subject_type]??String(event.subject_type||"Workspace").replace(/_/g," ");
          const action=actionLabels[event.action]??String(event.action).replace(/_/g," ");
          const actor=event.actor_user_id?actorEmails[event.actor_user_id]??`User ${event.actor_user_id.slice(0,8)}`:"System";
          const actionTone=event.action==="insert"?"created":event.action==="delete"?"deleted":event.action==="stage_changed"?"stage":"updated";
          return <tr key={event.id}>
            <td><div className="audit-event-activity"><span className={`audit-event-badge is-${actionTone}`}>{action}</span><strong>{recordType}</strong>{event.details?.from&&event.details?.to&&<small>{String(event.details.from).replace(/_/g," ")} → {String(event.details.to).replace(/_/g," ")}</small>}</div></td>
            <td><div className="audit-event-record"><span>{recordType}</span><code>{event.subject_id?event.subject_id.slice(0,8):"—"}</code></div></td>
            <td><div className="audit-event-actor"><span aria-hidden="true">{actor.slice(0,1).toUpperCase()}</span><strong>{actor}</strong></div></td>
            <td><time className="audit-event-time" dateTime={event.occurred_at}><strong>{new Date(event.occurred_at).toLocaleDateString("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium"})}</strong><span>{new Date(event.occurred_at).toLocaleTimeString("en-PH",{timeZone:"Asia/Manila",hour:"numeric",minute:"2-digit"})}</span></time></td>
          </tr>;
        })}</tbody></table></div>
        <div className="access-audit-pagination"><span>Showing {first}–{last} of {total.toLocaleString()}</span><div><button type="button" className="button button-secondary" disabled={page<=1||loading} onClick={()=>setPage(value=>Math.max(1,value-1))}>← Previous</button><span>Page {page} of {totalPages}</span><button type="button" className="button button-secondary" disabled={page>=totalPages||loading} onClick={()=>setPage(value=>Math.min(totalPages,value+1))}>Next →</button></div></div>
      </>}
    </section>
  </div>;
}
