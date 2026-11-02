import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth, useToast, ErrorBox, Loading, Metric, PageHeader, StageDropdown } from "@/crm/shared";
import { RecordAvatar, RecordImages } from "@/crm/images";
import { DatePicker } from "@/crm/components";
import { createClient as db } from "@/lib/supabase/client";
import { MilestoneSelect, PaymentSchedule } from "@/PaymentSchedule";

const projectStatus: Record<string, string> = { planned: "Planned", in_progress: "In progress", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled" };
const moneyText = (amount: number | string, currency: string) => `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Not set";

export default function ProjectDetail() {
  const id = useLocation().pathname.split("/")[2];
  const { founder } = useAuth();
  const notify = useToast();
  const [data, setData] = useState<any>(null);
  const [loadError, setLoadError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [busy, setBusy] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);

  const load = useCallback(async () => {
    const workspaceId = founder!.workspaceId;
    setLoadError("");
    const [projectResult, tasksResult, initialPaymentsResult, schedulesResult] = await Promise.all([
      db().from("projects").select("*").eq("id", id).eq("workspace_id", workspaceId).maybeSingle(),
      db().from("tasks").select("id,title,status,due_at").eq("project_id", id).eq("workspace_id", workspaceId).is("archived_at", null).order("due_at", { ascending: true, nullsFirst: false }),
      db().from("payment_entries").select("id,payment_kind,amount,currency,received_at,reference,milestone_id").eq("project_id", id).eq("workspace_id", workspaceId).order("received_at", { ascending: false }),
      db().from("project_payment_schedules").select("id,version,status,balance_at_creation,currency,created_at").eq("project_id", id).eq("workspace_id", workspaceId).order("version", { ascending: false }),
    ]);
    if (projectResult.error) { setLoadError(projectResult.error.message); setData(null); return; }
    if (!projectResult.data) { setData(null); return; }
    const [clientResult, leadResult, proposalResult] = await Promise.all([
      db().from("clients").select("id,name").eq("id", projectResult.data.client_id).maybeSingle(),
      db().from("leads").select("id,company_name,contact_name").eq("id", projectResult.data.lead_id).maybeSingle(),
      db().from("proposals").select("id,version,scope_summary").eq("id", projectResult.data.accepted_proposal_id).maybeSingle(),
    ]);
    const isScheduleSchemaUnavailable = (queryError: any) => ["42P01", "42703", "PGRST204", "PGRST205"].includes(queryError?.code);
    const paymentSchemaUnavailable = isScheduleSchemaUnavailable(initialPaymentsResult.error);
    const scheduleSchemaUnavailable = isScheduleSchemaUnavailable(schedulesResult.error);
    const paymentsResult = paymentSchemaUnavailable
      ? await db().from("payment_entries").select("id,payment_kind,amount,currency,received_at,reference").eq("project_id", id).eq("workspace_id", workspaceId).order("received_at", { ascending: false })
      : initialPaymentsResult;
    const schedules = scheduleSchemaUnavailable ? [] : schedulesResult.data ?? [];
    const milestonesResult = schedules.length && !scheduleSchemaUnavailable
      ? await db().from("project_payment_milestones").select("id,schedule_id,position,title,calculation_type,calculation_value,scheduled_amount,currency,due_date").eq("project_id", id).eq("workspace_id", workspaceId).in("schedule_id", schedules.map((schedule: any) => schedule.id)).order("position")
      : { data: [], error: null };
    const milestoneSchemaUnavailable = isScheduleSchemaUnavailable(milestonesResult.error);
    const scheduleAvailable = !paymentSchemaUnavailable && !scheduleSchemaUnavailable && !milestoneSchemaUnavailable;
    const loadErrors = [tasksResult.error, paymentsResult.error, scheduleSchemaUnavailable ? null : schedulesResult.error, milestoneSchemaUnavailable ? null : milestonesResult.error].filter(Boolean);
    setLoadError(loadErrors.map((queryError: any) => queryError.message).join(" "));
    setData({ project: projectResult.data, tasks: tasksResult.data ?? [], payments: paymentsResult.data ?? [], schedules, milestones: milestonesResult.data ?? [], scheduleAvailable, client: clientResult.data, lead: leadResult.data, proposal: proposalResult.data });
  }, [founder, id]);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(status: string) {
    const transitions: Record<string, string[]> = { planned: ["in_progress", "on_hold"], in_progress: ["on_hold", "completed"], on_hold: ["in_progress"], completed: [], cancelled: [] };
    if (!transitions[data.project.status]?.includes(status)) { notify("That project status transition is not available.", true); return; }
    if (status === "completed" && !confirm("Confirm delivery work is complete?")) return;
    setBusy(true);
    const { data: updated, error: updateError } = await db().from("projects").update({ status }).eq("id", id).eq("workspace_id", founder!.workspaceId).eq("status", data.project.status).select("id").maybeSingle();
    setBusy(false);
    if (updateError || !updated) notify(updateError?.message ?? "The project status changed elsewhere. Refresh and try again.", true); else { notify("Project status updated."); await load(); }
  }

  async function saveSchedule(projectId: string, rows: Array<{ title: string; calculation_type: string; calculation_value: number; due_date: string }>) {
    const { error: rpcError } = await db().rpc("save_project_payment_schedule", { p_project_id: projectId, p_milestones: rows });
    if (rpcError) return { error: rpcError.message };
    notify("Payment schedule saved.");
    return {};
  }

  async function addPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setPaymentError("");
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const received = String(form.get("received_on"));
    const milestoneId = String(form.get("milestone_id") ?? "");
    const paid = data.payments.reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);
    if (!Number.isFinite(amount) || amount <= 0 || Math.round((paid + amount) * 100) > Math.round(Number(data.project.agreed_amount) * 100)) {
      setPaymentError("Enter an amount within the remaining project balance."); setBusy(false); return;
    }
    const milestone = data.milestones.find((item: any) => item.id === milestoneId);
    if (data.activeSchedule && !milestone) { setPaymentError("Choose a scheduled milestone."); setBusy(false); return; }
    if (milestone) {
      const milestonePaid = data.payments.filter((payment: any) => payment.milestone_id === milestone.id).reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);
      if (Math.round((milestonePaid + amount) * 100) > Math.round(Number(milestone.scheduled_amount) * 100)) { setPaymentError("Payment exceeds the remaining amount for this milestone."); setBusy(false); return; }
    }
    const payment = { workspace_id: founder!.workspaceId, lead_id: data.project.lead_id, proposal_id: data.project.accepted_proposal_id, project_id: id, payment_kind: "progress", amount, currency: data.project.currency, received_at: `${received}T12:00:00.000Z`, reference: String(form.get("reference")).trim(), recorded_by: founder!.userId, created_by: founder!.userId };
    const paymentEntry = { ...payment, ...(data.scheduleAvailable ? { milestone_id: milestone?.id ?? null } : {}) };
    const { error: insertError } = await db().from("payment_entries").insert(paymentEntry);
    setBusy(false);
    if (insertError) { setPaymentError(insertError.message); return; }
    notify("Payment recorded."); event.currentTarget.reset(); await load();
  }

  if (!data) return <><PageHeader eyebrow="Delivery workspace" title="Project" description="Review delivery, agreement, and payment history." action={<Link className="button button-secondary" to="/projects">← Projects</Link>}/>{loadError ? <section className="record-list-panel project-load-error"><ErrorBox>{loadError}</ErrorBox></section> : <Loading label="Loading project…"/>}</>;
  const totalPaid = data.payments.reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);
  const activeSchedule = data.scheduleAvailable ? data.schedules.find((schedule: any) => schedule.status === "active") ?? null : null;
  data.activeSchedule = activeSchedule;
  const activeMilestones = data.milestones.filter((item: any) => item.schedule_id === activeSchedule?.id);
  const remaining = Math.max(0, Number(data.project.agreed_amount) - totalPaid);

  return <><PageHeader eyebrow="Delivery workspace" title={data.project.name} description={`${data.client?.name ?? "Client"} · ${data.lead?.company_name ?? "Website project"}`} avatar={<RecordAvatar recordType="project" recordId={id} name={data.client?.name ?? data.project.name} className="project-heading-avatar" refreshKey={avatarVersion} fallbackClientId={data.project.client_id} fallbackLeadIds={data.project.lead_id ? [data.project.lead_id] : []}/>} action={<div className="project-header-actions"><Link className="button button-primary" to={`/team/tasks?project=${encodeURIComponent(id)}`}>View tasks</Link><Link className="button button-secondary" to="/projects">← Projects</Link></div>}/><section className="dashboard-metrics"><Metric label="Project status" value={projectStatus[data.project.status]} hint="Delivery progress"/><Metric label="Agreed value" value={moneyText(data.project.agreed_amount, data.project.currency)} hint="Accepted proposal" tone="blue" icon="$"/><Metric label="Payments received" value={moneyText(totalPaid, data.project.currency)} hint="Recorded receipts" tone="green" icon="✓"/><Metric label="Remaining balance" value={moneyText(remaining, data.project.currency)} hint="Agreed value less receipts" tone="purple" icon="↗"/></section>{loadError && <section className="project-load-warning"><ErrorBox>{loadError}</ErrorBox></section>}<div className="dashboard-grid project-workspace-grid"><section className="record-list-panel project-panel project-delivery-panel"><div className="project-panel-heading"><div><p className="eyebrow">Delivery workspace</p><h2>Delivery plan</h2></div><span className={`project-status-pill project-status-${data.project.status}`}>{projectStatus[data.project.status]}</span></div><div className="project-date-grid"><div><small>Start date</small><strong>{dateText(data.project.start_date)}</strong></div><div><small>Target date</small><strong>{dateText(data.project.target_date)}</strong></div></div><label className="field project-status-field"><span>Update project status</span><StageDropdown value={data.project.status} options={[data.project.status, ...(data.project.status === "planned" ? ["in_progress"] : data.project.status === "in_progress" ? ["on_hold", "completed"] : data.project.status === "on_hold" ? ["in_progress"] : [])]} optionLabels={projectStatus} disabled={busy} label="Update project status" onChange={(status) => void updateStatus(status)} minMenuWidth={220} className="project-status-dropdown"/></label><div className="project-scope-block"><h3>Accepted scope</h3><p>{data.proposal?.scope_summary ?? "No proposal scope found."}</p><Link to={`/leads/${data.project.lead_id}`}>Lead: {data.lead?.company_name ?? "View lead"} <span aria-hidden="true">→</span></Link></div></section><section className="record-list-panel project-panel project-tasks-panel"><div className="project-panel-heading"><div><p className="eyebrow">Delivery work</p><h2>Tasks</h2></div><span className="project-panel-count">{data.tasks.length}</span></div>{data.tasks.length ? <ul className="project-task-list">{data.tasks.map((task: any) => <li key={task.id} className={task.status === "completed" ? "is-complete" : ""}><span className="project-task-indicator" aria-hidden="true">{task.status === "completed" ? "✓" : ""}</span><div><strong>{task.title}</strong><small>{task.due_at ? `Due ${dateText(task.due_at)}` : "No due date"}</small></div><span className={`project-task-status is-${task.status}`}>{task.status.replaceAll("_", " ")}</span></li>)}</ul> : <div className="project-empty-state"><span aria-hidden="true">✓</span><strong>No project tasks yet</strong><p>Tasks added to this project will show here.</p></div>}</section><RecordImages recordType="project" recordId={id} onImagesChanged={()=>setAvatarVersion((value)=>value+1)}/><section className="record-list-panel project-panel project-payment-history"><div className="project-panel-heading"><div><p className="eyebrow">Financial activity</p><h2>Payment history</h2></div><span className="project-panel-count">{data.payments.length}</span></div>{data.payments.length ? <ul className="project-payment-list">{data.payments.map((payment: any) => { const milestone = data.milestones.find((item: any) => item.id === payment.milestone_id); return <li key={payment.id}><span className="project-payment-mark" aria-hidden="true">✓</span><div><strong>{payment.payment_kind === "deposit" ? "Deposit received" : "Progress payment"}</strong><small>{dateText(payment.received_at)}{milestone ? ` · ${milestone.title}` : ""}{payment.reference ? ` · ${payment.reference}` : ""}</small></div><strong className="project-payment-amount">{moneyText(payment.amount, payment.currency)}</strong></li>; })}</ul> : <div className="project-empty-state"><span aria-hidden="true">$</span><strong>No payments recorded</strong><p>Received deposits and progress payments will appear here.</p></div>}</section><section className={`record-list-panel project-panel project-payment-entry${remaining <= 0.005 ? " is-settled" : ""}`}><div className="project-panel-heading"><div><p className="eyebrow">Billing</p><h2>{remaining <= 0.005 ? "Paid in full" : "Record progress payment"}</h2><p>Remaining balance: <strong>{moneyText(remaining, data.project.currency)}</strong></p></div></div>{data.project.status === "cancelled" ? <p>Payments are disabled for cancelled projects.</p> : remaining <= 0.005 ? <div className="project-balance-settled" role="status"><span aria-hidden="true">✓</span><div><strong>Project balance settled</strong><p>The agreed amount has been received. No further payment is due.</p></div></div> : activeSchedule && activeMilestones.length === 0 ? <p>No milestones were found for the active schedule.</p> : <form className="record-form project-payment-form" onSubmit={(event) => void addPayment(event)}><label className="field"><span>Amount ({data.project.currency})</span><input type="number" name="amount" min="0.01" step=".01" max={remaining} required/></label>{activeSchedule && <MilestoneSelect milestones={activeMilestones} payments={data.payments} currency={data.project.currency}/>}<label className="field"><span>Date received</span><DatePicker name="received_on" defaultValue={new Date().toISOString().slice(0, 10)} label="Date received"/></label><label className="field"><span>Payment reference</span><input name="reference" maxLength={1000}/></label>{paymentError && <ErrorBox>{paymentError}</ErrorBox>}<button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Record payment"}</button></form>}</section>{data.scheduleAvailable ? ((data.project.status !== "completed" && data.project.status !== "cancelled" || activeSchedule) && <PaymentSchedule projectId={id} agreedAmount={Number(data.project.agreed_amount)} paidAmount={totalPaid} currency={data.project.currency} activeSchedule={activeSchedule} milestones={activeMilestones} payments={data.payments} onSaved={load} save={saveSchedule} canEdit={data.project.status !== "completed" && data.project.status !== "cancelled"}/>) : data.project.status !== "completed" && data.project.status !== "cancelled" && <section className="record-list-panel project-panel project-schedule-unavailable"><h2>Payment schedules unavailable</h2><p>Progress payments can still be recorded without a scheduled milestone.</p></section>}{data.schedules.filter((schedule: any) => schedule.status !== "active").map((schedule: any) => <section className="record-list-panel" key={schedule.id}><h2>Payment schedule · v{schedule.version} (superseded)</h2><p>Saved {dateText(schedule.created_at)} · {moneyText(schedule.balance_at_creation, schedule.currency)}</p>{data.milestones.filter((item: any) => item.schedule_id === schedule.id).map((item: any) => <p key={item.id}>{item.title} · {moneyText(item.scheduled_amount, item.currency)} · due {dateText(item.due_date)}</p>)}</section>)}</div></>;
}
