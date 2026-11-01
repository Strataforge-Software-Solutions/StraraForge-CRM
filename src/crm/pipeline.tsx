import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db, stages, stageLabels, dateText, moneyText, useAuth, PageHeader, Loading, ErrorBox } from "./shared";

export function Pipeline(){
  const {founder}=useAuth();
  const [leads,setLeads]=useState<any[]|null>(null);
  const [loadError,setLoadError]=useState(false);
  const [query,setQuery]=useState("");
  const [stageFilter,setStageFilter]=useState("all");
  const [view,setView]=useState<"board"|"list">(()=>window.matchMedia("(max-width: 760px)").matches?"list":"board");
  useEffect(()=>{let active=true;void db().from("leads").select("id,company_name,contact_name,stage,source,website_brief,next_follow_up_at,budget_min,budget_max,budget_currency").eq("workspace_id",founder!.workspaceId).is("archived_at",null).order("updated_at",{ascending:false}).then(({data,error})=>{if(active){setLeads(data??[]);setLoadError(Boolean(error));}});return()=>{active=false;};},[founder]);
  const list=leads??[];
  const normalizedQuery=query.trim().toLowerCase();
  const visible=list.filter(lead=>(stageFilter==="all"||lead.stage===stageFilter)&&`${lead.company_name} ${lead.contact_name} ${lead.source??""} ${lead.website_brief??""}`.toLowerCase().includes(normalizedQuery));
  const budgetText=(lead:any)=>lead.budget_min!=null&&lead.budget_max!=null?`${moneyText(lead.budget_min,lead.budget_currency)} – ${moneyText(lead.budget_max,lead.budget_currency)}`:lead.budget_min!=null||lead.budget_max!=null?moneyText(lead.budget_min??lead.budget_max,lead.budget_currency):"Not discussed";
  return <>
    <PageHeader eyebrow="Sales workspace" title="Pipeline" description="Follow website inquiries as they move through each sales stage."/>
    <section className="pipeline-overview"><div><p className="eyebrow">Lead stages</p><h2>Pipeline overview</h2><p>{leads===null?"Loading active inquiries…":`${list.length} ${list.length===1?"inquiry":"inquiries"} across ${stages.length} stages`}</p></div><Link className="button button-secondary" to="/leads">View all leads</Link></section>
    {loadError&&<ErrorBox>Pipeline leads could not be loaded. Refresh to try again.</ErrorBox>}
    {leads===null?<Loading label="Loading pipeline…"/>:<>
      <section className="pipeline-controls" aria-label="Pipeline controls">
        <label className="pipeline-search"><span className="visually-hidden">Search pipeline</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search company, contact, or source…"/></label>
        <label className="pipeline-stage-filter"><span>Stage</span><select value={stageFilter} onChange={event=>setStageFilter(event.target.value)}><option value="all">All stages</option>{stages.map(stage=><option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select></label>
        <div className="pipeline-view-switch" role="group" aria-label="Pipeline layout"><button type="button" className={view==="board"?"is-active":""} aria-pressed={view==="board"} onClick={()=>setView("board")}>Board</button><button type="button" className={view==="list"?"is-active":""} aria-pressed={view==="list"} onClick={()=>setView("list")}>List</button></div>
      </section>
      {visible.length===0&&list.length>0?<div className="pipeline-no-results"><strong>No inquiries match those filters</strong><p>Try another search or select a different stage.</p></div>:view==="board"?<div className="pipeline-board-scroll" role="region" aria-label="Lead pipeline stages" tabIndex={0}><section className="pipeline-board">{stages.map(stage=>{const stageLeads=visible.filter(lead=>lead.stage===stage);return <section className={`pipeline-column pipeline-stage-${stage}`} key={stage} aria-label={`${stageLabels[stage]}: ${stageLeads.length} leads`}><header className="pipeline-column-header"><div><span className="pipeline-stage-dot"/><h2>{stageLabels[stage]}</h2></div><span className="pipeline-count">{stageLeads.length}</span></header>{stageLeads.length?<ul>{stageLeads.map(lead=><li key={lead.id}><article className="pipeline-card"><div className="pipeline-card-heading"><span className="pipeline-card-avatar">{lead.company_name.slice(0,2).toUpperCase()}</span><div><h3>{lead.company_name}</h3><p>{lead.contact_name}</p></div></div>{lead.website_brief&&<p className="pipeline-card-brief">{lead.website_brief}</p>}<dl className="pipeline-card-details"><div><dt>Source</dt><dd>{lead.source||"Not recorded"}</dd></div><div><dt>Budget</dt><dd>{budgetText(lead)}</dd></div><div><dt>Follow-up</dt><dd>{lead.next_follow_up_at?dateText(lead.next_follow_up_at):"Not set"}</dd></div></dl><Link className="pipeline-card-link" to={`/leads/${lead.id}`}>Open lead <span aria-hidden="true">→</span></Link></article></li>)}</ul>:<div className="pipeline-empty"><span>{normalizedQuery||stageFilter!=="all"?"No matching inquiries":"No leads in this stage"}</span></div>}</section>})}</section></div>:<section className="pipeline-list-panel"><div className="leads-table-scroll"><table className="leads-table pipeline-list-table"><thead><tr><th>Company</th><th>Contact</th><th>Stage</th><th>Source</th><th>Next follow-up</th><th>Budget</th><th>Open</th></tr></thead><tbody>{visible.map(lead=><tr key={lead.id}><td><strong>{lead.company_name}</strong></td><td>{lead.contact_name||"Not set"}</td><td><span className={`pipeline-stage-badge pipeline-stage-${lead.stage}`}>{stageLabels[lead.stage]}</span></td><td>{lead.source||"Not recorded"}</td><td>{lead.next_follow_up_at?dateText(lead.next_follow_up_at):"Not set"}</td><td>{budgetText(lead)}</td><td><Link to={`/leads/${lead.id}`}>Open →</Link></td></tr>)}</tbody></table></div><p className="pipeline-list-count">Showing {visible.length} of {list.length} inquiries</p></section>}
    </>}
  </>;
}
