import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { db, stageLabels, projectStatus, cx, dateText, readLocalLeadStageTransitions, useAuth, useToast, CrmIcon, Loading, LoadingInline, ErrorBox, Metric, StageDropdown } from "./shared";
import { RecordAvatar } from "./images";
import { recordPath } from "./record-links";

export function Dashboard() {
  const { founder } = useAuth();
  const notify = useToast();
  const [dashboardParams, setDashboardParams] = useSearchParams();
  const rangeParam = dashboardParams.get("range");
  const dashboardRange = rangeParam === "30d" || rangeParam === "90d" ? rangeParam : "month";
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(false);
  const [activityRows, setActivityRows] = useState<any[] | null>(null);
  const [activityCount, setActivityCount] = useState(0);
  const [activityPage, setActivityPage] = useState(0);
  const [activityError, setActivityError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [busyTaskId, setBusyTaskId] = useState("");
  const [completedUpcomingTaskIds, setCompletedUpcomingTaskIds] = useState<string[]>([]);
  const dashboardRangeLabels: Record<string, string> = { month: "This month", "30d": "Last 30 days", "90d": "Last 90 days" };

  function setDashboardRange(nextRange: string) {
    const next = new URLSearchParams(dashboardParams);
    if (nextRange === "month") next.delete("range");
    else next.set("range", nextRange);
    setDashboardParams(next);
  }

  async function completeUpcomingTask(task: any) {
    if (busyTaskId) return;
    if (task.project_id && !task.assignee_user_id) {
      notify("Assign this project task before completing it.", true);
      return;
    }
    setBusyTaskId(task.id);
    setCompletedUpcomingTaskIds((ids) => ids.includes(task.id) ? ids : [...ids, task.id]);
    const { error } = await db().from("tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("workspace_id", founder!.workspaceId)
      .eq("id", task.id);
    setBusyTaskId("");
    if (error) {
      setCompletedUpcomingTaskIds((ids) => ids.filter((id) => id !== task.id));
      notify(error.message, true);
      return;
    }
    notify("Task completed.");
    setRefreshVersion((version) => version + 1);
  }

  useEffect(() => {
    const refreshWhenFocused = () => setRefreshVersion((version) => version + 1);
    window.addEventListener("focus", refreshWhenFocused);
    window.addEventListener("strataforge:crm-data-changed", refreshWhenFocused);
    return () => { window.removeEventListener("focus", refreshWhenFocused); window.removeEventListener("strataforge:crm-data-changed", refreshWhenFocused); };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = db();
      const id = founder!.workspaceId;
      const [leads, tasks, projects, upcoming, clients] = await Promise.all([
        supabase.from("leads").select("id,company_name,client_id,stage,created_at,source").eq("workspace_id", id).is("archived_at", null),
        supabase.from("tasks").select("id,title,status,due_at,lead_id,client_id,project_id").eq("workspace_id", id).is("archived_at", null),
        supabase.from("projects").select("id,name,status,target_date,client_id,lead_id").eq("workspace_id", id).is("archived_at", null),
        supabase.from("tasks").select("id,title,status,due_at,lead_id,client_id,project_id,assignee_user_id").eq("workspace_id", id).is("archived_at", null).in("status", ["open", "in_progress"]).order("due_at", { ascending: true, nullsFirst: false }).limit(6),
        supabase.from("clients").select("id,name").eq("workspace_id", id).is("archived_at", null)
      ]);
      if (active) {
        setError(Boolean(leads.error || tasks.error || projects.error || upcoming.error));
        setData({ leads: leads.data ?? [], tasks: tasks.data ?? [], projects: projects.data ?? [], upcoming: upcoming.data ?? [], clients: clients.data ?? [] });
        setCompletedUpcomingTaskIds([]);
      }
    })();
    return () => { active = false; };
  }, [founder, refreshVersion]);

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await db().from("audit_events").select("id,action,subject_type,subject_id,occurred_at,details", { count: "exact" })
        .eq("workspace_id", founder!.workspaceId).order("occurred_at", { ascending: false })
        .range(activityPage * 5, activityPage * 5 + 4);
      if (!active) return;
      setActivityError(Boolean(result.error));
      setActivityRows(result.data ?? []);
      setActivityCount(result.count ?? 0);
    })();
    return () => { active = false; };
  }, [founder, activityPage, refreshVersion]);

  if (!data) return <Loading/>;
  const leadNames = new Map((data.leads ?? []).map((lead: any) => [lead.id, lead.company_name]));
  const clientNames = new Map((data.clients ?? []).map((client: any) => [client.id, client.name]));
  const projectById = new Map((data.projects ?? []).map((project: any) => [project.id, project]));
  const workspaceCompanyNames = new Set([...leadNames.values(), ...clientNames.values()].filter(Boolean));
  const onlyWorkspaceCompany = workspaceCompanyNames.size === 1 ? [...workspaceCompanyNames][0] as string : null;
  const resolveCompanyName = (record: any) => {
    if (record?.lead_id && leadNames.has(record.lead_id)) return leadNames.get(record.lead_id);
    if (record?.client_id && clientNames.has(record.client_id)) return clientNames.get(record.client_id);
    const project = record?.project_id ? projectById.get(record.project_id) as any : null;
    if (project?.lead_id && leadNames.has(project.lead_id)) return leadNames.get(project.lead_id);
    if (project?.client_id && clientNames.has(project.client_id)) return clientNames.get(project.client_id);
    return null;
  };
  const serverActivity = activityRows ?? [];
  const serverStageChanges = serverActivity.filter((event: any) => event.action === "stage_changed");
  const localStageChanges = activityPage === 0 ? readLocalLeadStageTransitions(founder!.workspaceId)
    .filter((local: any) => !serverStageChanges.some((server: any) => server.subject_id === local.subject_id && server.details?.from === local.from && server.details?.to === local.to && Math.abs(new Date(server.occurred_at).getTime() - new Date(local.occurred_at).getTime()) < 120_000))
    .map((local: any) => ({ id: local.id, action: "stage_changed", subject_type: "leads", subject_id: local.subject_id, occurred_at: local.occurred_at, details: { from: local.from, to: local.to } })) : [];
  const activityFeed = [...localStageChanges, ...serverActivity]
    .sort((a: any, b: any) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .slice(0, 5);
  const recent = activityFeed.flatMap((event: any) => {
    const previous = event.details?.from;
    const target = event.details?.to;
    const leadName = event.subject_type === "leads" ? leadNames.get(event.subject_id) ?? "Lead" : null;
    const companyName = event.subject_type === "projects"
      ? resolveCompanyName(projectById.get(event.subject_id)) ?? (projectById.get(event.subject_id) as any)?.name
      : event.subject_type === "tasks"
        ? resolveCompanyName((data.tasks ?? []).find((task: any) => task.id === event.subject_id)) ?? onlyWorkspaceCompany
        : null;
    const title = event.action === "stage_changed" && target
      ? `${leadName ?? "Lead"}: ${previous ? `${stageLabels[previous] ?? previous} > ` : ""}${stageLabels[target] ?? target}`
      : event.action === "stage_changed"
        ? "Lead stage changed"
      : leadName
        ? `${leadName}: ${event.action === "insert" ? "New lead added" : event.action === "delete" ? "Lead removed" : "Lead updated"}`
      : event.subject_type === "projects" && event.action === "insert"
        ? `New project for ${companyName ?? "client"}`
      : event.subject_type === "projects" && companyName
        ? `${companyName}: ${event.action === "delete" ? "Project removed" : "Project updated"}`
      : event.subject_type === "tasks" && companyName
        ? `${companyName}: ${event.action === "insert" ? "New task added" : event.action === "delete" ? "Task removed" : "Updated task"}`
        : `${event.action === "insert" ? "New" : event.action === "delete" ? "Removed" : "Updated"} ${(event.subject_type ?? "record").replaceAll("_", " ").replace(/s$/, "")}`;
    return [{ ...event, title }];
  });
  const activityPageCount = Math.max(1, Math.ceil(activityCount / 5));
  const activityStart = activityCount ? activityPage * 5 + 1 : 0;
  const activityEnd = Math.min((activityPage + 1) * 5, activityCount);
  const today = new Date();
  const rangeStart = new Date(today);
  if (dashboardRange === "month") { rangeStart.setDate(1); rangeStart.setHours(0, 0, 0, 0); }
  else { rangeStart.setDate(today.getDate() - (dashboardRange === "90d" ? 89 : 29)); rangeStart.setHours(0, 0, 0, 0); }
  const rangeLeads = data.leads.filter((lead: any) => new Date(lead.created_at) >= rangeStart);
  const rangeDays = Math.max(1, Math.ceil((today.getTime() - rangeStart.getTime()) / 86400000) + 1);
  const trend = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(rangeStart.getTime() + index * rangeDays / 14 * 86400000);
    const nextDate = new Date(rangeStart.getTime() + (index + 1) * rangeDays / 14 * 86400000);
    const key = date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    return { date, key, count: rangeLeads.filter((lead: any) => { const created = new Date(lead.created_at); return created >= date && created < nextDate; }).length };
  });
  const chartMax = Math.max(1, ...trend.map((point) => point.count));
  const chartPoints = trend.map((point, index) => `${24 + index * 42},${126 - point.count / chartMax * 100}`).join(" ");
  const sources = (Object.entries(rangeLeads.reduce((result: Record<string, number>, lead: any) => {
    const source = String(lead.source || "Unspecified").trim() || "Unspecified";
    result[source] = (result[source] ?? 0) + 1;
    return result;
  }, {})) as [string, number][]).sort((a, b) => b[1] - a[1]);
  const sourceDisplay: [string, number][] = sources.length > 5 ? [...sources.slice(0, 4), ["Other", sources.slice(4).reduce((sum: number, item: any) => sum + item[1], 0)]] : sources as [string, number][];
  const sourceColors = ["#f15b0b", "#3784ed", "#24b585", "#8b5cf6", "#9aa4b2"];
  const sourceTotal = Math.max(1, rangeLeads.length);
  let sourceProgress = 0;
  const sourceGradient = sourceDisplay.length ? `conic-gradient(${sourceDisplay.map(([name, count]: any, index: number) => {
    const start = sourceProgress;
    sourceProgress += count / sourceTotal * 100;
    return `${sourceColors[index]} ${start}% ${sourceProgress}%`;
  }).join(",")})` : "#edf0ed";
  const recentLeads = [...data.leads].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  return <>
    <section className="dashboard-welcome"><div><p className="eyebrow">Founder workspace</p><h1>Good {new Intl.DateTimeFormat("en", { timeZone: "Asia/Manila", hour: "numeric", hour12: false }).format(new Date()) < "12" ? "morning" : "afternoon"}{founder?.name ? `, ${founder.name.split(" ")[0]}` : ""}</h1><p>Here’s an overview of your leads, tasks, and projects.</p></div><aside className="dashboard-date-card" aria-label="Current date in Manila"><span className="dashboard-date-icon" aria-hidden="true"><CrmIcon name="calendar"/></span><div className="dashboard-date-copy"><span className="dashboard-date-label">Today · Manila</span><strong>{today.toLocaleDateString("en", { weekday: "long", timeZone: "Asia/Manila" })}</strong><time dateTime={today.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })}>{today.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" })}</time></div></aside></section>
    {error && <ErrorBox/>}
    <section className="dashboard-metrics"><Metric label="Total Leads" value={data.leads.length} hint="All active inquiries" icon="♙"/><Metric label="Active Tasks" value={data.tasks.filter((task: any) => task.status !== "completed" && task.status !== "cancelled").length} hint="Open and in progress" tone="blue" icon="▤"/><Metric label="Ongoing Projects" value={data.projects.filter((project: any) => ["planned", "in_progress", "on_hold"].includes(project.status)).length} hint="Planned or in delivery" tone="green" icon="▱"/><Metric label="Completed" value={data.projects.filter((project: any) => project.status === "completed").length} hint="Finished projects" tone="purple" icon="✓"/></section>
    <div className="dashboard-grid dashboard-reference-grid">
      <section className="dashboard-panel dashboard-trend-panel"><h2><span className="dashboard-panel-heading-title"><span className="dashboard-panel-heading-icon"><CrmIcon name="trend"/></span><span>Leads overview</span></span><StageDropdown className="dashboard-range-dropdown" minMenuWidth={132} value={dashboardRange} options={["month", "30d", "90d"]} disabled={false} label="Lead chart date range" optionLabels={dashboardRangeLabels} onChange={setDashboardRange}/></h2>{data.leads.length ? <><svg className="dashboard-trend-chart" viewBox="0 0 570 165" role="img" aria-label={`Lead creation trend. ${rangeLeads.length} leads in selected range.`}><defs><linearGradient id="dashboard-trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#f15b0b" stopOpacity=".22"/><stop offset="100%" stopColor="#f15b0b" stopOpacity="0"/></linearGradient></defs><text x="17" y="29" className="dashboard-chart-y-label">{chartMax}</text><text x="17" y="80" className="dashboard-chart-y-label">{Math.ceil(chartMax / 2)}</text><text x="17" y="129" className="dashboard-chart-y-label">0</text>{[26,59,92,125].map((y) => <line key={y} x1="24" x2="552" y1={y} y2={y} className="dashboard-chart-gridline"/>)}<polygon points={`24,126 ${chartPoints} 570,126`} fill="url(#dashboard-trend-fill)"/><polyline points={chartPoints} fill="none" className="dashboard-trend-line"/>{trend.map((point, index) => point.count ? <circle key={point.key} cx={24 + index * 42} cy={126 - point.count / chartMax * 100} r="3.5" className="dashboard-trend-point"><title>{point.count} leads on {point.date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "Asia/Manila" })}</title></circle> : null)}</svg><div className="dashboard-trend-axis"><span>{trend[0].date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "Asia/Manila" })}</span><span>{trend[6].date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "Asia/Manila" })}</span><span>{trend[13].date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "Asia/Manila" })}</span></div></> : <p className="dashboard-panel-empty">Your lead trend will appear when you add an inquiry.</p>}</section>
      <section className="dashboard-panel dashboard-source-panel"><h2><span className="dashboard-panel-heading-title"><span className="dashboard-panel-heading-icon"><CrmIcon name="activity"/></span><span>Lead sources</span></span><StageDropdown className="dashboard-range-dropdown" minMenuWidth={132} value={dashboardRange} options={["month", "30d", "90d"]} disabled={false} label="Lead source date range" optionLabels={dashboardRangeLabels} onChange={setDashboardRange}/></h2>{sources.length ? <div className="dashboard-source-content"><div className="dashboard-source-donut" style={{ background: sourceGradient }} role="img" aria-label={`${rangeLeads.length} leads across ${sources.length} sources`}><div><strong>{rangeLeads.length}</strong><span>Total leads</span></div></div><ul>{sourceDisplay.map(([name, count]: any, index) => <li key={name}><span style={{ background: sourceColors[index] }}/><span>{name}</span><strong>{Math.round(count / sourceTotal * 100)}%</strong></li>)}</ul></div> : <p className="dashboard-panel-empty">Lead source data will appear here.</p>}</section>
      <section className="dashboard-panel dashboard-activities"><h2><span className="dashboard-panel-heading-title"><span className="dashboard-panel-heading-icon"><CrmIcon name="activity"/></span><span>Recent Activities</span></span><Link to="/leads">View leads →</Link></h2>{activityError && <ErrorBox>Recent activity could not be loaded.</ErrorBox>}{activityRows === null ? <LoadingInline label="Loading activity…"/> : recent.length ? <ul className="dashboard-activity-list">{recent.map((event: any) => <li key={event.id}><span className={`activity-icon activity-icon-${event.subject_type === "leads" ? "lead" : event.subject_type === "tasks" ? "task" : event.subject_type === "projects" ? "project" : "other"}`} aria-hidden="true"><CrmIcon name={event.subject_type === "leads" ? "users" : event.subject_type === "tasks" ? "tasks" : event.subject_type === "projects" ? "layers" : "activity"}/></span><div><Link to={event.subject_type === "leads" ? `/leads?selected=${event.subject_id}` : "/dashboard"}>{event.title}</Link><small>{new Date(event.occurred_at).toLocaleString("en", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric", timeZone: "Asia/Manila" })}</small></div></li>)}</ul> : <p className="dashboard-panel-empty">No recent changes yet.</p>}{activityRows !== null && activityCount > 5 && <nav className="dashboard-pagination" aria-label="Recent activity pages"><span>{activityStart}–{activityEnd} of {activityCount}</span><div><button className="button button-secondary" type="button" aria-label="Previous activities" disabled={activityPage === 0} onClick={() => setActivityPage((page) => Math.max(0, page - 1))}>‹</button><span>Page {activityPage + 1} of {activityPageCount}</span><button className="button button-secondary" type="button" aria-label="Next activities" disabled={activityPage + 1 >= activityPageCount} onClick={() => setActivityPage((page) => Math.min(activityPageCount - 1, page + 1))}>›</button></div></nav>}</section>
      <section className="dashboard-panel dashboard-recent-leads"><h2><span className="dashboard-panel-heading-title"><span className="dashboard-panel-heading-icon"><CrmIcon name="users"/></span><span>Recent leads</span></span><Link to="/leads">View all →</Link></h2>{recentLeads.length ? <div className="dashboard-recent-table-wrap"><table className="dashboard-recent-table"><thead><tr><th>Name</th><th>Project Type</th><th>Source</th><th>Date</th><th>Status</th></tr></thead><tbody>{recentLeads.map((lead: any) => <tr key={lead.id}><td><Link className="dashboard-company-link" to={`/leads?selected=${lead.id}`}><RecordAvatar recordType="lead" recordId={lead.id} name={lead.company_name} className="dashboard-company-avatar" fallbackClientId={lead.client_id ?? ""}/><span>{lead.company_name}</span></Link></td><td>Website</td><td>{lead.source || "Unspecified"}</td><td>{dateText(lead.created_at)}</td><td><span className={`stage-badge stage-${lead.stage}`}>{stageLabels[lead.stage]}</span></td></tr>)}</tbody></table></div> : <p className="dashboard-panel-empty">New inquiries will appear here.</p>}</section>
      <section className="dashboard-panel dashboard-upcoming-panel"><h2><span className="dashboard-panel-heading-title"><span className="dashboard-panel-heading-icon"><CrmIcon name="tasks"/></span><span>Upcoming tasks</span></span><Link to="/tasks-deals?view=tasks">View all →</Link></h2>{data.upcoming.length ? <ul className="dashboard-task-list">{data.upcoming.map((task: any) => { const needsAssignment = Boolean(task.project_id && !task.assignee_user_id); return <li key={task.id}><label className="dashboard-task-check-control"><input type="checkbox" checked={task.status === "completed" || completedUpcomingTaskIds.includes(task.id)} disabled={busyTaskId === task.id || Boolean(busyTaskId) || needsAssignment} title={needsAssignment ? "Assign this project task before completing it." : undefined} aria-label={needsAssignment ? `Assign ${task.title} before completing it` : `Complete ${task.title}`} onChange={() => void completeUpcomingTask(task)}/><span className="dashboard-task-check" aria-hidden="true"/></label><div><strong>{task.title}</strong><small>{dateText(task.due_at)}</small>{needsAssignment && <Link className="dashboard-task-assignment-link" to={`/team/tasks?project=${encodeURIComponent(task.project_id)}`}>Assign before completing →</Link>}</div></li>; })}</ul> : <p className="dashboard-panel-empty">No open tasks.</p>}</section>
      <section className="dashboard-panel dashboard-project-panel"><h2><span className="dashboard-panel-heading-title"><span className="dashboard-panel-heading-icon"><CrmIcon name="layers"/></span><span>Project status</span></span><Link to="/projects">View all →</Link></h2>{data.projects.length ? <ul className="dashboard-project-list">{data.projects.slice(0, 5).map((project: any) => <li key={project.id}><span className={`dashboard-project-icon project-status-${project.status}`} aria-hidden="true"><CrmIcon name="layers"/></span><div><Link to={recordPath("project", project.id)}>{project.name}</Link><small>{project.target_date ? `Target ${dateText(project.target_date)}` : "No target date"}</small></div><span className={`dashboard-project-status project-status-label-${project.status}`}>{projectStatus[project.status]}</span></li>)}</ul> : <div className="dashboard-project-empty"><span className="dashboard-project-icon"><CrmIcon name="layers"/></span><strong>No confirmed projects yet</strong><p>Projects appear here after a proposal is accepted and the deposit is recorded.</p><Link to="/leads">Review leads →</Link></div>}</section>
    </div>
  </>;
}
