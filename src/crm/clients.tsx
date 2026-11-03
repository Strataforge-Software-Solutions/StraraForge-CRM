import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { db, projectStatus, dateText, moneyText, isPhoneLikeContactName, useAuth, useToast, CrmIcon, PageHeader, Loading, ErrorBox, Metric, Modal, StageDropdown, DeleteRecordModal } from "./shared";
import { ImagePicker, RecordAvatar, RecordImages, uploadRecordImages } from "./images";

async function loadClientLinkedLeads(workspaceId: string) {
  const fields = "id,company_name,contact_name,email,phone,updated_at,client_id,client_link_id";
  const linked = await db().from("leads").select(fields).eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
  if (!linked.error || !/client_(?:link_)?id/i.test(linked.error.message) || !/column|schema cache|does not exist/i.test(linked.error.message)) return linked;
  return db().from("leads").select("id,company_name,contact_name,email,phone,updated_at").eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
}

function resolveLinkedLeadContact(client:any,contacts:any[],leads:any[],projects:any[]){
  const savedContacts=contacts.filter(contact=>contact.client_id===client.id);
  const clientProjects=projects.filter(project=>project.client_id===client.id);
  const projectLeadIds=new Set(clientProjects.map(project=>project.lead_id).filter(Boolean));
  const explicitlyLinked=leads.filter(lead=>lead.client_id===client.id||lead.client_link_id===client.id);
  const projectLinked=leads.filter(lead=>projectLeadIds.has(lead.id));
  const linkedLeadIds: string[] = [...new Set([...explicitlyLinked,...projectLinked].sort((a:any,b:any)=>new Date(b.updated_at??0).getTime()-new Date(a.updated_at??0).getTime()).map((lead:any)=>String(lead.id)))];
  const normalizedName=String(client.name??"").trim().toLocaleLowerCase();
  const nameMatches=normalizedName?leads.filter(lead=>String(lead.company_name??"").trim().toLocaleLowerCase()===normalizedName):[];
  // Older conversions may not have kept the client/project foreign keys on
  // the inquiry. Fall back to the most recently updated inquiry for the same
  // company, preferring one with usable contact details.
  const bestNameMatch=[...nameMatches].sort((a:any,b:any)=>{
    const score=(lead:any)=>Number(Boolean(String(lead.email??"").trim()))*4
      +Number(Boolean(String(lead.phone??"").trim()))*4
      +Number(Boolean(String(lead.contact_name??"").trim()&&!isPhoneLikeContactName(String(lead.contact_name??""))))*2;
    return score(b)-score(a)||new Date(b.updated_at??0).getTime()-new Date(a.updated_at??0).getTime();
  })[0];
  // A client can have several linked inquiries (for example, one from before
  // conversion and a later update). Don't let an incomplete, newer row hide
  // contact details that are present on another inquiry for this client.
  const leadCandidates=[...new Map([...explicitlyLinked,...projectLinked,...(bestNameMatch?[bestNameMatch]:[])].map((lead:any)=>[lead.id,lead])).values()];
  const linkedLead=leadCandidates.sort((a:any,b:any)=>{
    const score=(lead:any)=>{
      const hasEmail=Boolean(String(lead.email??"").trim());
      const hasPhone=Boolean(String(lead.phone??"").trim());
      const hasName=Boolean(String(lead.contact_name??"").trim()&&!isPhoneLikeContactName(String(lead.contact_name??"")));
      const linked=explicitlyLinked.some((item:any)=>item.id===lead.id);
      const viaProject=projectLinked.some((item:any)=>item.id===lead.id);
      return Number(hasEmail)*8+Number(hasPhone)*8+Number(hasName)*2+Number(linked)+Number(viaProject)*.5;
    };
    return score(b)-score(a);
  })[0];
  const linkedContactName=String(linkedLead?.contact_name??"").trim();
  const leadContact=linkedLead?{
    id:`lead-${linkedLead.id}`,
    client_id:client.id,
    full_name:!linkedContactName||isPhoneLikeContactName(linkedContactName)?client.name:linkedContactName,
    title:"From linked inquiry",
    email:linkedLead.email,
    phone:linkedLead.phone,
    is_primary:true,
    updated_at:linkedLead.updated_at,
    source:"linked_lead",
  }:null;
  const normalizedSavedContacts=savedContacts.map((contact:any)=>isPhoneLikeContactName(contact.full_name)?{...contact,full_name:client.name}:contact);
  const matchingSaved=leadContact&&normalizedSavedContacts.find((contact:any)=>(leadContact.email&&contact.email?.toLocaleLowerCase()===leadContact.email.toLocaleLowerCase())||(leadContact.phone&&contact.phone===leadContact.phone));
  const savedPrimary=normalizedSavedContacts.find((contact:any)=>contact.is_primary)??normalizedSavedContacts[0]??null;
  const savedWithDetails=normalizedSavedContacts.find((contact:any)=>contact.email||contact.phone)??null;
  // A primary contact record can exist but have empty fields. Prefer a saved
  // contact that matches the inquiry, and fill gaps in a blank primary record
  // from the linked inquiry so the directory doesn't show "Not recorded".
  // A blank primary row should not hide usable details from another saved
  // contact when there is no linked inquiry to fill it in.
  const chosenSaved=matchingSaved??(savedPrimary?.email||savedPrimary?.phone?savedPrimary:savedWithDetails??savedPrimary);
  const savedHasContactDetails=Boolean(chosenSaved?.email||chosenSaved?.phone);
  const primaryContact=leadContact&&chosenSaved&&(!savedHasContactDetails||matchingSaved)
    ?{...leadContact,...chosenSaved,full_name:chosenSaved.full_name||leadContact.full_name,email:chosenSaved.email||leadContact.email,phone:chosenSaved.phone||leadContact.phone,title:chosenSaved.title||leadContact.title}
    :chosenSaved??leadContact??null;
  const clientContacts=leadContact&&!normalizedSavedContacts.some((contact:any)=>contact.id===matchingSaved?.id)?[...normalizedSavedContacts,...(matchingSaved?[]:[leadContact])]:normalizedSavedContacts;
  return {savedContacts,clientProjects,clientContacts,primaryContact,linkedLeadIds};
}

