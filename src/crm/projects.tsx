import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { db, projectStatus, dateText, moneyText, isPhoneLikeContactName, useAuth, useToast, PageHeader, Loading, ErrorBox, Metric, Modal, StageDropdown, DeleteRecordModal } from "./shared";
import { RecordAvatar } from "./images";
import { DatePicker } from "./components";
import { recordPath } from "./record-links";

const projectTaskStatuses=[{value:"open",label:"Planned"},{value:"in_progress",label:"In progress"},{value:"completed",label:"Complete"}];

function ProjectTaskStatusSelect({taskTitle,value,disabled,onChange}:{taskTitle:string;value:string;disabled:boolean;onChange:(value:string)=>void}){
  const [isOpen,setIsOpen]=useState(false);
  const rootRef=useRef<HTMLDivElement>(null);
  const optionRefs=useRef<Array<HTMLButtonElement|null>>([]);
  const selectedIndex=Math.max(0,projectTaskStatuses.findIndex((status)=>status.value===value));
  const selected=projectTaskStatuses[selectedIndex];
  useEffect(()=>{
    if(!isOpen)return;
    const closeOnOutside=(event:PointerEvent)=>{if(!rootRef.current?.contains(event.target as Node))setIsOpen(false);};
    document.addEventListener("pointerdown",closeOnOutside);
    optionRefs.current[selectedIndex]?.focus();
    return()=>document.removeEventListener("pointerdown",closeOnOutside);
  },[isOpen,selectedIndex]);
  function onOptionKeyDown(event:ReactKeyboardEvent<HTMLButtonElement>,index:number){
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){
      event.preventDefault();
      const delta=event.key==="ArrowDown"?1:-1;
      optionRefs.current[(index+delta+projectTaskStatuses.length)%projectTaskStatuses.length]?.focus();
    }else if(event.key==="Home"||event.key==="End"){
      event.preventDefault();optionRefs.current[event.key==="Home"?0:projectTaskStatuses.length-1]?.focus();
    }else if(event.key==="Escape"){
      event.preventDefault();setIsOpen(false);rootRef.current?.querySelector<HTMLButtonElement>(".project-task-status-trigger")?.focus();
    }
  }
  return <div className="project-task-status-select" ref={rootRef}>
    <button type="button" className="project-task-status-trigger" aria-label={`Status for ${taskTitle}`} aria-haspopup="listbox" aria-expanded={isOpen} disabled={disabled} onClick={()=>setIsOpen((open)=>!open)} onKeyDown={(event)=>{if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();setIsOpen(true);}}}>
      <span>{selected.label}</span><span className="project-task-status-chevron" aria-hidden="true"/>
    </button>
    {isOpen&&<div className="project-task-status-options" role="listbox" aria-label={`Status for ${taskTitle}`}>
      {projectTaskStatuses.map((status,index)=><button key={status.value} ref={(element)=>{optionRefs.current[index]=element;}} type="button" role="option" aria-selected={status.value===value} className={status.value===value?"is-selected":""} onKeyDown={(event)=>onOptionKeyDown(event,index)} onClick={()=>{setIsOpen(false);onChange(status.value);}}>{status.label}</button>)}
    </div>}
  </div>;
}

