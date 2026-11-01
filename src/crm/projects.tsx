import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db, projectStatus, dateText, moneyText, useAuth, PageHeader, Loading, ErrorBox, Metric } from "./shared";

export function Projects(){
  const {founder}=useAuth();
  const [rows,setRows]=useState<any[]|null>(null);
  const [clients,setClients]=useState<Record<string,string>>({});
  const [loadError,setLoadError]=useState("");
  const [selectedId,setSelectedId]=useState("");
  const [details,setDetails]=useState<any>(null);
  const [detailsError,setDetailsError]=useState("");
  const [filter,setFilter]=useState("all");
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState("updated");
  const [page,setPage]=useState(1);
  const pageSize=10;
  const load=useCallback(async()=>{
    setLoadError("");
    const {data,error}=await db().from("projects").select("id,name,status,agreed_amount,currency,start_date,target_date,client_id,lead_id,accepted_proposal_id").eq("workspace_id",founder!.workspaceId).is("archived_at",null).order("updated_at",{ascending:false});
    if(error){setLoadError(error.message);setRows([]);return;}
    const projects=data??[];
    setRows(projects);
    setSelectedId(current=>projects.some(project=>project.id===current)?current:projects[0]?.id??"");
    const clientIds=[...new Set(projects.map(project=>project.client_id).filter(Boolean))];
    if(clientIds.length){const clientsResult=await db().from("clients").select("id,name").eq("workspace_id",founder!.workspaceId).in("id",clientIds);setClients(Object.fromEntries((clientsResult.data??[]).map((client:any)=>[client.id,client.name])));}
    else setClients({});
  },[founder]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    if(!selectedId||!founder)return;
    let active=true;
    setDetails(null);setDetailsError("");
    void Promise.all([
      db().from("tasks").select("id,title,status,due_at").eq("project_id",selectedId).eq("workspace_id",founder.workspaceId).is("archived_at",null).order("due_at",{ascending:true,nullsFirst:false}),
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
  const allRows=rows??[];
  const counts={all:allRows.length,in_progress:allRows.filter(item=>item.status==="in_progress").length,completed:allRows.filter(item=>item.status==="completed").length,on_hold:allRows.filter(item=>item.status==="on_hold").length,cancelled:allRows.filter(item=>item.status==="cancelled").length,planned:allRows.filter(item=>item.status==="planned").length};
  const visible=allRows.filter(item=>(filter==="all"||item.status===filter)&&`${item.name} ${clients[item.client_id]??""}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>sort==="name"?a.name.localeCompare(b.name):sort==="target"?(a.target_date??"9999").localeCompare(b.target_date??"9999"):0);
  const pageCount=Math.max(1,Math.ceil(visible.length/pageSize));
  const paged=visible.slice((page-1)*pageSize,page*pageSize);
  const selected=allRows.find(item=>item.id===selectedId);
  useEffect(()=>{setPage(1);},[filter,query,sort]);
  return <>
    <PageHeader eyebrow="Delivery workspace" title="Projects" description="Manage client projects from accepted proposal through delivery." action={<Link className="button button-primary" to="/leads">＋ New project</Link>}/>
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
        <div className="projects-list-toolbar"><div><h2>Project directory</h2><p>{rows===null?"Loading projects…":`${visible.length} ${visible.length===1?"project":"projects"}`}</p></div><div className="projects-list-controls"><label className="projects-search"><span className="sr-only">Search projects</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search projects or clients…"/></label><label className="projects-sort"><span className="sr-only">Sort projects</span><select value={sort} onChange={event=>setSort(event.target.value)}><option value="updated">Recently updated</option><option value="name">Name A–Z</option><option value="target">Target date</option></select></label></div></div>
        {rows===null?<Loading label="Loading projects…"/>:loadError?<div className="empty-state projects-empty-state"><h3>Projects couldn’t load</h3><p>Retry to load the project directory.</p><button className="button button-secondary" onClick={()=>void load()}>Retry</button></div>:visible.length?<><div className="projects-table-scroll"><table className="projects-table"><thead><tr><th>Project</th><th>Client</th><th>Type</th><th>Start date</th><th>Target date</th><th>Agreed value</th><th>Status</th><th>Open</th></tr></thead><tbody>{paged.map(project=><tr key={project.id} className={project.id===selectedId?"is-selected":""} onClick={()=>setSelectedId(project.id)}><td><button className="project-table-name" type="button" onClick={()=>setSelectedId(project.id)}><span className="project-table-avatar" aria-hidden="true">{project.name.slice(0,2).toUpperCase()}</span><span><strong>{project.name}</strong><small>{projectStatus[project.status]??project.status}</small></span></button></td><td>{clients[project.client_id]??"Client not linked"}</td><td>Website</td><td>{dateText(project.start_date)}</td><td>{dateText(project.target_date)}</td><td>{moneyText(project.agreed_amount,project.currency)}</td><td><span className={`project-state-badge project-state-${project.status}`}>{projectStatus[project.status]??project.status}</span></td><td><Link className="project-row-open" to={`/projects/${project.id}`} onClick={event=>event.stopPropagation()}>Open →</Link></td></tr>)}</tbody></table></div><div className="projects-pagination"><span>{visible.length?`${(page-1)*pageSize+1}–${Math.min(page*pageSize,visible.length)} of ${visible.length}`:"0 projects"}</span><nav aria-label="Project pages"><button type="button" disabled={page<=1} onClick={()=>setPage(value=>Math.max(1,value-1))} aria-label="Previous page">‹</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page>=pageCount} onClick={()=>setPage(value=>Math.min(pageCount,value+1))} aria-label="Next page">›</button></nav></div></>:<div className="empty-state projects-empty-state"><h3>{allRows.length?"No matching projects":"No projects yet"}</h3><p>{allRows.length?"Try another search or status filter.":"Projects appear here after a lead has an accepted proposal and a recorded deposit."}</p>{!allRows.length&&<Link to="/leads">Review leads →</Link>}</div>}
      </section>
      {selected&&<aside className="project-quick-panel" aria-label={`${selected.name} project details`}>
        <header className="project-quick-head"><span className="project-quick-avatar" aria-hidden="true">{selected.name.slice(0,2).toUpperCase()}</span><div><h2>{selected.name}</h2><p>{clients[selected.client_id]??"Client not linked"}</p></div><span className={`project-state-badge project-state-${selected.status}`}>{projectStatus[selected.status]??selected.status}</span></header>
        <nav className="project-panel-tabs" aria-label="Project detail sections"><a href="#project-overview" aria-current="page">Overview</a><a href="#project-tasks">Tasks ({details?.tasks.length??0})</a><a href="#project-payments">Payments ({details?.payments.length??0})</a></nav>
        {detailsError&&<div className="projects-error"><ErrorBox>{detailsError}</ErrorBox></div>}
        <div className="project-panel-body">
          <section className="project-panel-section" id="project-overview"><h3>Project information</h3><dl className="project-info-list"><div><dt>Client</dt><dd>{clients[selected.client_id]??"Client not linked"}</dd></div><div><dt>Project type</dt><dd>Website</dd></div><div><dt>Status</dt><dd>{projectStatus[selected.status]??selected.status}</dd></div><div><dt>Start date</dt><dd>{dateText(selected.start_date)}</dd></div><div><dt>Target date</dt><dd>{dateText(selected.target_date)}</dd></div><div><dt>Agreed value</dt><dd>{moneyText(selected.agreed_amount,selected.currency)}</dd></div></dl><div className="project-payment-progress"><div><span>Paid to date</span><strong>{details?moneyText(details.payments.reduce((sum:number,payment:any)=>sum+Number(payment.amount||0),0),selected.currency):"Loading…"}</strong></div><p className="project-panel-muted">Payment records show receipts; delivery progress is tracked separately by project status and tasks.</p></div></section>
          <section className="project-panel-section"><h3>Accepted scope</h3><p className="project-panel-muted">{details?.proposal?.scope_summary||"No accepted scope summary is available."}</p></section>
          <section className="project-panel-section" id="project-tasks"><div className="project-panel-section-heading"><h3>Tasks</h3><Link to={`/projects/${selected.id}`}>View all</Link></div>{details?details.tasks.length?<ul className="project-mini-list">{details.tasks.slice(0,4).map((task:any)=><li key={task.id}><span className={`project-task-mark ${task.status==="completed"?"project-task-completed":""}`}>{task.status==="completed"?"✓":""}</span><div><strong>{task.title}</strong><small>{task.due_at?`Due ${dateText(task.due_at)}`:"No due date"}</small></div></li>)}</ul>:<p className="project-panel-muted">No project tasks yet.</p>:<Loading label="Loading tasks…"/>}</section>
          <section className="project-panel-section" id="project-payments"><div className="project-panel-section-heading"><h3>Recent payments</h3><Link to={`/projects/${selected.id}`}>View all</Link></div>{details?details.payments.length?<ul className="project-detail-list">{details.payments.slice(0,3).map((payment:any)=><li key={payment.id}><div><strong>{payment.payment_kind==="deposit"?"Deposit received":"Progress payment"}</strong><small>{dateText(payment.received_at)}{payment.reference?` · ${payment.reference}`:""}</small></div><strong>{moneyText(payment.amount,payment.currency||selected.currency)}</strong></li>)}</ul>:<p className="project-panel-muted">No payments recorded yet.</p>:<Loading label="Loading payments…"/>}</section>
          <Link className="button button-secondary project-panel-action" to={`/projects/${selected.id}`}>Open full project →</Link>
        </div>
      </aside>}
    </div>
  </>;
}
