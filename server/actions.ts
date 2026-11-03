import { ApiError, normalizePhrase, optionalString, requireString, requireUuid, type ActionRow, type Principal } from "./shared.js";

const routine = new Set(["create_lead", "update_lead", "create_client", "update_client", "create_task", "create_project_task", "update_task", "set_task_status", "claim_project_task", "unassign_project_task", "set_project_task_status", "set_project_task_stage", "create_proposal_draft"]);
const kinds = new Set([...routine, "archive_lead", "archive_client", "archive_task", "archive_project", "delete_draft_proposal", "mark_proposal_sent", "accept_proposal", "record_deposit", "convert_lead", "set_project_status", "record_progress_payment", "save_payment_schedule", "grant_access", "set_member_role", "remove_access"]);
const targetByKind: Record<string, [string, string]> = {
  update_lead: ["leads", "lead_id"], archive_lead: ["leads", "lead_id"],
  update_client: ["clients", "client_id"], archive_client: ["clients", "client_id"],
  update_task: ["tasks", "task_id"], set_task_status: ["tasks", "task_id"], archive_task: ["tasks", "task_id"],
  claim_project_task: ["tasks", "task_id"], unassign_project_task: ["tasks", "task_id"],
  set_project_task_status: ["tasks", "task_id"], set_project_task_stage: ["tasks", "task_id"],
  create_project_task: ["projects", "project_id"], create_proposal_draft: ["leads", "lead_id"],
  delete_draft_proposal: ["proposals", "proposal_id"], mark_proposal_sent: ["proposals", "proposal_id"],
  accept_proposal: ["proposals", "proposal_id"], record_deposit: ["proposals", "proposal_id"],
  convert_lead: ["leads", "lead_id"], set_project_status: ["projects", "project_id"],
  archive_project: ["projects", "project_id"], record_progress_payment: ["projects", "project_id"],
  save_payment_schedule: ["projects", "project_id"]
};