export function Clients(){
  const {founder}=useAuth();
  const notify=useToast();
  const [searchParams,setSearchParams]=useSearchParams();
  const [rows,setRows]=useState<any[]|null>(null);
  const [contacts,setContacts]=useState<any[]>([]);
  const [linkedLeads,setLinkedLeads]=useState<any[]>([]);
  const [projects,setProjects]=useState<any[]>([]);
  const [show,setShow]=useState(false);
  const [clientImages,setClientImages]=useState<File[]>([]);
  const [savedClientId,setSavedClientId]=useState("");
  const [clientFormError,setClientFormError]=useState("");
  const [clientSaving,setClientSaving]=useState(false);
  const [clientToDelete,setClientToDelete]=useState<any>(null);
  const [clientDeleteBusy,setClientDeleteBusy]=useState(false);
  const [clientDeleteError,setClientDeleteError]=useState("");
  const [loadError,setLoadError]=useState("");
  const [relatedError,setRelatedError]=useState("");
  const [changes,setChanges]=useState<any[]|null>(null);
  const [changesError,setChangesError]=useState("");
  const [clientTagInput,setClientTagInput]=useState("");
  const [clientTagsBusy,setClientTagsBusy]=useState(false);
  const filter=searchParams.get("status")??"all";
  const query=searchParams.get("q")??"";
  const sortParam=searchParams.get("sort");
  const sort=sortParam==="name"||sortParam==="projects"?sortParam:"updated";
  const page=Math.max(1,Number(searchParams.get("page")??1)||1);
  const tab=searchParams.get("tab")??"overview";
  const setParam=(key:string,value:string)=>setSearchParams(current=>{const next=new URLSearchParams(current);if(value)next.set(key,value);else next.delete(key);if(key!=="page")next.delete("page");return next;},{replace:true});
  const load=useCallback(async()=>{
    setRows(null);setLoadError("");setRelatedError("");
    const [clientResult,contactResult,leadResult,projectResult]=await Promise.all([
      db().from("clients").select("id,name,client_type,relationship_status,website,notes,tags,created_at,updated_at").eq("workspace_id",founder!.workspaceId).is("archived_at",null).order("name"),
      db().from("contacts").select("id,client_id,full_name,title,email,phone,is_primary,updated_at").eq("workspace_id",founder!.workspaceId).is("archived_at",null).order("is_primary",{ascending:false}).order("full_name"),
      // Keep archived inquiries in this lookup too: converting an inquiry can
      // leave its client link as the only place the original contact lives.
      // Try direct client links when available. Older workspaces can still
      // show inquiry contacts through a project or matching company name.
      loadClientLinkedLeads(founder!.workspaceId),
      db().from("projects").select("id,lead_id,client_id,name,status,agreed_amount,currency,start_date,target_date,updated_at").eq("workspace_id",founder!.workspaceId).is("archived_at",null).order("updated_at",{ascending:false}),
    ]);
    if(clientResult.error){setLoadError(clientResult.error.message);setRows([]);setContacts([]);setLinkedLeads([]);setProjects([]);return;}
    setRows(clientResult.data??[]);setContacts(contactResult.data??[]);setLinkedLeads(leadResult.data??[]);setProjects(projectResult.data??[]);
    const optionalErrors=[contactResult.error,leadResult.error,projectResult.error].filter(Boolean);
    setRelatedError(optionalErrors.length?"Some contact or project details could not be loaded. Retry to refresh the directory.":"");
  },[founder]);
  useEffect(()=>{void load();const refreshFromAssistant=()=>void load();window.addEventListener("strataforge:crm-data-changed",refreshFromAssistant);return()=>window.removeEventListener("strataforge:crm-data-changed",refreshFromAssistant);},[load]);
  const allRows=rows??[];
  const enriched=allRows.map(client=>{
    const {clientProjects,clientContacts,primaryContact,linkedLeadIds}=resolveLinkedLeadContact(client,contacts,linkedLeads,projects);
    const values=new Map<string,number>();
    clientProjects.forEach(project=>values.set(project.currency,(values.get(project.currency)??0)+Number(project.agreed_amount??0)));
    const totalValue=[...values.entries()].map(([currency,amount])=>`${currency} ${amount.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2})}`).join(" · ");
    const directoryContact=primaryContact??clientContacts.find((contact:any)=>contact.is_primary)??clientContacts[0]??null;
    return {...client,clientContacts,clientProjects,primaryContact,directoryContact,totalValue,linkedLeadIds};
  });
  const counts={all:allRows.length,active:allRows.filter(client=>client.relationship_status==="active").length,on_hold:allRows.filter(client=>client.relationship_status==="on_hold").length,inactive:allRows.filter(client=>client.relationship_status==="inactive").length};
  const visible=enriched.filter(client=>filter==="all"||client.relationship_status===filter)
    .filter(client=>`${client.name} ${client.website??""} ${client.clientContacts.map((contact:any)=>`${contact.full_name} ${contact.email??""} ${contact.phone??""}`).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b)=>sort==="name"?a.name.localeCompare(b.name):sort==="projects"?b.clientProjects.length-a.clientProjects.length:new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime());
  const requestedPageSize=Number(searchParams.get("perPage")??10);const pageSize=[10,25,50].includes(requestedPageSize)?requestedPageSize:10;const pageCount=Math.max(1,Math.ceil(visible.length/pageSize));const pageRows=visible.slice((page-1)*pageSize,page*pageSize);
  const selectedId=searchParams.get("selected")??"";
  const selected=enriched.find(client=>client.id===selectedId)??null;
  const completedProjects=projects.filter(project=>project.status==="completed").length;
  const ongoingProjects=projects.filter(project=>project.status==="planned"||project.status==="in_progress").length;
  useEffect(()=>{
    if(rows===null)return;
    const current=searchParams.get("selected");
    if(current&&!visible.some(client=>client.id===current)){setParam("selected","");return;}
  },[rows,searchParams,visible,pageRows,setParam]);
  useEffect(()=>{
    if(!selected)return;
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape")setParam("selected","");};
    window.addEventListener("keydown",onKeyDown);
    return()=>window.removeEventListener("keydown",onKeyDown);
  },[selected?.id]);
  useEffect(()=>{if(page>pageCount)setParam("page",String(pageCount));},[page,pageCount,setParam]);
  useEffect(()=>{
    if(!selected||!(tab==="changes"||tab==="overview")){setChanges(null);setChangesError("");return;}
    let active=true;setChanges(null);setChangesError("");
    void db().from("audit_events").select("id,action,occurred_at,details").eq("workspace_id",founder!.workspaceId).eq("subject_type","clients").eq("subject_id",selected.id).order("occurred_at",{ascending:false}).limit(12).then(({data,error})=>{if(!active)return;setChanges(data??[]);setChangesError(error?"Client activity could not be loaded.":"");});
    return()=>{active=false;};
  },[founder,selected?.id,tab]);
  useEffect(()=>{setClientTagInput("");},[selected?.id]);
  async function saveClientTags(nextTags:string[]):Promise<boolean>{
    if(!selected||clientTagsBusy)return false;
    setClientTagsBusy(true);
    const {error}=await db().from("clients").update({tags:nextTags}).eq("workspace_id",founder!.workspaceId).eq("id",selected.id);
    setClientTagsBusy(false);
    if(error){notify("Could not update client tags. Apply the latest database migrations and try again.",true);return false;}
    setRows(current=>current?.map(client=>client.id===selected.id?{...client,tags:nextTags}:client)??null);
    const {data:activityData,error:activityError}=await db().from("audit_events").select("id,action,occurred_at,details").eq("workspace_id",founder!.workspaceId).eq("subject_type","clients").eq("subject_id",selected.id).order("occurred_at",{ascending:false}).limit(12);
    if(activityError)setChangesError("Client activity could not be loaded.");else{setChanges(activityData??[]);setChangesError("");}
    notify("Client tags updated.");
    return true;
  }
  async function addClientTag(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const tag=clientTagInput.trim().replace(/\s+/g," ");
    const tags=Array.isArray(selected?.tags)?selected.tags as string[]:[];
    if(!tag)return;
    if(tag.length>32){notify("Tags must be 32 characters or fewer.",true);return;}
    if(tags.some(existing=>existing.toLocaleLowerCase()===tag.toLocaleLowerCase())){notify("That tag is already on this client.",true);return;}
    if(tags.length>=12){notify("A client can have up to 12 tags.",true);return;}
    if(await saveClientTags([...tags,tag]))setClientTagInput("");
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(clientSaving)return;
    setClientSaving(true);
    setClientFormError("");
    try{
      let clientId=savedClientId;
      if(!clientId){
        const form=new FormData(event.currentTarget);
        const {data,error}=await db().rpc("create_client_with_primary_contact",{p_workspace_id:founder!.workspaceId,p_name:String(form.get("name")),p_client_type:String(form.get("client_type")),p_relationship_status:String(form.get("relationship_status")),p_website:String(form.get("website")||"")||null,p_notes:String(form.get("notes")||"")||null,p_contact_name:String(form.get("contact_name")||"")||null,p_contact_title:String(form.get("title")||"")||null,p_contact_email:String(form.get("email")||"")||null,p_contact_phone:String(form.get("phone")||"")||null});
        if(error||!data){setClientFormError(error?.message||"Client could not be saved.");return;}
        clientId=String(data);
        setSavedClientId(clientId);
      }
      if(clientImages.length){
        const result=await uploadRecordImages(founder!.workspaceId,"client",clientId,clientImages);
        setClientImages(result.failed);
        if(result.error){setClientFormError(`Client saved, but ${result.failed.length} ${result.failed.length===1?"image":"images"} could not upload. ${result.error} Retry Save client or add them later from the client record.`);void load();return;}
      }
      notify("Client added.");closeClientForm();void load();
    }catch{setClientFormError("Client or image upload failed. Please try again.");}
    finally{setClientSaving(false);}
  }
  function closeClientForm(){setShow(false);setClientImages([]);setSavedClientId("");setClientFormError("");}
  const statusText=(value:string)=>value==="on_hold"?"On hold":value.charAt(0).toUpperCase()+value.slice(1);
  const openPanel=(id:string)=>setSearchParams(current=>{const next=new URLSearchParams(current);next.set("selected",id);next.set("tab","overview");return next;},{replace:true});
  async function confirmClientDelete(){
    if(!founder||!clientToDelete||clientDeleteBusy)return;
    setClientDeleteBusy(true);setClientDeleteError("");
    const {data,error}=await db().from("clients").update({archived_at:new Date().toISOString()}).eq("workspace_id",founder.workspaceId).eq("id",clientToDelete.id).is("archived_at",null).select("id").maybeSingle();
    setClientDeleteBusy(false);
    if(error||!data){setClientDeleteError(error?.message??"This client changed or is no longer available. Refresh and try again.");return;}
    setClientToDelete(null);setParam("selected","");notify("Client deleted.");await load();
  }
  return <>
    <PageHeader eyebrow="Relationships" title="Clients" description="Manage your clients, their projects, and communication in one place." action={<button className="button button-primary" onClick={()=>setShow(true)}><span aria-hidden="true">＋</span> Add Client</button>}/>
    <section className="clients-metrics" aria-label="Client and project summary">
      {[["Total clients",counts.all,"In your workspace","orange","users"],["Active clients",counts.active,"Current relationships","blue","clients"],["Completed projects",completedProjects,"Finished client work","green","check"],["Ongoing projects",ongoingProjects,"Planned or in delivery","purple","layers"]].map(([label,value,hint,tone,icon])=><div className={`clients-metric clients-metric-${tone}`} key={String(label)}><span><CrmIcon name={String(icon)}/></span><div><small>{label}</small><strong>{value}</strong><small>{hint}</small></div></div>)}
    </section>
    <div className="client-directory-toolbar">
      <nav className="client-filter-row" aria-label="Filter clients by relationship status">{[["all","All clients"],["active","Active"],["on_hold","On hold"],["inactive","Inactive"]].map(([value,label])=><button type="button" key={value} className={`client-filter-chip ${filter===value?"is-active":""}`} aria-pressed={filter===value} onClick={()=>setParam("status",value==="all"?"":value)}>{label}<strong>{counts[value as keyof typeof counts]}</strong></button>)}</nav>
      <div className="client-directory-controls"><label className="clients-search"><CrmIcon name="search"/><span className="visually-hidden">Search clients, projects, or contacts</span><input type="search" value={query} onChange={event=>setParam("q",event.target.value)} placeholder="Search clients, projects, or contacts…"/></label><div className="client-sort-control"><StageDropdown value={sort} options={["updated", "name", "projects"]} optionLabels={{ updated: "Recently updated", name: "Name A–Z", projects: "Most projects" }} disabled={false} label="Sort clients" minMenuWidth={180} onChange={(value)=>setParam("sort",value)}/></div></div>
    </div>
    {loadError&&<div className="clients-error"><ErrorBox>{loadError}</ErrorBox><button type="button" className="button button-secondary" onClick={()=>void load()}>Retry</button></div>}
    {relatedError&&<div className="clients-error"><ErrorBox>{relatedError}</ErrorBox><button type="button" className="button button-secondary" onClick={()=>void load()}>Retry</button></div>}
    <div className={`clients-workspace ${selected?"has-selection":""}`}>
        <section className="record-list-panel clients-list-panel">
        <div className="clients-list-toolbar"><div><h2>Client directory</h2><p>{rows===null?"Loading clients…":`${visible.length} ${visible.length===1?"client":"clients"}`}</p></div></div>
        {rows===null?<Loading label="Loading your clients…"/>:loadError?<div className="empty-state"><h3>Client directory unavailable</h3><p>Your workspace’s client records could not be loaded.</p></div>:visible.length?<><div className="clients-table-scroll"><table className="clients-table"><thead><tr><th>Client</th><th>Primary contact</th><th>Email / phone</th><th>Status</th><th>Projects</th><th>Total value</th><th>Updated</th><th>Open</th></tr></thead><tbody>{pageRows.map(client=>{const directoryContact=client.directoryContact;const email=directoryContact?.email??client.clientContacts.find((contact:any)=>contact.email)?.email;const phone=directoryContact?.phone??client.clientContacts.find((contact:any)=>contact.phone)?.phone;return <tr key={client.id} className={selected?.id===client.id?"is-selected":""} onClick={()=>openPanel(client.id)}><td><button className="client-table-name" type="button" onClick={event=>{event.stopPropagation();openPanel(client.id);}}><RecordAvatar recordType="client" recordId={client.id} name={client.name} className="client-table-avatar" fallbackLeadIds={client.linkedLeadIds}/><span><strong>{client.name}</strong><small>{client.client_type==="person"?"Individual":"Organization"}</small></span></button></td><td data-label="Primary contact">{directoryContact?.full_name?<span className="client-contact-cell"><strong>{directoryContact.full_name}</strong><small>{directoryContact.title|| (directoryContact.is_primary?"Primary contact":"Contact")}</small></span>:<span className="client-cell-muted">Not added</span>}</td><td data-label="Email / phone"><span className="client-contact-cell">{email&&<a href={`mailto:${email}`} onClick={event=>event.stopPropagation()}><CrmIcon name="inbox"/>{email}</a>}{phone&&<a href={`tel:${phone}`} onClick={event=>event.stopPropagation()}><CrmIcon name="phone"/>{phone}</a>}{!email&&!phone&&<small>Not recorded</small>}</span></td><td data-label="Status"><span className={`client-state client-state-${client.relationship_status.replace(/_/g,"-")}`}>{statusText(client.relationship_status)}</span></td><td data-label="Projects">{client.clientProjects.length}</td><td data-label="Total value">{client.totalValue||"—"}</td><td data-label="Updated">{dateText(client.updated_at)}</td><td data-label="Open"><Link className="client-row-open" to={`/clients/${client.id}`} onClick={event=>event.stopPropagation()}>Open →</Link></td></tr>})}</tbody></table></div><div className="clients-pagination"><span>{visible.length?`${(page-1)*pageSize+1}–${Math.min(page*pageSize,visible.length)} of ${visible.length} clients`:"0 clients"}</span><nav aria-label="Client directory pages"><button type="button" disabled={page<=1} aria-label="Previous page" onClick={()=>setParam("page",String(page-1))}>‹</button><span>Page {Math.min(page,pageCount)} of {pageCount}</span><button type="button" disabled={page>=pageCount} aria-label="Next page" onClick={()=>setParam("page",String(page+1))}>›</button></nav><div className="client-page-size"><span>Rows</span><StageDropdown className="client-page-size-dropdown" value={String(pageSize)} options={["10","25","50"]} optionLabels={{"10":"10 per page","25":"25 per page","50":"50 per page"}} disabled={false} label="Clients per page" minMenuWidth={132} onChange={size=>setParam("perPage",size)}/></div></div></>:<div className="empty-state"><h3>{allRows.length?"No matching clients":"No clients yet"}</h3><p>{allRows.length?"Try another search or relationship filter.":"Add a client to keep contact details and website projects together."}</p>{!allRows.length&&<button className="button button-primary" type="button" onClick={()=>setShow(true)}>＋ Add Client</button>}</div>}
      </section>
      {selected&&<div className="client-drawer-layer"><button className="client-drawer-backdrop" type="button" aria-label="Close client details" onClick={()=>setParam("selected","")}/><aside className="client-quick-panel client-drawer" role="dialog" aria-modal="true" aria-label={`${selected.name} client details`}>
        <header className="client-quick-head"><RecordAvatar recordType="client" recordId={selected.id} name={selected.name} className="client-avatar" fallbackLeadIds={selected.linkedLeadIds}/><div><h2>{selected.name}</h2><p>{selected.primaryContact?.title|| (selected.client_type==="person"?"Individual client":"Organization")}</p></div><span className={`client-state client-state-${selected.relationship_status.replace(/_/g,"-")}`}>{statusText(selected.relationship_status)}</span><Link className="client-panel-close" to="/clients" aria-label="Clear client selection">×</Link></header>
        <nav className="client-panel-tabs" aria-label="Client details">{[["overview","Overview"],["projects","Projects"],["notes","Notes"],["changes","CRM changes"]].map(([value,label])=><button type="button" key={value} aria-current={tab===value?"page":undefined} onClick={()=>setParam("tab",value)}>{label}</button>)}</nav>
        <div className="client-panel-body" key={tab}>
          {tab==="overview"&&<>
            <section className="client-panel-section"><h3>Client information</h3>{selected.clientContacts.length?<ul className="client-contact-list">{selected.clientContacts.map((contact:any)=><li key={contact.id}><span className="client-contact-icon"><CrmIcon name="users"/></span><div><strong>{contact.full_name}</strong><small>{contact.title|| (contact.is_primary?"Primary contact":"Contact")}</small>{contact.email&&<a href={`mailto:${contact.email}`}>{contact.email}</a>}{contact.phone&&<a href={`tel:${contact.phone}`}>{contact.phone}</a>}</div></li>)}</ul>:<p className="client-panel-muted">No contacts recorded yet.</p>}<dl className="client-contact-details"><div><dt>Client type</dt><dd>{selected.client_type==="person"?"Individual":"Organization"}</dd></div><div><dt>Status</dt><dd>{statusText(selected.relationship_status)}</dd></div><div><dt>Website</dt><dd>{selected.website?<a href={selected.website.startsWith("http")?selected.website:`https://${selected.website}`} target="_blank" rel="noreferrer">{selected.website}</a>:"Not added"}</dd></div><div><dt>Updated</dt><dd>{dateText(selected.updated_at)}</dd></div></dl></section>
            <section className="client-panel-section"><div className="client-panel-section-heading"><h3>Projects ({selected.clientProjects.length})</h3><button type="button" onClick={()=>setParam("tab","projects")}>View all →</button></div>{selected.clientProjects.length?<ul className="client-mini-projects">{selected.clientProjects.slice(0,3).map((project:any)=><li key={project.id}><Link to={`/projects/${project.id}`}><strong>{project.name}</strong><span className={`project-state-badge project-state-${project.status}`}>{projectStatus[project.status]??project.status}</span></Link><small>{moneyText(project.agreed_amount,project.currency)}</small></li>)}</ul>:<p className="client-panel-muted">No projects linked to this client yet.</p>}</section>
            <section className="client-panel-section"><div className="client-panel-section-heading"><h3>Tags</h3><span className="client-tag-count">{(selected.tags??[]).length}/12</span></div>{selected.tags?.length?<ul className="lead-tag-list client-tag-list">{selected.tags.map((tag:string)=><li className="lead-tag-chip" key={tag}>{tag}<button type="button" aria-label={`Remove ${tag} tag`} disabled={clientTagsBusy} onClick={()=>void saveClientTags(selected.tags.filter((item:string)=>item!==tag))}>×</button></li>)}</ul>:<p className="lead-tags-empty">No tags yet.</p>}<form className="lead-tags-form client-tags-form" onSubmit={addClientTag}><input aria-label="Add a client tag" placeholder="Add a tag…" maxLength={32} value={clientTagInput} onChange={event=>setClientTagInput(event.target.value)} disabled={clientTagsBusy||(selected.tags??[]).length>=12}/><button className="button button-secondary" type="submit" disabled={clientTagsBusy||!clientTagInput.trim()||(selected.tags??[]).length>=12}>{clientTagsBusy?"Saving…":"+ Add Tag"}</button></form></section>
            <section className="client-panel-section"><div className="client-panel-section-heading"><h3>Recent activity</h3><button type="button" onClick={()=>setParam("tab","changes")}>View all →</button></div>{changes===null?<p className="client-panel-muted" role="status">Loading activity…</p>:changesError?<ErrorBox>{changesError}</ErrorBox>:changes.length?<ul className="client-change-list">{changes.slice(0,5).map(change=><li key={change.id}><span><CrmIcon name="activity"/></span><div><strong>{change.action==="insert"?"Client record added":change.action==="delete"?"Client record removed":"Client record updated"}</strong><time>{new Date(change.occurred_at).toLocaleString("en",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"Asia/Manila"})}</time></div></li>)}</ul>:<p className="client-panel-muted">No recent activity yet.</p>}</section>
            {selected.notes&&<section className="client-panel-section"><h3>Notes</h3><p className="client-note-content">{selected.notes}</p></section>}
          </>}
          {tab==="projects"&&<section className="client-panel-section"><div className="client-panel-section-heading"><h3>Client projects</h3><span>{selected.clientProjects.length}</span></div>{selected.clientProjects.length?<ul className="client-project-list">{selected.clientProjects.map((project:any)=><li key={project.id}><Link to={`/projects/${project.id}`}><strong>{project.name}</strong><span className={`project-state-badge project-state-${project.status}`}>{projectStatus[project.status]??project.status}</span></Link><p>{moneyText(project.agreed_amount,project.currency)} · Target {dateText(project.target_date)}</p></li>)}</ul>:<p className="client-panel-muted">No projects linked to this client yet.</p>}</section>}
          {tab==="notes"&&<section className="client-panel-section"><h3>Client notes</h3>{selected.notes?<p className="client-note-content">{selected.notes}</p>:<p className="client-panel-muted">No notes have been recorded for this client.</p>}</section>}
          {tab==="changes"&&<section className="client-panel-section"><h3>CRM record changes</h3>{changes===null?<p className="client-panel-muted" role="status">Loading record changes…</p>:changesError?<ErrorBox>{changesError}</ErrorBox>:changes.length?<ul className="client-change-list">{changes.map(change=><li key={change.id}><span><CrmIcon name="activity"/></span><div><strong>{change.action.replace(/_/g," ")}</strong><time>{new Date(change.occurred_at).toLocaleString("en",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"Asia/Manila"})}</time></div></li>)}</ul>:<p className="client-panel-muted">No CRM record changes have been logged yet.</p>}</section>}
        </div>
        <footer className="client-panel-footer"><button type="button" className="button button-danger" onClick={()=>{setClientDeleteError("");setClientToDelete(selected);}}>Delete client</button><Link className="button button-primary client-open-record" to={`/clients/${selected.id}`}>Open full client record</Link></footer>
      </aside></div>}
    </div>
    {show&&<Modal title="Add a client" description="Enter client and primary contact details." onClose={closeClientForm} className="add-client-dialog"><form className="record-form" onSubmit={submit}><fieldset className="crm-image-saved-fields" disabled={Boolean(savedClientId)}><div className="form-grid">{[["name","Client name *"],["contact_name","Contact person"],["title","Role / title"],["email","Email"],["phone","Phone"],["website","Website"],["notes","Notes"]].map(([key,label])=><label className="field" key={key}><span>{label}</span><input name={key} required={key==="name"}/></label>)}<label className="field"><span>Client type</span><select name="client_type"><option value="organization">Organization</option><option value="person">Individual</option></select></label><label className="field"><span>Relationship status</span><select name="relationship_status"><option value="active">Active</option><option value="on_hold">On hold</option><option value="inactive">Inactive</option></select></label></div></fieldset><ImagePicker files={clientImages} onChange={setClientImages} disabled={clientSaving}/>{clientFormError&&<ErrorBox>{clientFormError}</ErrorBox>}<div className="form-actions"><button type="button" className="button button-secondary" disabled={clientSaving} onClick={closeClientForm}>Cancel</button><button className="button button-primary" disabled={clientSaving}>{clientSaving?"Saving…":savedClientId?"Retry images":"Save client"}</button></div></form></Modal>}
    {clientToDelete&&<DeleteRecordModal recordType="client" recordName={clientToDelete.name} busy={clientDeleteBusy} error={clientDeleteError} onClose={()=>{if(!clientDeleteBusy)setClientToDelete(null);}} onConfirm={()=>void confirmClientDelete()}/>}
  </>;
}

