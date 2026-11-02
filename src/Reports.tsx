import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { DatePicker } from "@/crm/components";

type ReportData = { leads: any[]; clients: any[]; projects: any[]; payments: any[]; proposals: any[]; tasks: any[]; activity: any[] };
const zone = "Asia/Manila";
const colors = ["#ff5a0a", "#3997f7", "#12ae78", "#963bfa", "#f8b900", "#9aa8bd"];
const standardLeadSources = ["Website", "Referral", "LinkedIn", "Facebook", "Instagram", "TikTok", "X", "Twitter", "Inquiry Form", "Email", "Social Media"];
const stageLabels: Record<string, string> = { new: "New", contacted: "Contacted", discovery: "Discovery", proposal_sent: "Proposal sent", accepted_awaiting_deposit: "Awaiting deposit", won: "Won", lost: "Lost" };
const statusLabels: Record<string, string> = { planned: "Planned", in_progress: "In progress", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled" };
const statusColors: Record<string, string> = { planned: "#ff5a0a", in_progress: "#3997f7", on_hold: "#f8b900", completed: "#12ae78", cancelled: "#ee4562" };
const dateParts = (value: string) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
const localDate = (value: string) => { const part = dateParts(value); return `${part.year}-${part.month}-${part.day}`; };
const today = () => localDate(new Date().toISOString());
const shiftDays = (key: string, days: number) => { const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const monthStart = (key: string) => `${key.slice(0, 7)}-01`;
const shortDate = (key: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${key}T12:00:00Z`));
const axisDate = (key: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${key}T12:00:00Z`));
const inRange = (value: string | null | undefined, from: string, to: string) => !!value && localDate(value) >= from && localDate(value) <= to;
const byCurrency = (rows: any[], amountKey: string) => Object.entries(rows.reduce((totals: Record<string, number>, row: any) => { const currency = String(row.currency || "USD"); totals[currency] = (totals[currency] ?? 0) + Number(row[amountKey] || 0); return totals; }, {})).sort(([a], [b]) => a.localeCompare(b)) as [string, number][];
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
const moneySummary = (groups: [string, number][]) => groups.length === 1 ? money(groups[0][1], groups[0][0]) : groups.length ? `${groups.length} currencies` : "—";
const csvCell = (value: unknown) => { const raw = String(value ?? ""); const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw; return `"${safe.replaceAll('"', '""')}"`; };

async function fetchRows(table: string, columns: string, workspaceId: string, active = false) {
  const output: any[] = [];
  for (let start = 0; ; start += 1000) {
    let query = createClient().from(table).select(columns).eq("workspace_id", workspaceId).order("id").range(start, start + 999);
    if (active) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) throw error;
    output.push(...(data ?? []));
    if (!data || data.length < 1000) return output;
  }
}

function Panel({ title, note, children, className = "" }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return <section className={`sf-report-panel ${className}`}><header><h2>{title}</h2>{note && <span>{note}</span>}</header>{children}</section>;
}

function Empty({ text }: { text: string }) { return <p className="sf-report-empty">{text}</p>; }

function ReportIcon({ name }: { name: "leads" | "clients" | "projects" | "cash" }) {
  const path = name === "leads" ? <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2zM15 14a4 4 0 0 1 5 4v2h-3"/></> : name === "clients" ? <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18M10 13v2h4v-2"/></> : name === "projects" ? <><path d="m12 2 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/></> : <><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.8-.8-1.8-1-3-1-1.7 0-2.8.8-2.8 2s1.1 1.8 2.8 2.2 2.8 1 2.8 2.3-1.1 2.3-2.8 2.3c-1.2 0-2.2-.4-3-1.1M12 5v14"/></>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>;
}

function Donut({ rows, total, centerLabel }: { rows: [string, number][]; total: number; centerLabel: string }) {
  if (!total) return <Empty text={`No ${centerLabel.toLowerCase()} in this date range.`}/>;
  let progress = 0;
  const gradient = rows.map(([, count], index) => { const start = progress; progress += count / total * 100; return `${colors[index % colors.length]} ${start}% ${progress}%`; }).join(", ");
  return <div className="sf-report-donut-layout"><div className="sf-report-donut" style={{ background: `conic-gradient(${gradient})` }}><div><strong>{total}</strong><small>{centerLabel}</small></div></div><ul className="sf-report-legend">{rows.map(([name, count], index) => <li key={name}><i style={{ background: colors[index % colors.length] }}/><span>{name}</span><strong>{count}</strong><small>{Math.round(count / total * 100)}%</small></li>)}</ul></div>;
}

