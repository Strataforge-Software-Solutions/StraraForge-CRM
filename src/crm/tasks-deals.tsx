import { useCallback, useEffect, useState, type DragEvent as ReactDragEvent, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { db, stageLabels, cx, dateText, isPhoneLikeContactName, rememberLeadStageTransition, useAuth, useToast, CrmIcon, PageHeader, Loading, ErrorBox, Metric, Modal, StageDropdown } from "./shared";
import { LeadForm } from "./leads";

const dealLanes = [
  { key: "new", title: "New Leads", stages: ["new"], dropStage: "new" },
  { key: "contacted", title: "Contacted", stages: ["contacted"], dropStage: "contacted" },
  { key: "discovery", title: "In Progress", stages: ["discovery"], dropStage: "discovery" },
  { key: "proposal", title: "Review / Proposal", stages: ["proposal_sent", "accepted_awaiting_deposit"], dropStage: "proposal_sent" },
  { key: "won", title: "Won", stages: ["won"], dropStage: null }
] as const;

function contactInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function TasksDeals() {
  const { founder } = useAuth();
  const notify = useToast();
  const location = useLocation();
  const [view, setView] = useState(new URLSearchParams(location.search).get("view") ?? (location.pathname === "/tasks" ? "tasks" : "deals"));
  const [leads, setLeads] = useState<any[] | null>(null);
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [projects, setProjects] = useState<any[] | null>(null);
  const [taskOpen, setTaskOpen] = useState(new URLSearchParams(location.search).get("new") === "task");
  const [leadOpen, setLeadOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<any | null>(null);
  const [busy, setBusy] = useState("");
  const [movingTo, setMovingTo] = useState("");
  const [draggedId, setDraggedId] = useState("");
  const [dropStage, setDropStage] = useState("");
  const [leadLoadError, setLeadLoadError] = useState(false);
  const movableStages = ["new", "contacted", "discovery", "proposal_sent"];

  const load = useCallback(async () => {
    const [leadResult, taskResult, projectResult] = await Promise.all([
      db().from("leads").select("id,company_name,contact_name,stage,source,next_follow_up_at").eq("workspace_id", founder!.workspaceId).is("archived_at", null),
      db().from("tasks").select("id,title,status,due_at,description,lead_id,client_id,project_id").eq("workspace_id", founder!.workspaceId).is("archived_at", null).is("project_id", null).order("due_at", { ascending: true, nullsFirst: false }),
      db().from("projects").select("id,status").eq("workspace_id", founder!.workspaceId).is("archived_at", null)
    ]);
    setLeadLoadError(Boolean(leadResult.error));
    setLeads(leadResult.error ? null : leadResult.data ?? []);
    setTasks(taskResult.data ?? []);
    setProjects(projectResult.data ?? []);
  }, [founder]);
  useEffect(() => { void load(); }, [load]);

  async function move(lead: any, stage: string) {
    if (!movableStages.includes(stage) || stage === lead.stage || busy) return;
    setBusy(lead.id);
    setMovingTo(stage);
    try {
      if (stage === "proposal_sent") {
        const { data } = await db().from("proposals").select("id").eq("workspace_id", founder!.workspaceId).eq("lead_id", lead.id).eq("status", "sent").limit(1).maybeSingle();
        if (!data) {
          notify("Mark a saved proposal as sent before moving this lead to Proposal sent.", true);
          return;
        }
      }
      const { error } = await db().from("leads").update({ stage }).eq("workspace_id", founder!.workspaceId).eq("id", lead.id).in("stage", movableStages);
      if (error) {
        notify(error.message, true);
        return;
      }
      rememberLeadStageTransition(founder!.workspaceId, lead.id, lead.stage, stage);
      notify(`Moved to ${stageLabels[stage]}.`);
      await load();
    } catch {
      notify("Could not move this lead. Please try again.", true);
    } finally {
      setBusy("");
      setMovingTo("");
      setDropStage("");
    }
  }

  async function toggleTask(task: any) {
    setBusy(task.id);
    const completing = task.status !== "completed";
    const { error } = await db().from("tasks").update({ status: completing ? "completed" : "open", completed_at: completing ? new Date().toISOString() : null }).eq("workspace_id", founder!.workspaceId).eq("id", task.id);
    setBusy("");
    if (error) notify(error.message, true);
    else { notify(completing ? "Task completed." : "Task reopened."); await load(); }
  }

  function startDrag(event: ReactDragEvent<HTMLElement>, lead: any) {
    if (!movableStages.includes(lead.stage) || busy) { event.preventDefault(); return; }
    setDraggedId(lead.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", lead.id);
  }

  function allowDrop(event: ReactDragEvent<HTMLElement>, stage: string) {
    if (!movableStages.includes(stage) || busy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropStage(stage);
  }

  function dropLead(event: ReactDragEvent<HTMLElement>, stage: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || draggedId;
    const lead = leads?.find((item) => item.id === id);
    setDropStage("");
    if (lead && movableStages.includes(stage)) void move(lead, stage);
  }

  return <>
    <PageHeader eyebrow="Shared work queue" title="Tasks / Deals" description="Keep website opportunities and the work needed to move them forward in one place." action={<button className="button button-primary" onClick={() => setTaskOpen(true)}>＋ Add Task</button>}/>
    <section className="dashboard-metrics"><Metric label="Active opportunities" value={leads?.length ?? "…"} hint="Website inquiries" icon="♙"/><Metric label="Open tasks" value={tasks?.filter((task) => task.status !== "completed" && task.status !== "cancelled").length ?? "…"} hint="Open and in progress" tone="blue" icon="▤"/><Metric label="Ongoing projects" value={projects?.filter((project) => ["planned", "in_progress", "on_hold"].includes(project.status)).length ?? "…"} hint="Planned or in delivery" tone="green" icon="▱"/><Metric label="Converted" value={leads?.filter((lead) => lead.stage === "won").length ?? "…"} hint="Confirmed projects" tone="purple" icon="✓"/></section>
    <section className="record-list-panel tasks-deals-workspace-panel"><div className="leads-table-toolbar"><div><div className="tasks-panel-title"><h2>Tasks / Deals</h2>{view === "tasks" && tasks && <span className="tasks-panel-count">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</span>}</div><p>{view === "deals" ? "Drag a card to update its stage, or use the selector." : "General follow-ups and tasks not linked to a project. Delivery work is in Project tasks."}</p></div><div className="button-group"><button className={cx("button", view === "deals" ? "button-primary" : "button-secondary")} onClick={() => setView("deals")}>Deals</button><button className={cx("button", view === "tasks" ? "button-primary" : "button-secondary")} onClick={() => setView("tasks")}>Tasks</button></div></div>
      {view === "deals" ? leadLoadError ? <div className="td-board-error"><ErrorBox>Could not load deals. Please try again.</ErrorBox><button type="button" className="button button-secondary" onClick={() => void load()}>Retry</button></div> : <div className="deal-board" role="region" aria-label="Deals board; scroll horizontally to see all stages" tabIndex={0}>{dealLanes.map((lane) => {
        const canDrop = Boolean(lane.dropStage);
        const laneLeads = leads?.filter((lead) => (lane.stages as readonly string[]).includes(lead.stage)) ?? [];
        return <section className={cx("td-lane", `td-lane-${lane.key}`, dropStage === lane.dropStage && canDrop && "is-drop-target")} key={lane.key} aria-label={`${lane.title}, ${leads ? laneLeads.length : "loading"} deals${canDrop ? ", drop target" : ""}`} onDragOver={lane.dropStage ? (event) => allowDrop(event, lane.dropStage) : undefined} onDrop={lane.dropStage ? (event) => dropLead(event, lane.dropStage) : undefined}>
          <header className="td-lane-header"><div className="td-lane-heading"><span className="td-lane-dot" aria-hidden="true"/><h3>{lane.title}</h3></div><div className="td-lane-tools"><span className="td-lane-count">{leads ? laneLeads.length : "…"}</span><button type="button" className="td-lane-add" aria-label="Add a new lead to New Leads" title="Add a new lead to New Leads" onClick={() => setLeadOpen(true)}><CrmIcon name="plus"/></button></div></header>
          <div className="td-lane-cards">{!leads ? <p className="td-lane-empty" role="status">Loading deals…</p> : laneLeads.length ? laneLeads.map((lead) => {
            const isMoving = busy === lead.id && movableStages.includes(lead.stage);
            const canDrag = movableStages.includes(lead.stage) && !busy;
            const showContact = lead.contact_name && !isPhoneLikeContactName(lead.contact_name);
            return <article className={cx("td-deal-card", draggedId === lead.id && "is-dragging", isMoving && "is-saving")} key={lead.id} draggable={canDrag} aria-busy={isMoving} onDragStart={(event) => startDrag(event, lead)} onDragEnd={() => { setDraggedId(""); setDropStage(""); }}>
              <div className="td-deal-card-head"><Link className="td-deal-card-title" to={`/leads/${lead.id}`}>{lead.company_name}</Link><Link className="td-deal-card-open" to={`/leads/${lead.id}`} aria-label={`Open ${lead.company_name} lead`} title="Open lead details"><CrmIcon name="more"/></Link></div>
              {showContact && <p className="td-deal-card-contact">{lead.contact_name}</p>}
              {lead.source && <span className="td-deal-card-source">{lead.source}</span>}
              <div className="td-deal-card-meta"><span className="td-deal-card-date"><CrmIcon name="calendar"/>{lead.next_follow_up_at ? <time dateTime={lead.next_follow_up_at}>{dateText(lead.next_follow_up_at)}</time> : <span>No follow-up</span>}</span>{showContact && <span className="td-deal-card-avatar" title={`Contact: ${lead.contact_name}`} aria-label={`Contact: ${lead.contact_name}`}>{contactInitials(lead.contact_name)}</span>}</div>
              {canDrag ? <StageDropdown className="td-deal-card-stage" value={lead.stage} options={[...new Set([lead.stage, ...movableStages])]} disabled={isMoving} label={`Move ${lead.company_name} to stage`} onChange={(stage) => void move(lead, stage)}/> : <span className="td-deal-card-locked-stage">{stageLabels[lead.stage]}</span>}
              {isMoving && <div className="td-deal-saving" role="status"><span className="td-deal-spinner"/><span>Moving to {stageLabels[movingTo] ?? "stage"}…</span></div>}
            </article>;
          }) : <p className={cx("td-lane-empty", canDrop && "is-drop-hint")}>{canDrop ? "Drop a deal here" : "No deals in this stage"}</p>}</div>
        </section>;
      })}</div> : !tasks ? <Loading/> : tasks.length === 0 ? <div className="task-empty-state"><span className="task-empty-icon" aria-hidden="true">✓</span><div><strong>Nothing on your task list yet</strong><p>Add a task to keep the next step for each opportunity visible.</p></div><button type="button" className="button button-secondary" onClick={() => setTaskOpen(true)}>Add a task</button></div> : <section className="task-list">{tasks.map((task) => {
        const linkedLead = task.lead_id ? leads?.find((lead) => lead.id === task.lead_id) : null;
        const relatedLabel = linkedLead ? `Lead · ${linkedLead.company_name}` : task.client_id ? "Client follow-up" : "General task";
        return <article className={cx("task-card", task.status === "completed" && "is-completed")} key={task.id}>
          <div className="task-card-content">
            <div className="task-card-topline">
              <div className="task-card-heading"><span className="task-card-context">{relatedLabel}</span><strong>{task.title}</strong></div>
              <div className="task-card-tools">
                <span className={cx("task-status-pill", `task-status-${task.status}`)}>{task.status.replace(/_/g, " ")}</span>
                <details className="task-card-actions"><summary aria-label={`Actions for ${task.title}`}><span aria-hidden="true">⋮</span></summary><div className="task-card-actions-menu"><button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setTaskToEdit(task); }}>Edit task</button></div></details>
              </div>
            </div>
            {task.description && <p>{task.description}</p>}
            <div className="task-card-meta"><span className="task-card-date"><CrmIcon name="calendar"/>{task.due_at ? <><span>Due</span><time dateTime={task.due_at}>{dateText(task.due_at)}</time></> : <span>No due date</span>}</span><label className="task-complete-control"><input type="checkbox" checked={task.status === "completed"} disabled={busy === task.id} onChange={() => void toggleTask(task)}/><span className="task-checkbox-mark" aria-hidden="true"/><span>{task.status === "completed" ? "Completed" : "Mark done"}</span></label></div>
          </div>
        </article>;
      })}</section>}
    </section>
    {taskOpen && <TaskModal onClose={() => setTaskOpen(false)} onSaved={() => void load()}/>}
    {leadOpen && <Modal title="Add a website inquiry" description="Capture the request and primary contact. New inquiries start in New Leads." onClose={() => setLeadOpen(false)} className="lead-record-dialog"><LeadForm onClose={() => setLeadOpen(false)} onSaved={() => void load()}/></Modal>}
    {taskToEdit && <TaskModal task={taskToEdit} onClose={() => setTaskToEdit(null)} onSaved={() => void load()}/>}
  </>;
}

function TaskModal({onClose,onSaved,task}:{onClose:()=>void;onSaved:()=>void;task?:any}){const {founder}=useAuth();const notify=useToast();const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [options,setOptions]=useState<any[]>([]);const editing=Boolean(task);const initialRelated=task?.lead_id?`lead:${task.lead_id}`:task?.client_id?`client:${task.client_id}`:"";const [relatedRecord,setRelatedRecord]=useState(initialRelated);useEffect(()=>{setRelatedRecord(initialRelated);},[task?.id]);useEffect(()=>{void Promise.all([db().from("leads").select("id,company_name").eq("workspace_id",founder!.workspaceId).is("archived_at",null),db().from("clients").select("id,name").eq("workspace_id",founder!.workspaceId).is("archived_at",null)]).then(([l,c])=>setOptions([...((l.data??[]).map((x:any)=>({id:x.id,label:`Lead · ${x.company_name}`,type:"lead"}))),...((c.data??[]).map((x:any)=>({id:x.id,label:`Client · ${x.name}`,type:"client"})))]));},[founder]);async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setError("");setBusy(true);const form=new FormData(event.currentTarget);const title=String(form.get("title")??"").trim();if(!title){setError("Enter a task title.");setBusy(false);return;}const relation=String(form.get("related_record")??"");const linked=options.find(x=>`${x.type}:${x.id}`===relation);const values={title,description:String(form.get("description")||"").trim()||null,due_at:form.get("due_at")?`${form.get("due_at")}T12:00:00.000Z`:null,lead_id:linked?.type==="lead"?linked.id:null,client_id:linked?.type==="client"?linked.id:null,project_id:null};const result=editing?await db().from("tasks").update(values).eq("workspace_id",founder!.workspaceId).eq("id",task.id):await db().from("tasks").insert({...values,workspace_id:founder!.workspaceId,created_by:founder!.userId,assignee_user_id:founder!.userId});setBusy(false);if(result.error){setError(result.error.message);return;}notify(editing?"Task updated.":"Task added.");onSaved();onClose();}return <Modal title={editing?"Edit task":"Add a task"} description={editing?"Update the task details and due date.":"Keep the next action clear and easy to find."} onClose={onClose}><form className="record-form" onSubmit={submit}><label className="field"><span>Task title *</span><input name="title" required maxLength={240} defaultValue={task?.title??""}/></label><label className="field"><span>Description</span><textarea name="description" rows={3} defaultValue={task?.description??""}/></label><label className="field"><span>Related record</span><select name="related_record" value={relatedRecord} onChange={(event)=>setRelatedRecord(event.target.value)}><option value="">No linked record</option>{options.map(option=><option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.label}</option>)}</select></label><label className="field"><span>Due date</span><input type="date" name="due_at" defaultValue={task?.due_at?.slice(0,10)??new URLSearchParams(window.location.search).get("date")??""}/></label>{error&&<ErrorBox>{error}</ErrorBox>}<div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy?"Saving…":editing?"Save changes":"Save task"}</button></div></form></Modal>}