export function ClientDetail(){
  const id=useLocation().pathname.split("/")[2];
  const {founder}=useAuth();
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState("");
  const [avatarVersion,setAvatarVersion]=useState(0);
  const [auditHistory,setAuditHistory]=useState<any[]|null>(null);
  const [auditHistoryError,setAuditHistoryError]=useState(false);
  const notify=useToast();
  const [projectToDelete,setProjectToDelete]=useState<any>(null);
  const [projectDeleteBusy,setProjectDeleteBusy]=useState(false);
  const [projectDeleteError,setProjectDeleteError]=useState("");

  useEffect(()=>{
    if(!founder)return;
    let active=true;
    setLoading(true);
    setLoadError("");
    void Promise.all([
      db().from("clients").select("*").eq("id",id).eq("workspace_id",founder.workspaceId).maybeSingle(),
      db().from("contacts").select("*").eq("client_id",id).eq("workspace_id",founder.workspaceId).is("archived_at",null),
      db().from("projects").select("id,lead_id,client_id,name,status,agreed_amount,currency").eq("client_id",id).eq("workspace_id",founder.workspaceId).is("archived_at",null),
      // Keep archived inquiries available as a fallback, matching the client directory.
      // The contact fallback also works when direct client links are unavailable.
      loadClientLinkedLeads(founder.workspaceId),
    ]).then(([client,contacts,projects,leads])=>{
      if(!active)return;
      const error=client.error||contacts.error||projects.error||leads.error;
      if(error){setLoadError(error.message);setData(null);}
      else if(client.data){
        const resolved=resolveLinkedLeadContact(client.data,contacts.data??[],leads.data??[],projects.data??[]);
        setData({client:client.data,contacts:resolved.clientContacts,projects:resolved.clientProjects,primaryContact:resolved.primaryContact,linkedLeadIds:resolved.linkedLeadIds});
      }else setData(null);
      setLoading(false);
    }).catch((error:any)=>{
      if(!active)return;
      setLoadError(error?.message||"Client details could not be loaded.");
      setLoading(false);
    });
    return ()=>{active=false;};
  },[founder,id]);

  useEffect(()=>{
    if(!founder||!data?.client){setAuditHistory(null);return;}
    let active=true;
    setAuditHistory(null);setAuditHistoryError(false);
    const projectIds=(data.projects??[]).map((project:any)=>project.id);
    const subjectIds=[data.client.id,...projectIds,...(data.linkedLeadIds??[])];
    void db().from("audit_events").select("id,action,occurred_at,details,subject_type,subject_id")
      .eq("workspace_id",founder.workspaceId).in("subject_type",["clients","projects","leads"]).in("subject_id",subjectIds)
      .order("occurred_at",{ascending:false}).limit(30).then(({data:events,error})=>{
        if(!active)return;
        setAuditHistory(events??[]);setAuditHistoryError(Boolean(error));
      });
    return()=>{active=false;};
  },[founder?.workspaceId,data?.client?.id,data?.projects,data?.linkedLeadIds]);

  async function confirmClientProjectDelete(){
    if(!founder||!projectToDelete||projectDeleteBusy)return;
    setProjectDeleteBusy(true);setProjectDeleteError("");
    const {data:archived,error}=await db().from("projects").update({archived_at:new Date().toISOString()})
      .eq("id",projectToDelete.id).eq("client_id",id).eq("workspace_id",founder.workspaceId).is("archived_at",null).select("id").maybeSingle();
    setProjectDeleteBusy(false);
    if(error||!archived){setProjectDeleteError(error?.message??"This project is no longer linked to this client or is already unavailable. Refresh and try again.");return;}
    setData((current:any)=>current?{...current,projects:current.projects.filter((project:any)=>project.id!==projectToDelete.id)}:current);
    setProjectToDelete(null);notify("Project deleted.");
  }

  if(loading)return <Loading label="Loading client details…"/>;
  if(loadError)return <><PageHeader eyebrow="Client directory" title="Client details unavailable" description="We couldn’t load this client record." action={<Link className="button button-secondary" to="/clients">← Clients</Link>}/><ErrorBox>{loadError}</ErrorBox></>;
  if(!data)return <><PageHeader eyebrow="Client directory" title="Client not found" description="This client may have been removed or may not belong to this workspace." action={<Link className="button button-secondary" to="/clients">← Clients</Link>}/><div className="empty-state"><h3>No client record found</h3><p>Return to the client directory to choose another record.</p></div></>;

  const {client,contacts,projects,primaryContact}=data;
  const relationshipLabel=client.relationship_status?.replace(/_/g," ").replace(/\b\w/g,(letter:string)=>letter.toUpperCase())||"Active";
  const clientType=client.client_type==="person"?"Individual":"Organization";
  const totalValue=projects.reduce((sum:number,project:any)=>sum+(Number(project.agreed_amount)||0),0);
  const projectCurrencies=Array.from(new Set<string>(projects.map((project:any)=>String(project.currency||"USD"))));
  const projectValue=projects.length===0?"—":projectCurrencies.length>1?"Mixed currencies":moneyText(totalValue,projectCurrencies[0]);
  const website=client.website?(client.website.startsWith("http")?client.website:`https://${client.website}`):"";

  return <div className="client-record-page">
    <PageHeader eyebrow="Client directory" title={client.name} description={`${clientType} client · ${relationshipLabel} relationship`} avatar={<RecordAvatar recordType="client" recordId={client.id} name={client.name} className="client-heading-avatar" fallbackLeadIds={data.linkedLeadIds} refreshKey={avatarVersion}/>} action={<Link className="button button-secondary" to="/clients">← Clients</Link>}/>
    <section className="dashboard-metrics client-record-metrics" aria-label="Client summary">
      <Metric label="Contacts" value={contacts.length} hint={primaryContact?`Primary: ${primaryContact.full_name}`:"No contacts added"} tone="orange" icon="♙"/>
      <Metric label="Projects" value={projects.length} hint={projects.length?"Linked delivery work":"No linked projects"} tone="blue" icon="▱"/>
      <Metric label="Project value" value={projectValue} hint="Across linked projects" tone="green" icon="$"/>
      <Metric label="Relationship" value={relationshipLabel} hint={clientType} tone="purple" icon="✓"/>
    </section>

    <div className="client-detail-grid client-record-grid">
      <div className="client-record-column">
        <section className="record-list-panel client-record-card">
          <header className="client-record-card-heading"><span className="client-record-icon client-record-icon-orange"><CrmIcon name="users"/></span><div><h2>Contact information</h2><p>People connected to {client.name}.</p></div><span className="client-record-count">{contacts.length}</span></header>
          {contacts.length?<ul className="client-record-contacts">{contacts.map((contact:any)=><li key={contact.id}>
            <span className="client-record-avatar">{(contact.full_name||"?").trim().split(/\s+/).slice(0,2).map((part:string)=>part[0]).join("").toUpperCase()}</span>
            <div className="client-record-contact-main"><div className="client-record-contact-title"><strong>{contact.full_name||"Unnamed contact"}</strong>{contact.is_primary&&<span className="client-record-primary">Primary contact</span>}</div>
              {contact.title&&<small>{contact.title}</small>}
              <div className="client-record-contact-links">{contact.email?<a href={`mailto:${contact.email}`}><CrmIcon name="inbox"/>{contact.email}</a>:<span className="client-record-muted">No email recorded</span>}{contact.phone?<a href={`tel:${contact.phone}`}><CrmIcon name="phone"/>{contact.phone}</a>:<span className="client-record-muted">No phone recorded</span>}</div>
            </div>
          </li>)}</ul>:<div className="client-record-empty"><span className="client-record-empty-icon"><CrmIcon name="users"/></span><strong>No contacts yet</strong><p>Add a contact from the client directory to keep their details here.</p></div>}
        </section>

        <section className="record-list-panel client-record-card">
          <header className="client-record-card-heading"><span className="client-record-icon client-record-icon-purple"><CrmIcon name="layers"/></span><div><h2>Relationship details</h2><p>Organization profile and account notes.</p></div></header>
          <dl className="client-record-details">
            <div><dt>Client type</dt><dd>{clientType}</dd></div>
            <div><dt>Relationship status</dt><dd><span className={`client-state client-state-${String(client.relationship_status||"active").replace(/_/g,"-")}`}>{relationshipLabel}</span></dd></div>
            <div><dt>Website</dt><dd>{website?<a href={website} target="_blank" rel="noreferrer">{client.website}<span aria-hidden="true"> ↗</span></a>:<span className="client-record-muted">Not added</span>}</dd></div>
            <div><dt>Last updated</dt><dd>{client.updated_at?dateText(client.updated_at):"—"}</dd></div>
          </dl>
          <div className="client-record-notes"><h3>Notes</h3>{client.notes?<p>{client.notes}</p>:<p className="client-record-muted">No notes have been added.</p>}</div>
        </section>
        <RecordImages recordType="client" recordId={client.id} onImagesChanged={()=>setAvatarVersion((value)=>value+1)}/>
      </div>

      <section className="record-list-panel client-record-card client-record-projects">
        <header className="client-record-card-heading"><span className="client-record-icon client-record-icon-green"><CrmIcon name="layers"/></span><div><h2>Projects</h2><p>Delivery work linked to this client.</p></div><span className="client-record-count">{projects.length}</span></header>
        {projects.length?<ul className="client-record-project-list">{projects.map((project:any)=><li key={project.id}>
          <span className="client-record-project-icon"><CrmIcon name="layers"/></span>
          <div className="client-record-project-main"><Link to={`/projects/${project.id}`}>{project.name}</Link><span>{client.name}</span></div>
          <div className="client-record-project-meta"><strong>{moneyText(project.agreed_amount,project.currency)}</strong><span className={`client-state client-state-${project.status?.replace(/_/g,"-")||"planned"}`}>{projectStatus[project.status]||project.status||"Planned"}</span></div>
          <button type="button" className="client-project-delete" aria-label={`Delete project ${project.name}`} title="Delete project" onClick={()=>{setProjectDeleteError("");setProjectToDelete(project);}}>Delete</button>
        </li>)}</ul>:<div className="client-record-empty"><span className="client-record-empty-icon"><CrmIcon name="layers"/></span><strong>No projects linked</strong><p>Projects created for this client will appear here.</p><Link className="button button-secondary" to="/projects">View projects</Link></div>}
      </section>
    </div>
    <section className="record-list-panel client-record-card client-record-audit" aria-label="Client audit history">
      <header className="client-record-card-heading"><span className="client-record-icon client-record-icon-purple"><CrmIcon name="activity"/></span><div><h2>Audit history</h2><p>Recorded changes for this client and its linked inquiries and projects.</p></div><span className="client-record-count">{auditHistory?.length??0}</span></header>
      {auditHistoryError?<ErrorBox>Audit history could not be loaded.</ErrorBox>:auditHistory===null?<p className="client-record-audit-state" role="status">Loading audit history…</p>:auditHistory.length?<ol className="client-record-audit-list">{auditHistory.map((item:any)=>{
        const entity=item.subject_type==="clients"?"Client":item.subject_type==="projects"?"Project":item.subject_type==="leads"?"Lead":"Record";
        const verb=item.action==="insert"?"created":item.action==="delete"?"deleted":item.action==="stage_changed"?"stage changed":item.action.replace(/_/g," ");
        const subjectName=item.subject_type==="clients"?client.name:item.subject_type==="projects"?projects.find((project:any)=>project.id===item.subject_id)?.name:item.subject_type==="leads"?"Linked inquiry":"";
        return <li key={item.id}><span aria-hidden="true"><CrmIcon name="activity"/></span><div><strong>{entity} {verb}</strong>{subjectName&&<small>{subjectName}</small>}<time dateTime={item.occurred_at}>{new Date(item.occurred_at).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"})}</time></div></li>;
      })}</ol>:<p className="client-record-audit-state">No audit events have been recorded for this client yet.</p>}
    </section>
    {projectToDelete&&<DeleteRecordModal recordType="project" recordName={projectToDelete.name} busy={projectDeleteBusy} error={projectDeleteError} onClose={()=>{if(!projectDeleteBusy)setProjectToDelete(null);}} onConfirm={()=>void confirmClientProjectDelete()}/>}
  </div>;
}