function Trend({ values, labels, description, format }: { values: number[]; labels: string[]; description: string; format: (value: number) => string }) {
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => `${12 + index * 95},${113 - value / max * 92}`).join(" ");
  const area = `12,113 ${points} 487,113`;
  return <div className="sf-report-trend"><svg viewBox="0 0 500 125" role="img" aria-label={description} preserveAspectRatio="none"><defs><linearGradient id={`report-fill-${description.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ff5a0a" stopOpacity=".25"/><stop offset="1" stopColor="#ff5a0a" stopOpacity=".03"/></linearGradient></defs>{[21, 51, 82, 113].map((y) => <line key={y} x1="12" x2="487" y1={y} y2={y} stroke="#e5ebf2"/>)}<polygon points={area} fill={`url(#report-fill-${description.replace(/\W/g, "")})`}/><polyline points={points} fill="none" stroke="#ff5a0a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>{values.map((value, index) => <circle key={index} cx={12 + index * 95} cy={113 - value / max * 92} r="3.5" fill="#ff5a0a"><title>{labels[index]}: {format(value)}</title></circle>)}</svg><div className="sf-report-trend-labels">{labels.map((label, index) => <span key={index}>{label}</span>)}</div><details className="sf-report-trend-data"><summary>View data</summary><table><caption>{description}</caption><tbody>{labels.map((label, index) => <tr key={index}><th scope="row">{label}</th><td>{format(values[index])}</td></tr>)}</tbody></table></details></div>;
}

function buckets(rows: any[], field: string, from: string, to: string, cumulative = false) {
  const start = new Date(`${from}T12:00:00Z`).getTime();
  const end = new Date(`${to}T12:00:00Z`).getTime();
  const span = Math.max(1, end - start + 86400000);
  const values = Array(6).fill(0) as number[];
  const days = Math.max(0, Math.round((end - start) / 86400000));
  const labels = Array.from({ length: 6 }, (_, index) => axisDate(shiftDays(from, Math.floor(index * days / 5))));
  for (const row of rows) { const when = new Date(`${localDate(row[field])}T12:00:00Z`).getTime(); const index = Math.min(5, Math.max(0, Math.floor((when - start) / span * 6))); values[index] += Number(row.amount ?? 1); }
  if (cumulative) for (let index = 1; index < values.length; index++) values[index] += values[index - 1];
  return { values, labels };
}

export default function Reports({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const [params, setParams] = useSearchParams();
  const rangeRef = useRef<HTMLDetailsElement>(null);
  const now = today();
  const defaultFrom = monthStart(now);
  const rawFrom = params.get("from") ?? defaultFrom;
  const rawTo = params.get("to") ?? now;
  const valid = (key: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const date = new Date(`${key}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key;
  };
  const from = valid(rawFrom) ? rawFrom : defaultFrom;
  const to = valid(rawTo) && rawTo >= from ? rawTo : from;
  const activePreset = params.get("preset") ?? (from === defaultFrom && to === now ? "month" : "custom");
  const [pickerReset, setPickerReset] = useState(0);
  const [rangeError, setRangeError] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [exportMessage, setExportMessage] = useState("");
  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [leads, clients, projects, payments, proposals, tasks, activity] = await Promise.all([
        fetchRows("leads", "id,source,stage,created_at,budget_min,budget_max,budget_currency", workspaceId, true),
        fetchRows("clients", "id,name,created_at", workspaceId, true),
        fetchRows("projects", "id,name,client_id,status,agreed_amount,currency,created_at", workspaceId, true),
        fetchRows("payment_entries", "id,amount,currency,received_at", workspaceId),
        fetchRows("proposals", "id,status,sent_at", workspaceId),
        fetchRows("tasks", "id,status,due_at", workspaceId, true),
        fetchRows("audit_events", "id,subject_type,subject_id,action,actor_user_id,occurred_at", workspaceId),
      ]);
      setData({ leads, clients, projects, payments, proposals, tasks, activity });
    } catch (error) { setData(null); setLoadError(error instanceof Error ? error.message : "Reports couldn’t load."); }
  }, [workspaceId]);
  useEffect(() => { void load(); }, [load, reload]);
  const report = useMemo(() => {
    if (!data) return null;
    const leads = data.leads.filter((row) => inRange(row.created_at, from, to));
    const clients = data.clients.filter((row) => inRange(row.created_at, from, to));
    const projects = data.projects.filter((row) => inRange(row.created_at, from, to));
    const payments = data.payments.filter((row) => inRange(row.received_at, from, to));
    const proposals = data.proposals.filter((row) => row.sent_at && inRange(row.sent_at, from, to));
    const activity = data.activity.filter((row) => row.subject_type === "projects" && inRange(row.occurred_at, from, to)).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 6);
    const overdue = data.tasks.filter((row) => row.due_at && localDate(row.due_at) < now && row.status !== "completed" && row.status !== "cancelled").length;
    const sourceCounts = leads.reduce((counts: Record<string, number>, row) => { const raw = String(row.source || "Unspecified").trim() || "Unspecified"; const name = raw.replace(/^Social Media\s*[:–—-]\s*/i, "").trim() || "Social Media"; counts[name] = (counts[name] ?? 0) + 1; return counts; }, {});
    const sourceRows = [...standardLeadSources, ...Object.keys(sourceCounts).filter((name) => !standardLeadSources.includes(name) && name !== "Unspecified").sort((a, b) => a.localeCompare(b)), ...(sourceCounts.Unspecified ? ["Unspecified"] : [])].map((name) => [name, sourceCounts[name] ?? 0] as [string, number]);
    const openLeads = leads.filter((row) => row.stage !== "won" && row.stage !== "lost");
    const closedLeads = leads.filter((row) => row.stage === "won" || row.stage === "lost");
    const pipeline = byCurrency(openLeads.map((row) => ({ currency: row.budget_currency || "USD", amount: row.budget_max ?? row.budget_min ?? 0 })), "amount");
    return { leads, clients, projects, payments, proposals, activity, overdue, sourceRows, openLeads, closedLeads, winRate: closedLeads.length ? Math.round(leads.filter((row) => row.stage === "won").length / closedLeads.length * 100) : null, pipeline, cash: byCurrency(payments, "amount"), contracted: byCurrency(projects, "agreed_amount") };
  }, [data, from, to, now]);
  function setPreset(value: string) { const start = value === "30d" ? shiftDays(now, -29) : value === "6m" ? `${Number(now.slice(0, 4)) - (Number(now.slice(5, 7)) <= 5 ? 1 : 0)}-${String(((Number(now.slice(5, 7)) + 6) % 12) + 1).padStart(2, "0")}-01` : defaultFrom; setParams({ from: start, to: now, preset: value }); setPickerReset((current) => current + 1); setRangeError(""); rangeRef.current?.removeAttribute("open"); }
  function submitRange(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const rangeFrom = String(form.get("from") ?? ""); const rangeTo = String(form.get("to") ?? ""); if (!valid(rangeFrom) || !valid(rangeTo) || rangeFrom > rangeTo) { setRangeError("Choose a valid start and end date."); return; } setParams({ from: rangeFrom, to: rangeTo, preset: "custom" }); setPickerReset((current) => current + 1); setRangeError(""); rangeRef.current?.removeAttribute("open"); }
  function exportCsv() {
    if (!report || loadError) return;
    setExportMessage("Preparing report…");
    try {
      const rows: unknown[][] = [["Section", "Measure", "Value", "Currency"], ["Range", "From", from, ""], ["Range", "To", to, ""], ["Summary", "Leads created", report.leads.length, ""], ["Summary", "Clients added", report.clients.length, ""], ["Summary", "Projects created", report.projects.length, ""], ["Summary", "Sent proposal versions", report.proposals.length, ""], ["Summary", "Overdue tasks as of today", report.overdue, ""], ...Object.entries(stageLabels).map(([key, label]) => ["Lead stage snapshot", label, report.leads.filter((row) => row.stage === key).length, ""]), ...report.sourceRows.map(([name, count]) => ["Lead source", name, count, ""]), ...Object.entries(statusLabels).map(([key, label]) => ["Project status snapshot", label, report.projects.filter((row) => row.status === key).length, ""]), ...report.contracted.map(([currency, amount]) => ["Contracted value", "Agreed project amount", amount.toFixed(2), currency]), ...report.cash.map(([currency, amount]) => ["Cash received", "Recorded payments", amount.toFixed(2), currency])];
      const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `strataforge-report-${from}-to-${to}.csv`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage("Report exported.");
    } catch { setExportMessage("Report couldn’t be exported. Try again."); }
  }
  const projectById = new Map(data?.projects.map((row) => [row.id, row]) ?? []);
  const clientById = new Map(data?.clients.map((row) => [row.id, row]) ?? []);
  type ClientContract = { clientId: string; projects: number; totals: Record<string, number> };
  const clientContracts = report ? Array.from(report.projects.reduce((map: Map<string, ClientContract>, project: any) => { const current: ClientContract = map.get(project.client_id) ?? { clientId: project.client_id, projects: 0, totals: {} }; current.projects++; current.totals[project.currency] = (current.totals[project.currency] ?? 0) + Number(project.agreed_amount); map.set(project.client_id, current); return map; }, new Map<string, ClientContract>()).values()).sort((a, b) => b.projects - a.projects).slice(0, 5) : [];
  return <div className="sf-reports-page"><div className="sf-reports-heading"><div><p className="sf-report-eyebrow">Workspace insights</p><h1>Reports</h1><p>Review your pipeline, projects, and recorded payments.</p></div><div className="sf-report-actions"><details className="sf-report-range" ref={rangeRef}><summary><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></svg><span className="sf-report-range-copy"><small>Report period</small><strong>{shortDate(from)} – {shortDate(to)}</strong></span><span className="sf-report-chevron-wrap" aria-hidden="true"><svg className="sf-report-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 7 5.5 5.5L15.5 7"/></svg></span></summary><div className="sf-report-range-menu"><div className="sf-report-presets"><button type="button" aria-pressed={activePreset === "month"} onClick={() => setPreset("month")}>This month</button><button type="button" aria-pressed={activePreset === "30d"} onClick={() => setPreset("30d")}>Last 30 days</button><button type="button" aria-pressed={activePreset === "6m"} onClick={() => setPreset("6m")}>Last 6 months</button></div><form onSubmit={submitRange}><div className="sf-report-date-field"><span>From</span><DatePicker key={`from-${from}-${pickerReset}`} name="from" defaultValue={from} label="Report start date"/></div><div className="sf-report-date-field"><span>To</span><DatePicker key={`to-${to}-${pickerReset}`} name="to" defaultValue={to} label="Report end date"/></div>{rangeError && <p role="alert">{rangeError}</p>}<button className="button button-primary">Apply range</button></form></div></details><button type="button" className="button button-primary sf-report-export" onClick={exportCsv} disabled={!report || !!loadError}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/></svg>Export report</button></div></div>
    {exportMessage && <p className="sf-report-export-message" role="status">{exportMessage}</p>}
    {loadError && <div className="sf-report-error" role="alert">Reports couldn’t load: {loadError} <button type="button" onClick={() => setReload((value) => value + 1)}>Retry</button></div>}
    {!report ? !loadError && <div className="sf-report-loading" role="status">Loading reports…</div> : <>
      <div className="sf-report-metrics"><div className="sf-report-metric orange"><span className="sf-report-metric-icon"><ReportIcon name="leads"/></span><div><span>Leads acquired</span><strong>{report.leads.length}</strong><small>Created in selected period</small></div></div><div className="sf-report-metric blue"><span className="sf-report-metric-icon"><ReportIcon name="cash"/></span><div><span>Open pipeline</span><strong>{moneySummary(report.pipeline)}</strong><small>{report.openLeads.length} open leads · estimated value</small></div></div><div className="sf-report-metric green"><span className="sf-report-metric-icon"><ReportIcon name="projects"/></span><div><span>Win rate</span><strong>{report.winRate === null ? "—" : `${report.winRate}%`}</strong><small>{report.leads.filter((row) => row.stage === "won").length} won / {report.closedLeads.length} closed leads</small></div></div><div className="sf-report-metric purple"><span className="sf-report-metric-icon"><ReportIcon name="clients"/></span><div><span>Won opportunity value</span><strong>{moneySummary(report.contracted)}</strong><small>{report.contracted.length ? report.contracted.map(([currency, amount]) => money(amount, currency)).join(" · ") : "No agreed project value in range"}</small></div></div></div>
      <div className="sf-report-grid sf-report-grid-top"><Panel title="Where conversations begin" note="Lead acquisition by source"><p className="sf-report-footnote">Leads in the selected period</p>{report.sourceRows.length ? <div className="sf-report-stage-list sf-report-source-list">{report.sourceRows.map(([name, count], index) => <div className="sf-report-stage-row" key={name}><span className="sf-report-stage-label">{name}</span><span className="sf-report-stage-track"><i className="sf-report-stage-bar" style={{ width: `${report.leads.length ? count / report.leads.length * 100 : 0}%`, background: colors[index % colors.length] }}/></span><small>{count} · {Math.round(count / report.leads.length * 100)}%</small></div>)}</div> : <Empty text="No leads were created in this date range."/>}</Panel><Panel title="Pipeline by stage" note="Selected leads"><div className="sf-report-stage-list sf-report-pipeline-list">{Object.entries(stageLabels).map(([key, label], index) => { const count = report.leads.filter((row) => row.stage === key).length; return <div className="sf-report-stage-row" key={key}><span className="sf-report-stage-label">{label}</span><span className="sf-report-stage-track"><i className="sf-report-stage-bar" style={{ width: `${report.leads.length ? count / report.leads.length * 100 : 0}%`, background: colors[index % colors.length] }}/></span><small>{count}</small></div>; })}</div></Panel></div>
      <div className="sf-report-grid sf-report-grid-middle"><Panel title="Cash received over time" note="Payment dates">{report.cash.length ? report.cash.map(([currency, total]) => { const series = buckets(report.payments.filter((row) => row.currency === currency), "received_at", from, to); return <div className="sf-report-chart-group" key={currency}><strong>{money(total, currency)}</strong><Trend values={series.values} labels={series.labels} description={`Cash received in ${currency}`} format={(value) => money(value, currency)}/></div>; }) : <Empty text="No payments were recorded in this date range."/>}</Panel><Panel title="Client contracts" note="Projects created in range">{clientContracts.length ? <div className="sf-report-table-scroll"><table><thead><tr><th>Client</th><th>Projects</th><th>Agreed value</th><th>Open</th></tr></thead><tbody>{clientContracts.map((row) => <tr key={row.clientId}><td>{clientById.get(row.clientId)?.name ?? "Client"}</td><td>{row.projects}</td><td>{Object.entries(row.totals).map(([currency, total]) => money(total, currency)).join(" · ")}</td><td><Link to={`/clients/${row.clientId}`}>View</Link></td></tr>)}</tbody></table></div> : <Empty text="No client contracts in this date range."/>}</Panel><Panel title="Recent project activity" note="In selected range">{report.activity.length ? <div className="sf-report-table-scroll"><table><thead><tr><th>Date</th><th>Project</th><th>Client</th><th>Activity</th><th>Actor</th></tr></thead><tbody>{report.activity.map((row) => { const project = projectById.get(row.subject_id); return <tr key={row.id}><td>{shortDate(localDate(row.occurred_at))}</td><td>{project ? <Link to={`/projects/${project.id}`}>{project.name}</Link> : "Archived project"}</td><td>{project ? clientById.get(project.client_id)?.name ?? "Client" : "—"}</td><td>{row.action === "insert" ? "Created" : row.action === "update" ? "Updated" : row.action}</td><td>{row.actor_user_id === userId ? "You" : "Workspace member"}</td></tr>; })}</tbody></table></div> : <Empty text="No project changes in this date range."/>}</Panel></div>
    </>}
  </div>;
}