function numberValue(value: unknown, label: string): number {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") throw new ApiError(400, `Enter a valid ${label}.`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || Math.abs(Math.round(number * 100) - number * 100) > 1e-6) throw new ApiError(400, `Enter a valid ${label}.`);
  return number;
}
function isoDate(value: unknown, label: string): string {
  const text = requireString(value, label, 40);
  const parsed = new Date(`${text}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new ApiError(400, `Enter a valid ${label}.`);
  return text;
}
function currency(value: unknown): string {
  const text = requireString(value, "currency", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(text)) throw new ApiError(400, "Enter a three-letter currency code.");
  return text;
}
function emailValue(value: unknown, label: string): string {
  const text = requireString(value, label, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new ApiError(400, `Enter a valid ${label}.`);
  return text;
}
function changes(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new ApiError(400, "Specify the fields to change.");
  const input = value as Record<string, unknown>;
  const output = Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(output).length || Object.keys(output).length !== Object.keys(input).length) throw new ApiError(400, "The requested fields are not supported.");
  return output;
}

async function record(principal: Principal, table: string, id: string): Promise<any> {
  const { data, error } = await principal.db.from(table).select("*").eq("workspace_id", principal.workspaceId).eq("id", id).maybeSingle();
  if (error || !data || ("archived_at" in data && data.archived_at)) throw new ApiError(404, "The target record is unavailable or outside your workspace.");
  return data;
}

export async function prepareAction(principal: Principal, kind: string, raw: Record<string, unknown>) {
  if (!kinds.has(kind)) throw new ApiError(400, "The assistant requested an unsupported action.");
  const p: Record<string, unknown> = {};
  let name = "";
  let target: any = null;
  if (targetByKind[kind]) {
    const [table, key] = targetByKind[kind];
    p[key] = requireUuid(raw[key], table.slice(0, -1));
    target = await record(principal, table, String(p[key]));
    p.expected_updated_at = target.updated_at ?? null;
    name = target.company_name || target.name || target.title || `version ${target.version}` || "record";
  }
  switch (kind) {
    case "create_lead":
      p.company_name = requireString(raw.company_name, "company name", 180);
      p.contact_name = requireString(raw.contact_name, "contact name", 180);
      p.email = emailValue(raw.email, "email");
      p.website_brief = requireString(raw.website_brief, "website brief", 10000);
      p.phone = optionalString(raw.phone, 50);
      p.next_follow_up_at = raw.next_follow_up_at ? isoDate(raw.next_follow_up_at, "follow-up date") : null;
      name = String(p.company_name);
      break;
    case "update_lead":
      p.changes = changes(raw.changes, ["company_name", "contact_name", "email", "phone", "website_brief", "notes", "project_type", "timeline", "next_follow_up_at", "budget_min", "budget_max", "budget_currency", "stage"]);
      if ("email" in (p.changes as any)) (p.changes as any).email = emailValue((p.changes as any).email, "email");
      if ("next_follow_up_at" in (p.changes as any) && (p.changes as any).next_follow_up_at) (p.changes as any).next_follow_up_at = `${isoDate((p.changes as any).next_follow_up_at, "follow-up date")}T12:00:00.000Z`;
      for (const key of ["budget_min", "budget_max"]) if (key in (p.changes as any) && (p.changes as any)[key] != null) (p.changes as any)[key] = numberValue((p.changes as any)[key], key);
      if ("budget_currency" in (p.changes as any) && (p.changes as any).budget_currency) (p.changes as any).budget_currency = currency((p.changes as any).budget_currency);
      if ("stage" in (p.changes as any) && !["new", "contacted", "discovery", "proposal_sent"].includes(String((p.changes as any).stage))) throw new ApiError(400, "Use the dedicated workflow for this lead stage.");
      if ((p.changes as any).stage === "proposal_sent") {
        const { data: sent, error } = await principal.db.from("proposals").select("id").eq("workspace_id", principal.workspaceId).eq("lead_id", p.lead_id).eq("status", "sent").limit(1).maybeSingle();
        if (error || !sent) throw new ApiError(400, "Mark a saved proposal as sent before moving this lead to Proposal sent.");
      }
      break;
    case "create_client":
      p.name = requireString(raw.name, "client name", 180);
      p.client_type = raw.client_type === "person" ? "person" : "organization";
      p.contact_name = optionalString(raw.contact_name, 180);
      p.contact_email = raw.contact_email ? emailValue(raw.contact_email, "contact email") : null;
      if (p.contact_email && !p.contact_name) throw new ApiError(400, "A contact name is needed with the contact email.");
      name = String(p.name);
      break;
    case "update_client":
      p.changes = changes(raw.changes, ["name", "notes", "website", "relationship_status", "tags"]);
      break;
    case "create_task":
    case "create_project_task":
      p.title = requireString(raw.title, "task title", 240);
      p.description = optionalString(raw.description, 5000);
      p.due_at = raw.due_at ? isoDate(raw.due_at, "due date") : null;
      if (kind === "create_task") {
        p.lead_id = raw.lead_id ? requireUuid(raw.lead_id, "lead") : null;
        p.client_id = raw.client_id ? requireUuid(raw.client_id, "client") : null;
        if (p.lead_id && p.client_id) throw new ApiError(400, "Choose only one related record.");
        if (p.lead_id) await record(principal, "leads", String(p.lead_id));
        if (p.client_id) await record(principal, "clients", String(p.client_id));
      }
      name = String(p.title);
      break;
    case "update_task":
      p.changes = changes(raw.changes, ["title", "description", "due_at"]);
      if ("due_at" in (p.changes as any) && (p.changes as any).due_at) (p.changes as any).due_at = `${isoDate((p.changes as any).due_at, "due date")}T12:00:00.000Z`;
      break;
    case "set_task_status":
      if (target.project_id) throw new ApiError(400, "Use the project delivery task status workflow.");
      p.status = requireString(raw.status, "task status", 20);
      if (!["open", "in_progress", "completed", "cancelled"].includes(String(p.status))) throw new ApiError(400, "Choose a valid task status.");
      break;
    case "claim_project_task":
    case "unassign_project_task":
      if (!target.project_id) throw new ApiError(400, "Choose a project delivery task.");
      break;
    case "set_project_task_status":
      if (!target.project_id) throw new ApiError(400, "Choose a project delivery task.");
      p.status = requireString(raw.status, "task status", 20);
      if (!["open", "in_progress", "completed"].includes(String(p.status))) throw new ApiError(400, "Choose a valid project task status.");
      break;
    case "set_project_task_stage":
      if (!target.project_id) throw new ApiError(400, "Choose a project delivery task.");
      p.stage = requireString(raw.stage, "development stage", 30);
      if (!["new_feature", "planned", "building", "testing", "deploy"].includes(String(p.stage))) throw new ApiError(400, "Choose a valid development stage.");
      break;
    case "create_proposal_draft":
      p.scope_summary = requireString(raw.scope_summary, "proposal scope", 20000);
      p.amount = numberValue(raw.amount, "proposed amount");
      p.currency = currency(raw.currency);
      break;
    case "delete_draft_proposal":
      if (target.status !== "draft") throw new ApiError(400, "Only a draft proposal can be deleted.");
      break;
    case "mark_proposal_sent":
      if (target.status !== "draft") throw new ApiError(400, "Only a draft proposal can be marked sent.");
      break;
    case "accept_proposal":
      if (target.status !== "sent") throw new ApiError(400, "Only a sent proposal can be accepted.");
      p.acceptance_note = requireString(raw.acceptance_note, "acceptance note", 4000);
      p.evidence_type = requireString(raw.evidence_type, "evidence type", 30);
      if (!["signed_document", "approval_message"].includes(String(p.evidence_type))) throw new ApiError(400, "Choose a valid acceptance evidence type.");
      p.evidence_ref = requireString(raw.evidence_ref, "evidence reference", 2000);
      break;
    case "record_deposit":
      if (target.status !== "accepted") throw new ApiError(400, "The proposal must be accepted first.");
      p.amount = numberValue(raw.amount, "deposit amount");
      if (Number(p.amount) <= 0 || Number(p.amount) > Number(target.amount)) throw new ApiError(400, "Deposit must be within the accepted proposal amount.");
      p.received_at = isoDate(raw.received_at, "received date");
      p.reference = requireString(raw.reference, "receipt reference", 1000);
      break;
    case "convert_lead":
      p.name = requireString(raw.name, "project name", 180);
      p.start_date = raw.start_date ? isoDate(raw.start_date, "start date") : null;
      p.target_date = raw.target_date ? isoDate(raw.target_date, "target date") : null;
      break;
    case "set_project_status":
      p.status = requireString(raw.status, "project status", 30);
      if (!({ planned: ["in_progress"], in_progress: ["on_hold", "completed"], on_hold: ["in_progress"] } as Record<string, string[]>)[target.status]?.includes(String(p.status))) throw new ApiError(400, "This project status transition is unavailable.");
      break;
    case "record_progress_payment":
      p.amount = numberValue(raw.amount, "payment amount");
      if (Number(p.amount) <= 0) throw new ApiError(400, "Payment amount must be positive.");
      p.received_at = isoDate(raw.received_at, "received date");
      p.reference = requireString(raw.reference, "payment reference", 1000);
      p.milestone_id = raw.milestone_id ? requireUuid(raw.milestone_id, "milestone") : null;
      break;
    case "save_payment_schedule":
      if (!Array.isArray(raw.milestones) || raw.milestones.length < 1 || raw.milestones.length > 20) throw new ApiError(400, "Provide one to twenty payment milestones.");
      p.milestones = raw.milestones;
      break;
    case "grant_access":
      p.email = emailValue(raw.email, "account email");
      p.role = requireString(raw.role, "role", 20);
      if (!["admin", "member", "developer"].includes(String(p.role))) throw new ApiError(400, "Choose a valid role.");
      name = String(p.email);
      break;
    case "set_member_role":
    case "remove_access":
      p.user_id = requireUuid(raw.user_id, "workspace member");
      if (p.user_id === principal.userId) throw new ApiError(400, "You cannot change your own workspace access.");
      const { data: members, error } = await principal.db.rpc("admin_list_workspace_members", { p_workspace_id: principal.workspaceId });
      if (error) throw new ApiError(503, "Workspace members could not be checked.");
      const member = (members || []).find((item: any) => item.user_id === p.user_id && item.active);
      if (!member) throw new ApiError(404, "Active workspace member not found.");
      name = member.email;
      p.expected_role = member.role;
      if (kind === "set_member_role") {
        p.role = requireString(raw.role, "role", 20);
        if (!["admin", "member", "developer"].includes(String(p.role))) throw new ApiError(400, "Choose a valid role.");
      }
      break;
  }
  const verb = kind.replaceAll("_", " ");
  const detail = kind === "create_proposal_draft" ? ` · ${p.currency} ${p.amount}` :
    kind === "record_deposit" || kind === "record_progress_payment" ? ` · ${p.amount} received ${p.received_at}` :
    kind === "set_project_status" || kind === "set_task_status" ? ` → ${p.status}` : "";
  const summary = `${verb}: ${name}${detail}`.slice(0, 500);
  const financialLeadEdit = kind === "update_lead" && ["budget_min", "budget_max", "budget_currency"].some((field) => field in (p.changes as Record<string, unknown>));
  const voicePhrase = routine.has(kind) && !financialLeadEdit ? `confirm ${verb} ${name}`.toLowerCase() : null;
  return { kind, payload: p, summary, voicePhrase };
}

async function checkedUpdate(principal: Principal, table: string, id: string, expected: unknown, values: Record<string, unknown>) {
  let query = principal.db.from(table).update(values).eq("workspace_id", principal.workspaceId).eq("id", id);
  if (expected) query = query.eq("updated_at", expected);
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) throw new ApiError(409, "The record changed or the update was rejected. Refresh and try again.");
  return id;
}

export async function executeAction(principal: Principal, action: ActionRow): Promise<{ message: string; href?: string; id?: string }> {
  const p = action.payload;
  const { db, workspaceId, userId } = principal;
  const targetInfo = targetByKind[action.kind];
  if (targetInfo) {
    const current = await record(principal, targetInfo[0], String(p[targetInfo[1]]));
    if ((current.updated_at ?? null) !== (p.expected_updated_at ?? null)) throw new ApiError(409, "The target changed since the proposal. Ask the assistant to prepare it again.");
  }
  if (action.kind === "set_member_role" || action.kind === "remove_access") {
    const { data: members, error } = await db.rpc("admin_list_workspace_members", { p_workspace_id: workspaceId });
    const current = (members || []).find((item: any) => item.user_id === p.user_id && item.active);
    if (error || !current || current.role !== p.expected_role) throw new ApiError(409, "Workspace access changed since this proposal. Ask the assistant to prepare it again.");
  }
  let id: string | undefined;
  let href: string | undefined;
  let result: any;
  switch (action.kind) {
    case "create_lead":
      result = await db.from("leads").insert({ workspace_id: workspaceId, company_name: p.company_name, contact_name: p.contact_name, email: p.email, phone: p.phone, website_brief: p.website_brief, next_follow_up_at: p.next_follow_up_at ? `${p.next_follow_up_at}T12:00:00.000Z` : null, owner_user_id: userId, created_by: userId }).select("id").single();
      id = result.data?.id; href = id ? `/leads/${id}` : undefined; break;
    case "update_lead":
      id = await checkedUpdate(principal, "leads", String(p.lead_id), p.expected_updated_at, p.changes as any); href = `/leads/${id}`; break;
    case "archive_lead":
      id = await checkedUpdate(principal, "leads", String(p.lead_id), p.expected_updated_at, { archived_at: new Date().toISOString() }); href = "/leads"; break;
    case "create_client":
      result = await db.rpc("create_client_with_primary_contact", { p_workspace_id: workspaceId, p_name: p.name, p_client_type: p.client_type, p_relationship_status: "active", p_website: null, p_notes: null, p_contact_name: p.contact_name, p_contact_title: null, p_contact_email: p.contact_email, p_contact_phone: null });
      id = result.data; href = id ? `/clients/${id}` : undefined; break;
    case "update_client":
      id = await checkedUpdate(principal, "clients", String(p.client_id), p.expected_updated_at, p.changes as any); href = `/clients/${id}`; break;
    case "archive_client":
      id = await checkedUpdate(principal, "clients", String(p.client_id), p.expected_updated_at, { archived_at: new Date().toISOString() }); href = "/clients"; break;
    case "create_task":
      result = await db.from("tasks").insert({ workspace_id: workspaceId, title: p.title, description: p.description, due_at: p.due_at ? `${p.due_at}T12:00:00.000Z` : null, lead_id: p.lead_id, client_id: p.client_id, project_id: null, assignee_user_id: userId, created_by: userId }).select("id").single();
      id = result.data?.id; href = "/tasks-deals?view=tasks"; break;
    case "create_project_task":
      result = await db.rpc("create_project_delivery_task", { p_project_id: p.project_id, p_title: p.title, p_description: p.description, p_due_at: p.due_at ? `${p.due_at}T12:00:00.000Z` : null });
      id = result.data; href = `/projects/${p.project_id}`; break;
    case "update_task":
      id = await checkedUpdate(principal, "tasks", String(p.task_id), p.expected_updated_at, p.changes as any); href = "/tasks-deals?view=tasks"; break;
    case "set_task_status":
      id = await checkedUpdate(principal, "tasks", String(p.task_id), p.expected_updated_at, { status: p.status, completed_at: p.status === "completed" ? new Date().toISOString() : null }); href = "/tasks-deals?view=tasks"; break;
    case "claim_project_task":
      result = await db.rpc("claim_project_delivery_task", { p_task_id: p.task_id }); id = String(p.task_id); href = "/team/tasks"; break;
    case "unassign_project_task":
      result = await db.rpc("unassign_project_delivery_task", { p_task_id: p.task_id }); id = String(p.task_id); href = "/team/tasks"; break;
    case "set_project_task_status":
      result = await db.rpc("set_project_delivery_task_status", { p_task_id: p.task_id, p_status: p.status }); id = String(p.task_id); href = "/team/tasks"; break;
    case "set_project_task_stage":
      result = await db.rpc("set_project_delivery_task_stage", { p_task_id: p.task_id, p_stage: p.stage }); id = String(p.task_id); href = "/team/tasks"; break;
    case "archive_task":
      id = await checkedUpdate(principal, "tasks", String(p.task_id), p.expected_updated_at, { archived_at: new Date().toISOString() }); href = "/tasks-deals?view=tasks"; break;
    case "create_proposal_draft": {
      const { data: latest, error: lookupError } = await db.from("proposals").select("version").eq("workspace_id", workspaceId).eq("lead_id", p.lead_id).order("version", { ascending: false }).limit(1).maybeSingle();
      if (lookupError) throw new ApiError(503, "Proposal history could not be checked.");
      result = await db.from("proposals").insert({ workspace_id: workspaceId, lead_id: p.lead_id, version: (latest?.version ?? 0) + 1, scope_summary: p.scope_summary, amount: p.amount, currency: p.currency, created_by: userId }).select("id").single();
      id = result.data?.id; href = `/leads/${p.lead_id}`; break;
    }
    case "delete_draft_proposal":
      result = await db.from("proposals").delete().eq("workspace_id", workspaceId).eq("id", p.proposal_id).eq("status", "draft").eq("updated_at", p.expected_updated_at).select("id").maybeSingle();
      id = result.data?.id; href = "/leads"; break;
    case "mark_proposal_sent":
    case "accept_proposal":
    case "convert_lead":
      result = await db.rpc("ai_complete_sales_action", { p_workspace_id: workspaceId, p_kind: action.kind, p_payload: p });
      id = result.data?.id || result.data; href = action.kind === "convert_lead" && id ? `/projects/${id}` : `/leads/${action.kind === "convert_lead" ? p.lead_id : (await record(principal, "proposals", String(p.proposal_id))).lead_id}`; break;
    case "record_deposit": {
      const proposal = await record(principal, "proposals", String(p.proposal_id));
      result = await db.from("payment_entries").insert({ workspace_id: workspaceId, lead_id: proposal.lead_id, proposal_id: proposal.id, payment_kind: "deposit", amount: p.amount, currency: proposal.currency, received_at: `${p.received_at}T12:00:00.000Z`, reference: p.reference, recorded_by: userId, created_by: userId }).select("id").single();
      id = result.data?.id; href = `/leads/${proposal.lead_id}`; break;
    }
    case "set_project_status":
      id = await checkedUpdate(principal, "projects", String(p.project_id), p.expected_updated_at, { status: p.status }); href = `/projects/${id}`; break;
    case "archive_project":
      id = await checkedUpdate(principal, "projects", String(p.project_id), p.expected_updated_at, { archived_at: new Date().toISOString() }); href = "/projects"; break;
    case "record_progress_payment": {
      const project = await record(principal, "projects", String(p.project_id));
      result = await db.from("payment_entries").insert({ workspace_id: workspaceId, lead_id: project.lead_id, proposal_id: project.accepted_proposal_id, project_id: project.id, payment_kind: "progress", amount: p.amount, currency: project.currency, received_at: `${p.received_at}T12:00:00.000Z`, reference: p.reference, milestone_id: p.milestone_id, recorded_by: userId, created_by: userId }).select("id").single();
      id = result.data?.id; href = `/projects/${project.id}`; break;
    }
    case "save_payment_schedule":
      result = await db.rpc("save_project_payment_schedule", { p_project_id: p.project_id, p_milestones: p.milestones });
      href = `/projects/${p.project_id}`; break;
    case "grant_access":
      result = await db.rpc("admin_grant_workspace_access", { p_workspace_id: workspaceId, p_email: p.email, p_role: p.role });
      id = result.data; href = "/access"; break;
    case "set_member_role":
      result = await db.rpc("admin_set_workspace_member_role", { p_workspace_id: workspaceId, p_user_id: p.user_id, p_role: p.role });
      href = "/access"; break;
    case "remove_access":
      result = await db.rpc("admin_remove_workspace_access", { p_workspace_id: workspaceId, p_user_id: p.user_id });
      href = "/access"; break;
    default: throw new ApiError(400, "Unsupported action.");
  }
  if (result?.error || (result?.data === false && ["claim_project_task", "unassign_project_task", "set_project_task_status", "set_project_task_stage"].includes(action.kind)) || ("data" in (result || {}) && result.data == null && ["create_lead", "create_client", "create_task", "create_project_task", "create_proposal_draft", "delete_draft_proposal", "record_deposit", "record_progress_payment", "grant_access", "convert_lead"].includes(action.kind))) {
    throw new ApiError(409, result?.error?.message || "The CRM did not confirm this action.");
  }
  await db.rpc("ai_log_executed_action", { p_workspace_id: workspaceId, p_action_id: action.id, p_kind: action.kind, p_subject_id: id ?? null });
  return { message: `${action.summary} completed.`, href, id };
}

export function matchesVoiceConfirmation(action: ActionRow, transcript: string): boolean {
  return !!action.voice_phrase && normalizePhrase(action.voice_phrase) === normalizePhrase(transcript);
}