export function Projects(){
  const {founder}=useAuth();
  const notify=useToast();
  const [newProjectOpen,setNewProjectOpen]=useState(false);
  const [rows,setRows]=useState<any[]|null>(null);
  const [clients,setClients]=useState<Record<string,string>>({});
  const [loadError,setLoadError]=useState("");
  const [selectedId,setSelectedId]=useState("");
  const [drawerTab,setDrawerTab]=useState<"overview"|"tasks"|"payments">(()=>typeof window!=="undefined"&&window.location.hash==="#project-tasks"?"tasks":typeof window!=="undefined"&&window.location.hash==="#project-payments"?"payments":"overview");
  const [details,setDetails]=useState<any>(null);
  const [detailsError,setDetailsError]=useState("");
  const [taskBusyId,setTaskBusyId]=useState("");
  const [editingProject,setEditingProject]=useState<any>(null);
  const [editProjectError,setEditProjectError]=useState("");
  const [editProjectBusy,setEditProjectBusy]=useState(false);
  const [projectToDelete,setProjectToDelete]=useState<any>(null);
  const [deleteProjectBusy,setDeleteProjectBusy]=useState(false);
  const [deleteProjectError,setDeleteProjectError]=useState("");
  const [filter,setFilter]=useState("all");
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState("updated");
  const [page,setPage]=useState(1);
  const pageSize=10;
  const load=useCallback(async()=>{
    setLoadError("");
    const {data,error}=await db().from("projects").select("id,name,status,agreed_amount,currency,start_date,target_date,client_id,lead_id,accepted_proposal_id,updated_at").eq("workspace_id",founder!.workspaceId).is("archived_at",null).order("updated_at",{ascending:false});
    if(error){setLoadError(error.message);setRows([]);return;}
    const projects=data??[];
    setRows(projects);
    setSelectedId(current=>projects.some(project=>project.id===current)?current:"");
    const clientIds=[...new Set(projects.map(project=>project.client_id).filter(Boolean))];
    if(clientIds.length){const clientsResult=await db().from("clients").select("id,name").eq("workspace_id",founder!.workspaceId).in("id",clientIds);setClients(Object.fromEntries((clientsResult.data??[]).map((client:any)=>[client.id,client.name])));}
    else setClients({});
  },[founder]);
  useEffect(()=>{void load();const refreshFromAssistant=()=>void load();window.addEventListener("strataforge:crm-data-changed",refreshFromAssistant);return()=>window.removeEventListener("strataforge:crm-data-changed",refreshFromAssistant);},[load]);
  useEffect(()=>{
    if(!selectedId||!founder)return;
    let active=true;
    setDetails(null);setDetailsError("");
    void Promise.all([
      db().from("tasks").select("id,title,status,due_at,assignee_user_id").eq("project_id",selectedId).eq("workspace_id",founder.workspaceId).is("archived_at",null).neq("status","cancelled").order("due_at",{ascending:true,nullsFirst:false}),
      db().from("payment_entries").select("id,payment_kind,amount,currency,received_at,reference").eq("project_id",selectedId).eq("workspace_id",founder.workspaceId).order("received_at",{ascending:false}),
      db().from("proposals").select("id,scope_summary").eq("id",rows?.find(project=>project.id===selectedId)?.accepted_proposal_id??"").maybeSingle(),
    ]).then(([tasks,payments,proposal])=>{
      if(!active)return;
      const optionalErrors=[tasks.error,payments.error,proposal.error].filter(Boolean);
      setDetailsError(optionalErrors.map((item:any)=>item.message).join(" "));
      setDetails({tasks:tasks.data??[],payments:payments.data??[],proposal:proposal.data});
    });
    return()=>{active=false;};
  },[selectedId,founder,rows]);
  async function setDrawerTaskStatus(task:any,status:string){
    if(!founder||taskBusyId)return;
    setTaskBusyId(task.id);
    if(!task.assignee_user_id){
      const {error:claimError}=await db().rpc("claim_project_delivery_task",{p_task_id:task.id});
      if(claimError){setTaskBusyId("");notify("Could not assign this task to you.",true);return;}
    }
    const {error:statusError}=await db().rpc("set_project_delivery_task_status",{p_task_id:task.id,p_status:status});
    setTaskBusyId("");
    if(statusError){notify("Could not update this task. Check its assignment and try again.",true);return;}
    setDetails((current:any)=>current?{...current,tasks:current.tasks.map((item:any)=>item.id===task.id?{...item,status,assignee_user_id:item.assignee_user_id??founder.userId}:item)}:current);
  }
  async function saveProject(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!founder||!editingProject||editProjectBusy)return;
    const form=new FormData(event.currentTarget);
    const name=String(form.get("name")??"").trim();
    const startDate=String(form.get("start_date")??"")||null;
    const targetDate=String(form.get("target_date")??"")||null;
    if(!name){setEditProjectError("Enter a project name.");return;}
    if(startDate&&targetDate&&targetDate<startDate){setEditProjectError("Target date must be on or after the start date.");return;}
    setEditProjectBusy(true);setEditProjectError("");
    const {data:updated,error}=await db().from("projects").update({name,start_date:startDate,target_date:targetDate}).eq("id",editingProject.id).eq("workspace_id",founder.workspaceId).eq("updated_at",editingProject.updated_at).select("id").maybeSingle();
    setEditProjectBusy(false);
    if(error||!updated){setEditProjectError(error?.message??"This project changed while the editor was open. Close it and review the latest values.");return;}
    setEditingProject(null);notify("Project updated.");await load();
  }
  async function confirmProjectDelete(){
    if(!founder||!projectToDelete||deleteProjectBusy)return;
    setDeleteProjectBusy(true);setDeleteProjectError("");
    const {data,error}=await db().from("projects").update({archived_at:new Date().toISOString()}).eq("id",projectToDelete.id).eq("workspace_id",founder.workspaceId).is("archived_at",null).select("id").maybeSingle();
    setDeleteProjectBusy(false);
    if(error||!data){setDeleteProjectError(error?.message??"This project changed or is no longer available. Refresh and try again.");return;}
    setProjectToDelete(null);notify("Project deleted.");setSelectedId("");await load();
  }
  function selectDrawerTab(tab:"overview"|"tasks"|"payments"){
    setDrawerTab(tab);
    const url=new URL(window.location.href);
    url.hash=tab==="overview"?"project-overview":`project-${tab}`;
    window.history.replaceState(window.history.state,"",`${url.pathname}${url.search}${url.hash}`);
  }
  const allRows=rows??[];
  const counts={all:allRows.length,in_progress:allRows.filter(item=>item.status==="in_progress").length,completed:allRows.filter(item=>item.status==="completed").length,on_hold:allRows.filter(item=>item.status==="on_hold").length,cancelled:allRows.filter(item=>item.status==="cancelled").length,planned:allRows.filter(item=>item.status==="planned").length};
  const visible=allRows.filter(item=>(filter==="all"||item.status===filter)&&`${item.name} ${clients[item.client_id]??""}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>sort==="name"?a.name.localeCompare(b.name):sort==="target"?(a.target_date??"9999").localeCompare(b.target_date??"9999"):0);
  const pageCount=Math.max(1,Math.ceil(visible.length/pageSize));
  const paged=visible.slice((page-1)*pageSize,page*pageSize);
  const selected=allRows.find(item=>item.id===selectedId);
  useEffect(()=>{setPage(1);},[filter,query,sort]);
  useEffect(()=>{
    if(!selected)return;
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape")setSelectedId("");};
    window.addEventListener("keydown",onKeyDown);
    return()=>window.removeEventListener("keydown",onKeyDown);
  },[selected?.id]);
  return <>
    <PageHeader eyebrow="Delivery workspace" title="Projects" description="Manage client projects from accepted proposal through delivery." action={<button type="button" className="button button-primary" onClick={()=>setNewProjectOpen(true)}>＋ New project</button>}/>
    <section className="dashboard-metrics projects-overview-metrics">
      <Metric label="Total projects" value={counts.all} hint="Confirmed client work" icon="▱"/>
      <Metric label="In progress" value={counts.in_progress} hint="Currently in delivery" tone="blue" icon="↗"/>
      <Metric label="Completed" value={counts.completed} hint="Finished projects" tone="green" icon="✓"/>
      <Metric label="On hold" value={counts.on_hold} hint="Paused delivery" tone="purple" icon="▤"/>
    </section>
    <div className="project-filter-row" role="group" aria-label="Filter projects by status">
      {[ ["all","All projects"], ["planned","Planned"], ["in_progress","In progress"], ["completed","Completed"], ["on_hold","On hold"], ["cancelled","Cancelled"] ].map(([value,label])=><button key={value} type="button" className={`project-filter-chip ${filter===value?"is-active":""}`} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}<strong>{counts[value as keyof typeof counts]}</strong></button>)}
    </div>
    {loadError&&<div className="projects-error"><ErrorBox>{loadError}</ErrorBox><button className="button button-secondary" onClick={()=>void load()}>Retry</button></div>}
    <div className={`projects-workspace ${selected?"has-selection":""}`}>
      <section className="record-list-panel project-list-panel">
        <div className="projects-list-toolbar"><div className="projects-list-heading"><h2>Project directory</h2><p>{rows===null?"Loading projects…":`${visible.length} ${visible.length===1?"project":"projects"}`}</p></div><div className="projects-list-controls"><label className="projects-search"><span>Search projects</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Project or client name…"/></label><div className="projects-sort"><span>Sort by</span><StageDropdown value={sort} options={["updated","name","target"]} disabled={false} label="Sort projects" optionLabels={{updated:"Recently updated",name:"Name A–Z",target:"Target date"}} onChange={setSort} className="projects-sort-dropdown" minMenuWidth={180}/></div></div></div>
        {rows===null?<Loading label="Loading projects…"/>:loadError?<div className="empty-state projects-empty-state"><h3>Projects couldn’t load</h3><p>Retry to load the project directory.</p><button className="button button-secondary" onClick={()=>void load()}>Retry</button></div>:visible.length?<><div className="projects-table-scroll"><table className="projects-table"><thead><tr><th>Project</th><th>Client</th><th>Type</th><th>Start date</th><th>Target date</th><th>Agreed value</th><th>Status</th><th>Open</th></tr></thead><tbody>{paged.map(project=><tr key={project.id} className={project.id===selectedId?"is-selected":""} onClick={()=>setSelectedId(project.id)}><td><button className="project-table-name" type="button" onClick={()=>setSelectedId(project.id)}><RecordAvatar recordType="project" recordId={project.id} name={project.name} className="project-table-avatar" fallbackClientId={project.client_id ?? ""} fallbackLeadIds={project.lead_id ? [project.lead_id] : []}/><span><strong>{project.name}</strong><small>{projectStatus[project.status]??project.status}</small></span></button></td><td>{clients[project.client_id]??"Client not linked"}</td><td>Website</td><td>{dateText(project.start_date)}</td><td>{dateText(project.target_date)}</td><td>{moneyText(project.agreed_amount,project.currency)}</td><td><span className={`project-state-badge project-state-${project.status}`}>{projectStatus[project.status]??project.status}</span></td><td><Link className="project-row-open" to={recordPath("project", project.id)} onClick={event=>event.stopPropagation()}>Open →</Link></td></tr>)}</tbody></table></div><div className="projects-pagination"><span>{visible.length?`${(page-1)*pageSize+1}–${Math.min(page*pageSize,visible.length)} of ${visible.length}`:"0 projects"}</span><nav aria-label="Project pages"><button type="button" disabled={page<=1} onClick={()=>setPage(value=>Math.max(1,value-1))} aria-label="Previous page">‹</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page>=pageCount} onClick={()=>setPage(value=>Math.min(pageCount,value+1))} aria-label="Next page">›</button></nav></div></>:<div className="empty-state projects-empty-state"><h3>{allRows.length?"No matching projects":"No projects yet"}</h3><p>{allRows.length?"Try another search or status filter.":"Projects appear here after a lead has an accepted proposal and a recorded deposit."}</p>{!allRows.length&&<Link to="/leads">Review leads →</Link>}</div>}
      </section>
      {selected&&<div className="project-drawer-layer"><button className="project-drawer-backdrop" type="button" aria-label="Close project details" onClick={()=>setSelectedId("")}/><aside className="project-quick-panel project-drawer" role="dialog" aria-modal="true" aria-label={`${selected.name} project details`}>
        <header className="project-quick-head"><RecordAvatar recordType="project" recordId={selected.id} name={selected.name} className="project-quick-avatar" fallbackClientId={selected.client_id ?? ""} fallbackLeadIds={selected.lead_id ? [selected.lead_id] : []}/><div><h2>{selected.name}</h2><p>{clients[selected.client_id]??"Client not linked"}</p></div><span className={`project-state-badge project-state-${selected.status}`}>{projectStatus[selected.status]??selected.status}</span><button type="button" className="project-drawer-close" aria-label="Close project details" onClick={()=>setSelectedId("")}>×</button></header>
        <nav className="project-panel-tabs" aria-label="Project detail sections"><button type="button" className={drawerTab==="overview"?"is-active":""} aria-current={drawerTab==="overview"?"page":undefined} onClick={()=>selectDrawerTab("overview")}>Overview</button><button type="button" className={drawerTab==="tasks"?"is-active":""} aria-current={drawerTab==="tasks"?"page":undefined} onClick={()=>selectDrawerTab("tasks")}>Tasks ({details?.tasks.length??0})</button><button type="button" className={drawerTab==="payments"?"is-active":""} aria-current={drawerTab==="payments"?"page":undefined} onClick={()=>selectDrawerTab("payments")}>Payments ({details?.payments.length??0})</button></nav>
        <div className="project-panel-body">
          {detailsError&&<div className="projects-error"><ErrorBox>{detailsError}</ErrorBox></div>}
          {drawerTab==="overview"&&<><section className="project-panel-section" id="project-overview"><h3>Project information</h3><dl className="project-info-list"><div><dt>Client</dt><dd>{clients[selected.client_id]??"Client not linked"}</dd></div><div><dt>Project type</dt><dd>Website</dd></div><div><dt>Status</dt><dd>{projectStatus[selected.status]??selected.status}</dd></div><div><dt>Start date</dt><dd>{dateText(selected.start_date)}</dd></div><div><dt>Target date</dt><dd>{dateText(selected.target_date)}</dd></div><div><dt>Agreed value</dt><dd>{moneyText(selected.agreed_amount,selected.currency)}</dd></div></dl><div className="project-payment-progress"><div><span>Paid to date</span><strong>{details?moneyText(details.payments.reduce((sum:number,payment:any)=>sum+Number(payment.amount||0),0),selected.currency):"Loading…"}</strong></div><p className="project-panel-muted">Payment records show receipts; delivery progress is tracked separately by project status and tasks.</p></div></section><section className="project-panel-section"><h3>Accepted scope</h3><p className="project-panel-muted">{details?.proposal?.scope_summary||"No accepted scope summary is available."}</p></section></>}
          {drawerTab==="tasks"&&<section className="project-panel-section project-drawer-tasks" id="project-tasks"><div className="project-drawer-tasks-heading"><div><h3>The work ahead</h3><p>{details?`${details.tasks.filter((task:any)=>task.status==="completed").length} of ${details.tasks.length} tasks complete · ${details.tasks.length?Math.round(details.tasks.filter((task:any)=>task.status==="completed").length/details.tasks.length*100):0}%`:"Loading task progress…"}</p></div><Link className="button button-secondary" to={`/team/tasks?project=${encodeURIComponent(selected.id)}`}>＋ Add task</Link></div>{details?details.tasks.length?<><div className="project-task-progress-track"><span style={{width:`${details.tasks.length?details.tasks.filter((task:any)=>task.status==="completed").length/details.tasks.length*100:0}%`}}/></div><ul className="project-work-ahead-list">{details.tasks.map((task:any)=>{const canManage=!task.assignee_user_id||task.assignee_user_id===founder?.userId||founder?.role==="admin";return <li key={task.id} className={task.status==="completed"?"is-complete":""}><label className="project-work-ahead-check"><input type="checkbox" checked={task.status==="completed"} disabled={!canManage||task.status==="cancelled"||taskBusyId===task.id} onChange={()=>void setDrawerTaskStatus(task,task.status==="completed"?"open":"completed")}/><span aria-hidden="true"/></label><div className="project-work-ahead-copy"><strong>{task.title}</strong><small>{task.assignee_user_id===founder?.userId?"Assigned to you":task.assignee_user_id?"Assigned":"Unassigned"} · {task.status==="completed"?"Complete":task.status==="in_progress"?"In progress":"Planned"}</small></div><time>{task.due_at?dateText(task.due_at):"No date"}</time><ProjectTaskStatusSelect taskTitle={task.title} value={task.status} disabled={!canManage||task.status==="cancelled"||taskBusyId===task.id} onChange={(status)=>void setDrawerTaskStatus(task,status)}/></li>})}</ul></>:<div className="project-work-ahead-empty"><p>No tasks yet.</p><Link to={`/team/tasks?project=${encodeURIComponent(selected.id)}`}>Add the first task →</Link></div>:<Loading label="Loading tasks…"/>}</section>}
          {drawerTab==="payments"&&<section className="project-panel-section" id="project-payments"><div className="project-panel-section-heading"><h3>Recent payments</h3><Link to={recordPath("project", selected.id)}>View all</Link></div>{details?details.payments.length?<ul className="project-detail-list">{details.payments.slice(0,3).map((payment:any)=><li key={payment.id}><div><strong>{payment.payment_kind==="deposit"?"Deposit received":"Progress payment"}</strong><small>{dateText(payment.received_at)}{payment.reference?` · ${payment.reference}`:""}</small></div><strong>{moneyText(payment.amount,payment.currency||selected.currency)}</strong></li>)}</ul>:<p className="project-panel-muted">No payments recorded yet.</p>:<Loading label="Loading payments…"/>}</section>}
        </div>
        <footer className="project-panel-footer"><button type="button" className="button button-secondary project-panel-action" onClick={()=>{setEditProjectError("");setEditingProject(selected);}}>Edit project</button><button type="button" className="button button-danger project-panel-action" onClick={()=>{setDeleteProjectError("");setProjectToDelete(selected);}}>Delete project</button><Link className="button button-primary project-panel-action" to={recordPath("project", selected.id)}>Open full project →</Link></footer>
      </aside></div>}
    </div>
    {editingProject&&<Modal title="Edit project" description="Update the project name and delivery dates." onClose={()=>{if(!editProjectBusy)setEditingProject(null);}} className="project-edit-dialog"><form className="record-form" onSubmit={(event)=>void saveProject(event)}><label className="field"><span>Project name *</span><input name="name" required maxLength={180} defaultValue={editingProject.name}/></label><div className="form-grid"><div className="field"><span>Start date</span><DatePicker name="start_date" defaultValue={editingProject.start_date??""} label="Project start date"/></div><div className="field"><span>Target date</span><DatePicker name="target_date" defaultValue={editingProject.target_date??""} label="Project target date"/></div></div>{editProjectError&&<ErrorBox>{editProjectError}</ErrorBox>}<p className="project-edit-note">Agreed value stays tied to the accepted proposal.</p><div className="form-actions"><button type="button" className="button button-secondary" disabled={editProjectBusy} onClick={()=>setEditingProject(null)}>Cancel</button><button className="button button-primary" disabled={editProjectBusy}>{editProjectBusy?"Saving…":"Save changes"}</button></div></form></Modal>}
    {projectToDelete&&<DeleteRecordModal recordType="project" recordName={projectToDelete.name} busy={deleteProjectBusy} error={deleteProjectError} onClose={()=>{if(!deleteProjectBusy)setProjectToDelete(null);}} onConfirm={()=>void confirmProjectDelete()}/>}
    {newProjectOpen&&<NewProjectModal founder={founder} onClose={()=>setNewProjectOpen(false)} onCreated={async(projectId)=>{setNewProjectOpen(false);await load();selectDrawerTab("overview");setSelectedId(projectId);}}/>}
  </>;
}

function NewProjectModal({founder,onClose,onCreated}:{founder:any;onClose:()=>void;onCreated:(projectId:string)=>void|Promise<void>}){
  const notify=useToast();
  const [clients,setClients]=useState<any[]|null>(null);
  const [clientId,setClientId]=useState("");
  const [clientInfo,setClientInfo]=useState<any>(null);
  const [eligibleAgreements,setEligibleAgreements]=useState<any[]>([]);
  const [proposalId,setProposalId]=useState("");
  const [projectName,setProjectName]=useState("");
  const [clientLoading,setClientLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [clientLoadError,setClientLoadError]=useState("");
  useEffect(()=>{
    if(!founder)return;
    let active=true;
    void db().from("clients").select("id,name,client_type,website,notes").eq("workspace_id",founder.workspaceId).is("archived_at",null).order("name").then(({data,error:loadError})=>{
      if(!active)return;
      if(loadError){setClientLoadError(loadError.message);setClients([]);return;}
      setClients(data??[]);
    });
    return()=>{active=false;};
  },[founder]);
  const agreementOptions=eligibleAgreements.map(item=>item.proposal.id);
  const agreementLabels=Object.fromEntries(eligibleAgreements.map(item=>[item.proposal.id,`${item.lead.company_name} · Version ${item.proposal.version}`]));
  const selectedAgreement=eligibleAgreements.find(item=>item.proposal.id===proposalId);
  async function selectClient(nextClientId:string){
    setClientId(nextClientId);setClientInfo(null);setEligibleAgreements([]);setProposalId("");setProjectName("");setError("");
    if(!nextClientId||!founder)return;
    const client=clients?.find(item=>item.id===nextClientId);
    if(!client)return;
    setClientInfo({client,primaryContact:null});setClientLoading(true);
    const [contactsResult,leadsResult]=await Promise.all([
      db().from("contacts").select("full_name,title,email,phone,is_primary,updated_at").eq("workspace_id",founder.workspaceId).eq("client_id",nextClientId).is("archived_at",null).order("is_primary",{ascending:false}).order("updated_at",{ascending:false}),
      db().from("leads").select("id,company_name,contact_name,email,phone,updated_at,client_id,client_link_id,stage,project_type").eq("workspace_id",founder.workspaceId).order("updated_at",{ascending:false}),
    ]);
    if(contactsResult.error||leadsResult.error){setClientLoading(false);setError(contactsResult.error?.message??leadsResult.error?.message??"Client details couldn’t be loaded.");return;}
    const contacts=(contactsResult.data??[]).map((contact:any)=>isPhoneLikeContactName(contact.full_name)?{...contact,full_name:client.name}:contact);
    const workspaceLeads=leadsResult.data??[];
    const explicitlyLinkedLeads=workspaceLeads.filter((lead:any)=>lead.client_id===nextClientId||lead.client_link_id===nextClientId);
    const normalizedClientName=String(client.name??"").trim().toLocaleLowerCase();
    const nameMatchedLeads=normalizedClientName?workspaceLeads.filter((lead:any)=>String(lead.company_name??"").trim().toLocaleLowerCase()===normalizedClientName):[];
    const contactCandidates=[...new Map([...explicitlyLinkedLeads,...nameMatchedLeads].map((lead:any)=>[lead.id,lead])).values()];
    const linkedLead=[...contactCandidates].sort((a:any,b:any)=>{
      const score=(lead:any)=>Number(Boolean(String(lead.email??"").trim()))*4+Number(Boolean(String(lead.phone??"").trim()))*4+Number(Boolean(String(lead.contact_name??"").trim()&&!isPhoneLikeContactName(String(lead.contact_name??""))))*2;
      return score(b)-score(a)||new Date(b.updated_at??0).getTime()-new Date(a.updated_at??0).getTime();
    })[0];
    const leadContact=linkedLead?{full_name:!linkedLead.contact_name||isPhoneLikeContactName(linkedLead.contact_name)?client.name:linkedLead.contact_name,title:"From linked inquiry",email:linkedLead.email,phone:linkedLead.phone}:null;
    const matchingContact=leadContact&&contacts.find((contact:any)=>(leadContact.email&&contact.email?.toLocaleLowerCase()===leadContact.email.toLocaleLowerCase())||(leadContact.phone&&contact.phone===leadContact.phone));
    const savedContact=matchingContact??contacts.find((contact:any)=>contact.is_primary&&(contact.email||contact.phone))??contacts.find((contact:any)=>contact.email||contact.phone)??contacts.find((contact:any)=>contact.is_primary)??contacts[0]??null;
    const primaryContact=leadContact&&savedContact?{...leadContact,...savedContact,full_name:savedContact.full_name||leadContact.full_name,email:savedContact.email||leadContact.email,phone:savedContact.phone||leadContact.phone,title:savedContact.title||leadContact.title}:savedContact??leadContact;
    setClientInfo({client,primaryContact});
    const leads=explicitlyLinkedLeads.filter((lead:any)=>lead.stage==="accepted_awaiting_deposit");
    if(!leads.length){setClientLoading(false);return;}
    const leadIds=leads.map((lead:any)=>lead.id);
    const [proposalsResult,projectsResult]=await Promise.all([
      db().from("proposals").select("id,lead_id,version,scope_summary,amount,currency").eq("workspace_id",founder.workspaceId).in("lead_id",leadIds).eq("status","accepted").order("version",{ascending:false}),
      db().from("projects").select("lead_id").eq("workspace_id",founder.workspaceId).in("lead_id",leadIds),
    ]);
    if(proposalsResult.error||projectsResult.error){setClientLoading(false);setError(proposalsResult.error?.message??projectsResult.error?.message??"Eligible proposals couldn’t be loaded.");return;}
    const projectLeadIds=new Set((projectsResult.data??[]).map((project:any)=>project.lead_id));
    const proposals=(proposalsResult.data??[]).filter((proposal:any)=>!projectLeadIds.has(proposal.lead_id));
    if(!proposals.length){setClientLoading(false);return;}
    const depositsResult=await db().from("payment_entries").select("proposal_id,amount,received_at").eq("workspace_id",founder.workspaceId).in("proposal_id",proposals.map((proposal:any)=>proposal.id)).eq("payment_kind","deposit").is("project_id",null);
    setClientLoading(false);
    if(depositsResult.error){setError(depositsResult.error.message);return;}
    const leadById=new Map(leads.map((lead:any)=>[lead.id,lead]));
    const depositsByProposal=new Map((depositsResult.data??[]).map((deposit:any)=>[deposit.proposal_id,deposit]));
    const ready=proposals.filter((proposal:any)=>depositsByProposal.has(proposal.id)).map((proposal:any)=>({proposal,lead:leadById.get(proposal.lead_id),deposit:depositsByProposal.get(proposal.id)}));
    setEligibleAgreements(ready);
    if(ready.length){setProposalId(ready[0].proposal.id);setProjectName(`${client.name} ${ready[0].lead?.project_type||"Website"}`);}
  }
  function selectAgreement(nextProposalId:string){
    setProposalId(nextProposalId);
    const match=eligibleAgreements.find(item=>item.proposal.id===nextProposalId);
    if(match)setProjectName(`${clientInfo?.client.name??match.lead.company_name} ${match.lead?.project_type||"Website"}`);
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!founder||!clientInfo||!selectedAgreement||busy)return;
    const form=new FormData(event.currentTarget);
    const name=projectName.trim();
    const startDate=String(form.get("start_date")||"")||null;
    const targetDate=String(form.get("target_date")||"")||null;
    if(!name){setError("Enter a project name.");return;}
    if(startDate&&targetDate&&targetDate<startDate){setError("Target date must be on or after the start date.");return;}
    setBusy(true);setError("");
    const {data:newProject,error:createError}=await db().from("projects").insert({workspace_id:founder.workspaceId,lead_id:selectedAgreement.lead.id,client_id:clientInfo.client.id,accepted_proposal_id:selectedAgreement.proposal.id,name,agreed_amount:selectedAgreement.proposal.amount,currency:selectedAgreement.proposal.currency,status:"planned",start_date:startDate||null,target_date:targetDate||null,owner_user_id:founder.userId,created_by:founder.userId}).select("id").single();
    setBusy(false);
    if(createError||!newProject){setError(createError?.message??"Project couldn’t be created.");return;}
    notify("Project created.");await onCreated(newProject.id);
  }
  const selectedClient=clientInfo?.client;
  return <Modal title="New project" description="Choose an existing client and approved work to set up a project." onClose={()=>{if(!busy)onClose();}} className="new-project-dialog">
    <form className="record-form new-project-form" onSubmit={(event)=>void submit(event)}>
      <div className="field"><span>Existing client *</span>{clients===null?<Loading label="Loading clients…"/>:clientLoadError?<ErrorBox>{clientLoadError}</ErrorBox>:clients.length?<StageDropdown value={clientId} options={["",...clients.map(client=>client.id)]} disabled={busy||clientLoading} label="Existing client" optionLabels={{"":"Choose a client",...Object.fromEntries(clients.map(client=>[client.id,client.name]))}} onChange={selectClient} className="new-project-client-dropdown" minMenuWidth={320}/>:<p className="new-project-empty">No clients yet. Create a client by converting an eligible lead first.</p>}</div>
      {selectedClient&&<>
        <section className="new-project-client-summary" aria-label="Selected client details"><div className="new-project-client-heading"><RecordAvatar recordType="client" recordId={selectedClient.id} name={selectedClient.name} className="new-project-client-avatar"/><div><h3>{selectedClient.name}</h3><p>{selectedClient.client_type==="person"?"Individual":"Organization"}</p></div></div><dl><div><dt>Primary contact</dt><dd>{clientLoading?"Loading…":clientInfo.primaryContact?.full_name||"Not recorded"}{!clientLoading&&clientInfo.primaryContact?.title?` · ${clientInfo.primaryContact.title}`:""}</dd></div><div><dt>Email</dt><dd>{clientLoading?"Loading…":clientInfo.primaryContact?.email||"Not recorded"}</dd></div><div><dt>Phone</dt><dd>{clientLoading?"Loading…":clientInfo.primaryContact?.phone||"Not recorded"}</dd></div><div><dt>Website</dt><dd>{selectedClient.website||"Not added"}</dd></div></dl>{selectedClient.notes&&<p className="new-project-client-notes">{selectedClient.notes}</p>}</section>
        {clientLoading?<Loading label="Checking approved proposals and deposits…"/>:eligibleAgreements.length?<>
          <div className="field"><span>Accepted proposal with deposit *</span><StageDropdown value={proposalId} options={agreementOptions} disabled={busy} label="Accepted proposal with deposit" optionLabels={agreementLabels} onChange={selectAgreement} className="new-project-client-dropdown" minMenuWidth={320}/></div>
          {selectedAgreement&&<>
            <section className="new-project-agreement-summary" aria-label="Accepted agreement details"><div><span>Agreed value</span><strong>{moneyText(selectedAgreement.proposal.amount,selectedAgreement.proposal.currency)}</strong></div><p>{selectedAgreement.proposal.scope_summary}</p><small>Deposit recorded {dateText(selectedAgreement.deposit.received_at)} · {moneyText(selectedAgreement.deposit.amount,selectedAgreement.proposal.currency)}</small></section>
            <label className="field"><span>Project name *</span><input value={projectName} onChange={event=>setProjectName(event.target.value)} required maxLength={180}/></label>
            <div className="form-grid"><div className="field"><span>Start date</span><DatePicker name="start_date" label="Project start date"/></div><div className="field"><span>Target date</span><DatePicker name="target_date" label="Project target date"/></div></div>
          </>}
        </>:<div className="new-project-no-agreement"><strong>No project-ready proposal for this client</strong><p>To start another project, create a new inquiry, record its accepted proposal and deposit, then choose this client during project conversion.</p><Link to="/leads" onClick={onClose}>Create or review an inquiry →</Link></div>}
      </>}
      {error&&<ErrorBox>{error}</ErrorBox>}
      <div className="form-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>Cancel</button>{selectedAgreement&&<button className="button button-primary" disabled={busy||clientLoading}>{busy?"Creating project…":"Create project"}</button>}</div>
    </form>
  </Modal>;
}
