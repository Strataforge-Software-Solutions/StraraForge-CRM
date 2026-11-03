import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { db, stages, stageLabels, cx, dateText, moneyText, isPhoneLikeContactName, useAuth, useToast, CrmIcon, PageHeader, Loading, ErrorBox, Metric, Modal, DatePicker, StageDropdown, DeleteRecordModal } from "./shared";
import { ImagePicker, RecordAvatar, RecordImages, uploadRecordImages } from "./images";

const leadSourceOptions = ["", "Website", "Social Media", "Inquiry Form", "Email", "Referral"];

function SourceIcon({ source }: { source: string }) {
  if (!source) return null;
  const name = leadSourceOptions.includes(source) ? source : "Other";
  const shapes: Record<string, ReactNode> = {
    Website: <><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c-2.3 2.3-3.5 5.2-3.5 8.5s1.2 6.2 3.5 8.5c2.3-2.3 3.5-5.2 3.5-8.5S14.3 5.8 12 3.5z"/></>,
    "Social Media": <><circle cx="7" cy="8" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="16" cy="17" r="2.5"/><path d="m9.2 7.5 5.3-1M8.5 10.2l5.7 5M17 8.5v6"/></>,
    "Inquiry Form": <><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></>,
    Email: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
    Referral: <><circle cx="8" cy="8" r="2.5"/><circle cx="16.5" cy="9" r="2"/><path d="M3.5 19v-1.5a4.5 4.5 0 0 1 9 0V19M13.5 16a3.5 3.5 0 0 1 7 0v3"/></>,
    Other: <><circle cx="12" cy="12" r="8.5"/><path d="M12 8v4M12 16h.01"/></>,
  };
  return <span className={`lead-source-icon lead-source-icon-${name.toLowerCase().replace(/\s+/g, "-")}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg></span>;
}

const budgetCurrencies = ["USD", "PHP", "EUR", "GBP", "SGD"];
const budgetCurrencyNames: Record<string, string> = {
  USD: "USD — US dollar",
  PHP: "PHP — Philippine peso",
  EUR: "EUR — Euro",
  GBP: "GBP — Pound sterling",
  SGD: "SGD — Singapore dollar",
};
const budgetCurrencySymbols: Record<string, string> = { USD: "$", PHP: "₱", EUR: "€", GBP: "£", SGD: "S$" };

function leadActivityTitle(item: any) {
  if (item.action === "stage_changed") {
    const from = stageLabels[item.details?.from] ?? item.details?.from;
    const to = stageLabels[item.details?.to] ?? item.details?.to;
    return to ? `Stage changed${from ? ` from ${from}` : ""} to ${to}` : "Lead stage changed";
  }
  if (item.action === "insert") return "Lead created";
  if (item.action === "update") return "Lead updated";
  return String(item.action).replace(/_/g, " ");
}

function hasSiblingClientInquiry(lead: any, leads: any[] | null) {
  const clientId = lead.client_id ?? lead.client_link_id;
  return Boolean(clientId && leads?.some((other) => other.id !== lead.id && (other.client_id === clientId || other.client_link_id === clientId)));
}

function BudgetCurrencyField({ initialCurrency, label = "Budget currency", disabled = false }: { initialCurrency: string; label?: string; disabled?: boolean }) {
  const [currency, setCurrency] = useState(initialCurrency);
  return <div className="field budget-currency-field">
    <span>{label}</span>
    <input type="hidden" name="budget_currency" value={currency}/>
    <StageDropdown
      value={currency}
      options={budgetCurrencies.includes(currency) ? budgetCurrencies : [...budgetCurrencies, currency]}
      disabled={disabled}
      label={label}
      optionLabels={budgetCurrencyNames}
      optionIcon={(option) => <span className="budget-currency-symbol" aria-hidden="true">{budgetCurrencySymbols[option] ?? option.slice(0, 2)}</span>}
      onChange={setCurrency}
      className="budget-currency-dropdown"
      minMenuWidth={245}
    />
  </div>;
}

function AcceptanceEvidenceField(){
  const [evidenceType,setEvidenceType]=useState("approval_message");
  const options=["approval_message","signed_document"];
  const optionLabels={approval_message:"Approval message",signed_document:"Signed document"};
  return <div className="field proposal-evidence-field"><span>Evidence type</span><input type="hidden" name="evidence_type" value={evidenceType}/><StageDropdown value={evidenceType} options={options} disabled={false} label="Evidence type" optionLabels={optionLabels} onChange={setEvidenceType} className="proposal-evidence-dropdown" minMenuWidth={220}/></div>;
}

function ClientTypeField(){
  const [clientType,setClientType]=useState("organization");
  const options=["organization","person"];
  const optionLabels={organization:"Organization",person:"Individual"};
  return <div className="field"><span>Client type</span><input type="hidden" name="client_type" value={clientType}/><StageDropdown value={clientType} options={options} disabled={false} label="Client type" optionLabels={optionLabels} onChange={setClientType} className="project-client-type-dropdown" minMenuWidth={180}/></div>;
}

export function LeadForm({ lead, onClose, onSaved }: { lead?: any; onClose: () => void; onSaved: () => void }) {
  const { founder } = useAuth(); const notify = useToast(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [savedLeadId, setSavedLeadId] = useState("");
  const [existingClients, setExistingClients] = useState<any[] | null>(null);
  const [existingClientsError, setExistingClientsError] = useState("");
  const [existingClientId, setExistingClientId] = useState("");
  const [existingClientContact, setExistingClientContact] = useState<any>(null);
  const [existingClientContactLoading, setExistingClientContactLoading] = useState(false);
  const [existingClientContactError, setExistingClientContactError] = useState("");
  const [existingClientOpenLeads, setExistingClientOpenLeads] = useState<any[]>([]);
  const [existingClientLeadIds, setExistingClientLeadIds] = useState<string[]>([]);
  const initialSource = String(lead?.source ?? "").trim();
  const initialSocialDetail = initialSource.match(/^Social Media\s*[:–—-]\s*(.+)$/i)?.[1] ?? (["Facebook", "Instagram", "TikTok", "LinkedIn", "X", "Twitter"].includes(initialSource) ? initialSource : "");
  const [source, setSource] = useState(initialSocialDetail || initialSource === "Social Media" ? "Social Media" : initialSource);
  const [socialDetail, setSocialDetail] = useState(initialSocialDetail);
  const [unavailableFields, setUnavailableFields] = useState<string[]>(() => lead ? ["location", "timeline", "project_type"].filter((field) => !Object.prototype.hasOwnProperty.call(lead, field)) : []);
  useEffect(() => {
    if (lead || !founder?.workspaceId) { setExistingClients([]); return; }
    let active = true;
    setExistingClients(null);
    setExistingClientsError("");
    void db().from("clients").select("id,name,client_type,website,notes").eq("workspace_id", founder.workspaceId).is("archived_at", null).order("name").then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) { setExistingClientsError("Existing clients could not be loaded. You can still enter client details below."); setExistingClients([]); return; }
      setExistingClients(data ?? []);
    });
    return () => { active = false; };
  }, [founder?.workspaceId, lead?.id]);
  async function chooseExistingClient(nextClientId: string) {
    setExistingClientId(nextClientId);
    setExistingClientContact(null);
    setExistingClientContactError("");
    setExistingClientOpenLeads([]);
    setExistingClientLeadIds([]);
    if (!nextClientId || !founder?.workspaceId) return;
    setExistingClientContactLoading(true);
    const [contactResult, openLeadsResult] = await Promise.all([
      db().from("contacts").select("id,full_name,title,email,phone,is_primary").eq("workspace_id", founder.workspaceId).eq("client_id", nextClientId).is("archived_at", null).order("is_primary", { ascending: false }).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      db().from("leads").select("id,company_name,project_type,source,stage,created_at").eq("workspace_id", founder.workspaceId).is("archived_at", null).or(`client_id.eq.${nextClientId},client_link_id.eq.${nextClientId}`).order("created_at", { ascending: true }),
    ]);
    setExistingClientContactLoading(false);
    if (contactResult.error) setExistingClientContactError("Saved contact details could not be loaded. You can enter them below.");
    else setExistingClientContact(contactResult.data);
    if (!openLeadsResult.error) {
      const relatedLeads = openLeadsResult.data ?? [];
      setExistingClientLeadIds(relatedLeads.map((item: any) => String(item.id)));
      setExistingClientOpenLeads(relatedLeads.filter((item: any) => !["won", "lost"].includes(item.stage)));
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget); const min = form.get("budget_min") ? Number(form.get("budget_min")) : null; const max = form.get("budget_max") ? Number(form.get("budget_max")) : null; const enteredContactName = String(form.get("contact_name")).trim(); const enteredPhone = String(form.get("phone") || "").trim(); const phoneInContactField = isPhoneLikeContactName(enteredContactName); const contactName = phoneInContactField ? (lead ? lead.company_name : String(form.get("company_name")).trim()) : enteredContactName; const phone = enteredPhone || (phoneInContactField ? enteredContactName : ""); const values: Record<string, string | number | null> = { company_name: String(form.get("company_name")).trim(), contact_name: contactName, email: String(form.get("email")).trim().toLowerCase(), phone: phone || null, website_brief: String(form.get("website_brief")).trim(), source: source === "Social Media" ? `Social Media: ${socialDetail.trim()}` : source || null, next_follow_up_at: form.get("next_follow_up_date") ? `${form.get("next_follow_up_date")}T12:00:00.000Z` : null, budget_min: min, budget_max: max, budget_currency: min !== null || max !== null ? String(form.get("budget_currency")) : null };
    if (!lead) { values.client_id = existingClientId || null; values.client_link_id = existingClientId || null; }
    for (const field of ["location", "timeline"] as const) { if (unavailableFields.includes(field)) continue; const input = String(form.get(field) || "").trim(); if (input || (lead && Object.prototype.hasOwnProperty.call(lead, field))) values[field] = input || null; }
    if (!unavailableFields.includes("project_type")) { values.project_type = String(form.get("project_type") || "").trim() || null; }
    if (min !== null && max !== null && min > max) { setError("Maximum budget must be at least the minimum."); setBusy(false); return; }
    if (source === "Social Media" && !socialDetail.trim()) { setError("Specify the social media platform or account."); setBusy(false); return; }
    try {
      const targetId = lead?.id || savedLeadId || crypto.randomUUID();
      const supabase = db();
      const save = () => lead || savedLeadId
        ? supabase.from("leads").update(values).eq("id", targetId).eq("workspace_id", founder!.workspaceId)
        : supabase.from("leads").insert({ id: targetId, ...values, workspace_id: founder!.workspaceId, owner_user_id: founder!.userId });
      let { error: saveError } = await save();
      const skipped: string[] = [];
      for (let attempt = 0; saveError && attempt < 2; attempt += 1) {
        const missing = /Could not find the '(location|timeline|project_type)' column/i.exec(saveError.message)?.[1];
        if (!missing || !(missing in values)) break;
        delete values[missing];
        skipped.push(missing);
        setUnavailableFields((fields) => [...new Set([...fields, missing])]);
        ({ error: saveError } = await save());
      }
      if (saveError) { setError(saveError.message); return; }
      const skippedNames = skipped.map((field) => field === "location" ? "Location" : field === "timeline" ? "Timeline" : "Project type").join(" and ");
      const skippedWarning = skipped.length ? `${skippedNames} ${skipped.length === 1 ? "was" : "were"} skipped because the database needs an update.` : "";
      if (!lead) setSavedLeadId(targetId);
      if (images.length) {
        const result = await uploadRecordImages(founder!.workspaceId, "lead", targetId, images);
        setImages(result.failed);
        if (result.error) { setError(`Lead saved, but ${result.failed.length} ${result.failed.length === 1 ? "image" : "images"} could not upload. ${result.error}${skippedWarning ? ` ${skippedWarning}` : ""} Retry ${lead ? "Save changes" : "Save lead"} or add them later from the lead record.`); onSaved(); return; }
      }
      if (skipped.length) { setError(`Other lead changes${images.length ? " and images" : ""} saved, but ${skippedWarning} Reopen this form after the lead field migration is applied.`); onSaved(); return; }
      notify(lead ? "Lead updated." : "Lead added."); onSaved(); onClose();
    } catch { setError("The lead or its images could not be saved. Please try again."); }
    finally { setBusy(false); }
  }
  const selectedExistingClient = existingClients?.find((client: any) => client.id === existingClientId);
  return <form className="record-form" onSubmit={submit}><div className="form-section-heading"><h2>Inquiry</h2><p>Capture what the client wants to build and how to reach them.</p></div>{!lead&&<div className="lead-existing-client-choice"><label className="field field-wide"><span>Link to existing client <small>Optional</small></span>{existingClients===null?<Loading label="Loading clients…"/>:<><input type="hidden" name="client_id" value={existingClientId}/><StageDropdown value={existingClientId} options={["",...existingClients.map((client:any)=>client.id)]} disabled={busy||existingClientContactLoading} label="Existing client" optionLabels={{"":"No existing client",...Object.fromEntries(existingClients.map((client:any)=>[client.id,client.name]))}} onChange={chooseExistingClient} className="new-project-client-dropdown" minMenuWidth={260}/><small>Choose a client to link this inquiry, or leave blank to enter a new client below.</small></>}{existingClientsError&&<small className="lead-field-unavailable">{existingClientsError}</small>}</label>{selectedExistingClient&&<div className="lead-existing-client-summary"><RecordAvatar recordType="client" recordId={selectedExistingClient.id} name={selectedExistingClient.name} className="lead-existing-client-avatar" fallbackLeadIds={existingClientLeadIds}/><div><strong>{selectedExistingClient.name}</strong><span>{selectedExistingClient.client_type==="person"?"Individual":"Organization"}{existingClientContact?.full_name?` · ${existingClientContact.full_name}`:""}</span><span>{existingClientContactLoading?"Loading contact details…":[existingClientContact?.email,existingClientContact?.phone,selectedExistingClient.website].filter(Boolean).join(" · ")||"No contact details saved yet"}</span>{existingClientContactError&&<small>{existingClientContactError}</small>}</div></div>}{existingClientOpenLeads.length>0&&<div className="lead-existing-client-warning"><strong>This client already has open inquiries</strong><ul>{existingClientOpenLeads.map((item:any)=><li key={item.id}><Link to={`/leads/${item.id}`} onClick={onClose}>{item.project_type||"Inquiry"} · {stageLabels[item.stage]}{item.source?` · ${item.source}`:""}</Link></li>)}</ul><small>If this is the same request, update an existing inquiry instead of adding another.</small></div>}</div>}<div className="form-grid">{([["company_name", "Company or client name", lead?.company_name, "text"], ["contact_name", "Primary contact", isPhoneLikeContactName(lead?.contact_name) ? lead?.company_name : lead?.contact_name, "text"], ["email", "Email address", lead?.email, "email"], ["phone", "Phone", lead?.phone || (isPhoneLikeContactName(lead?.contact_name) ? lead.contact_name : ""), "tel"], ["location", "Location", lead?.location, "text"]] as any[]).map(([name,label,value,type]) => <label className="field" key={name}><span>{label}{!["phone", "location"].includes(name) && " *"}</span><input name={name} type={type} required={!['phone', 'location'].includes(name)} maxLength={name === "phone" ? 50 : name === "location" ? 240 : 320} placeholder={name === "contact_name" ? "First and last name" : undefined} key={`${name}-${existingClientId}-${existingClientContact?.id??""}-${existingClientContactLoading?"loading":"ready"}`} defaultValue={(name==="company_name"&&selectedExistingClient?selectedExistingClient.name:name==="contact_name"&&selectedExistingClient?(existingClientContact?.full_name&&!isPhoneLikeContactName(existingClientContact.full_name)?existingClientContact.full_name:selectedExistingClient.name):name==="email"&&selectedExistingClient?(existingClientContact?.email??""):name==="phone"&&selectedExistingClient?(existingClientContact?.phone??""):value) ?? ""} disabled={unavailableFields.includes(name)||(existingClientContactLoading&&!!selectedExistingClient)}/>{unavailableFields.includes(name) && <small className="lead-field-unavailable">Database update needed to edit this field.</small>}</label>)}<label className="field field-wide"><span>Notes *</span><textarea name="website_brief" required maxLength={10000} rows={4} defaultValue={lead?.website_brief}/></label></div><div className="form-section-heading"><h2>Follow-up and budget</h2><p>Leave these blank until the client has shared the details.</p></div><div className="form-grid"><div className="field lead-source-field"><span>Source</span><StageDropdown value={source} options={leadSourceOptions.includes(source) ? leadSourceOptions : [...leadSourceOptions, source]} disabled={busy} label="Lead source" optionLabels={{ "": "Select a source" }} optionIcon={(option) => <SourceIcon source={option}/>} onChange={setSource} className="lead-source-dropdown" minMenuWidth={230}/></div><label className="field"><span>Project type</span><input name="project_type" maxLength={120} defaultValue={lead?.project_type ?? "Website"} disabled={unavailableFields.includes("project_type")}/>{unavailableFields.includes("project_type") && <small className="lead-field-unavailable">Database update needed to edit this field.</small>}</label>{source === "Social Media" && <label className="field field-wide lead-social-detail"><span>Social media platform or account *</span><input value={socialDetail} onChange={(event) => setSocialDetail(event.target.value)} maxLength={106} required placeholder="e.g. Instagram, Facebook, LinkedIn" autoComplete="off"/></label>}<label className="field"><span>Timeline</span><input name="timeline" maxLength={120} placeholder="e.g. 1–2 months" defaultValue={lead?.timeline ?? ""} disabled={unavailableFields.includes("timeline")}/>{unavailableFields.includes("timeline") && <small className="lead-field-unavailable">Database update needed to edit this field.</small>}</label><label className="field"><span>Next follow-up date</span><DatePicker name="next_follow_up_date" defaultValue={lead?.next_follow_up_at?.slice(0,10) ?? ""} label="Next follow-up date"/></label><label className="field"><span>Budget from</span><input type="number" name="budget_min" min="0" step=".01" defaultValue={lead?.budget_min ?? ""}/></label><label className="field"><span>Budget to</span><input type="number" name="budget_max" min="0" step=".01" defaultValue={lead?.budget_max ?? ""}/></label><BudgetCurrencyField initialCurrency={lead?.budget_currency ?? "USD"} disabled={busy}/></div>{lead ? <RecordImages recordType="lead" recordId={lead.id} pendingFiles={images} onPendingFilesChange={setImages} saveWithForm disabled={busy} onImagesChanged={onSaved}/> : <ImagePicker files={images} onChange={setImages} disabled={busy}/>} {error && <ErrorBox>{error}</ErrorBox>}<div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy||(!lead&&existingClients===null)}>{busy ? "Saving…" : !lead&&existingClients===null ? "Loading clients…" : lead ? "Save changes" : "Save lead"}</button></div></form>;
}

function LeadRowActions({ lead, onOpen, onEdit, onDelete }: { lead: any; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const [open,setOpen]=useState(false);
  const [position,setPosition]=useState({top:0,left:0});
  const triggerRef=useRef<HTMLButtonElement>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const close=()=>setOpen(false);
    const onPointerDown=(event:PointerEvent)=>{
      const target=event.target as Node;
      if(!triggerRef.current?.contains(target)&&!menuRef.current?.contains(target))close();
    };
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){close();triggerRef.current?.focus();}
    };
    document.addEventListener("pointerdown",onPointerDown);
    document.addEventListener("keydown",onKeyDown);
    window.addEventListener("scroll",close,true);
    window.addEventListener("resize",close);
    return()=>{document.removeEventListener("pointerdown",onPointerDown);document.removeEventListener("keydown",onKeyDown);window.removeEventListener("scroll",close,true);window.removeEventListener("resize",close);};
  },[open]);
  function toggle(){
    if(open){setOpen(false);return;}
    const rect=triggerRef.current?.getBoundingClientRect();
    if(!rect)return;
    const menuHeight=122,menuWidth=148,gap=5;
    const top=rect.bottom+menuHeight+gap>window.innerHeight-8?Math.max(8,rect.top-menuHeight-gap):rect.bottom+gap;
    const left=Math.max(8,Math.min(rect.right-menuWidth,window.innerWidth-menuWidth-8));
    setPosition({top,left});setOpen(true);
  }
  const run=(action:()=>void)=>{setOpen(false);action();};
  return <>
    <button ref={triggerRef} type="button" className="lead-row-menu-trigger" aria-label={`Actions for ${lead.company_name}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>⋮</button>
    {open&&createPortal(<div ref={menuRef} className="lead-row-menu-popover" role="menu" style={{top:position.top,left:position.left}}>
      <button type="button" role="menuitem" onClick={()=>run(onOpen)}>Open</button>
      <button type="button" role="menuitem" onClick={()=>run(onEdit)}>Edit</button>
      <button type="button" role="menuitem" className="lead-row-delete" onClick={()=>run(onDelete)}>Delete</button>
    </div>,document.body)}
  </>;
}

export function Leads() {
  const { founder } = useAuth(); const notify = useToast(); const [params, setParams] = useSearchParams(); const [leads, setLeads] = useState<any[] | null>(null); const [counts, setCounts] = useState<Record<string, number>>({}); const [editing, setEditing] = useState<any>(null); const [leadToDelete, setLeadToDelete] = useState<any>(null); const [deleteLeadBusy, setDeleteLeadBusy] = useState(false); const [deleteLeadError, setDeleteLeadError] = useState(""); const [adding, setAdding] = useState(false); const [selected, setSelected] = useState<any>(null); const [error, setError] = useState(false); const [avatarVersion, setAvatarVersion] = useState(0); const [tagInput, setTagInput] = useState(""); const [tagBusy, setTagBusy] = useState(false); const [conversion, setConversion] = useState<{status:"checking"|"ready"|"blocked"|"converted"|"error"; projectId?:string}>({status:"checking"}); const drawerRef = useRef<HTMLDialogElement>(null); const [drawerTab, setDrawerTab] = useState<"overview"|"activity"|"notes">("overview"); const [leadActivity, setLeadActivity] = useState<any[] | null>(null); const [leadActivityError, setLeadActivityError] = useState(false); const [notesDraft, setNotesDraft] = useState(""); const [notesBusy, setNotesBusy] = useState(false); const [notesError, setNotesError] = useState("");
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selected?.id ?? null;
  const q = params.get("q") ?? ""; const stage = params.get("stage") ?? "";
  const load = useCallback(async () => { setError(false); const query = db().from("leads").select("*").eq("workspace_id", founder!.workspaceId).is("archived_at", null).order("updated_at", { ascending: false }); const result = await query; if (result.error) setError(true); const rows = result.data ?? []; const filtered = rows.filter((row: any) => (!stage || row.stage === stage) && (!q || [row.company_name,row.contact_name,row.email].some((text: string) => text.toLowerCase().includes(q.toLowerCase())))); setLeads(filtered); setCounts(Object.fromEntries(["all", ...stages].map((key) => [key, key === "all" ? rows.length : rows.filter((row: any) => row.stage === key).length]))); setSelected(rows.find((row: any) => row.id === params.get("selected")) ?? null); }, [founder, params, q, stage]);
  useEffect(() => { void load(); const refreshFromAssistant = () => void load(); window.addEventListener("strataforge:crm-data-changed", refreshFromAssistant); return () => window.removeEventListener("strataforge:crm-data-changed", refreshFromAssistant); }, [load]);
  useEffect(() => { setTagInput(""); }, [selected?.id]);
  useEffect(() => { setNotesDraft(selected?.notes ?? ""); setNotesError(""); }, [selected?.id]);

  useEffect(() => {
    const dialog = drawerRef.current;
    if (!selected || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [selected?.id]);
  useEffect(() => { setDrawerTab("overview"); setLeadActivity(null); setLeadActivityError(false); }, [selected?.id]);
  useEffect(() => {
    if (!selected || drawerTab !== "activity") return;
    let active = true;
    setLeadActivity(null);
    setLeadActivityError(false);
    void db().from("audit_events").select("id,action,occurred_at,details").eq("workspace_id", founder!.workspaceId).eq("subject_type", "leads").eq("subject_id", selected.id).order("occurred_at", { ascending: false }).limit(20).then(({ data, error }) => {
      if (!active) return;
      setLeadActivity(data ?? []);
      setLeadActivityError(Boolean(error));
    });
    return () => { active = false; };
  }, [selected?.id, drawerTab, founder?.workspaceId]);
  function closeLeadDrawer() {
    setSelected(null);
    setParams((current) => { const next = new URLSearchParams(current); next.delete("selected"); return next; }, { replace: true });
  }

  useEffect(() => { if (!selected || !founder?.workspaceId) return; let active = true; setConversion({status:"checking"}); void (async () => { const [projectResult, proposalResult] = await Promise.all([db().from("projects").select("id").eq("lead_id", selected.id).eq("workspace_id", founder.workspaceId).maybeSingle(), db().from("proposals").select("id").eq("lead_id", selected.id).eq("workspace_id", founder.workspaceId).eq("status", "accepted").order("version", {ascending:false}).limit(1).maybeSingle()]); if (!active) return; if (projectResult.data) { setConversion({status:"converted", projectId:projectResult.data.id}); return; } if (projectResult.error || proposalResult.error) { setConversion({status:"error"}); return; } if (!proposalResult.data) { setConversion({status:"blocked"}); return; } const depositResult = await db().from("payment_entries").select("id").eq("lead_id", selected.id).eq("workspace_id", founder.workspaceId).eq("proposal_id", proposalResult.data.id).eq("payment_kind", "deposit").limit(1).maybeSingle(); if (!active) return; setConversion(depositResult.error ? {status:"error"} : depositResult.data ? {status:"ready"} : {status:"blocked"}); })(); return () => { active = false; }; }, [selected?.id, founder?.workspaceId]);
  async function saveLeadTags(nextTags: string[]) { if (!selected || tagBusy) return; setTagBusy(true); const { error: tagError } = await db().from("leads").update({ tags: nextTags }).eq("id", selected.id).eq("workspace_id", founder!.workspaceId); setTagBusy(false); if (tagError) { notify(`Could not update tags: ${tagError.message}`, true); return; } setTagInput(""); setSelected((current: any) => current?.id === selected.id ? { ...current, tags: nextTags } : current); setLeads((current: any[] | null) => current?.map((row) => row.id === selected.id ? { ...row, tags: nextTags } : row) ?? null); }
  async function saveLeadNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || notesBusy) return;
    const nextNotes = notesDraft.trim() ? notesDraft : null;
    if ((nextNotes ?? "") === (selected.notes ?? "")) return;
    if (notesDraft.length > 5000) { setNotesError("Notes must be 5,000 characters or fewer."); return; }
    setNotesBusy(true);
    setNotesError("");
    const leadId = selected.id;
    const { data, error: saveError } = await db().from("leads").update({ notes: nextNotes })
      .eq("id", leadId).eq("workspace_id", founder!.workspaceId)
      .eq("updated_at", selected.updated_at).is("archived_at", null)
      .select("notes,updated_at").maybeSingle();
    setNotesBusy(false);
    if (saveError) {
      if (selectedIdRef.current === leadId) setNotesError(/notes.*column|column.*notes/i.test(saveError.message)
        ? "Notes are unavailable until the lead notes database migration is applied."
        : saveError.message);
      return;
    }
    if (!data) { if (selectedIdRef.current === leadId) setNotesError("This lead changed since you opened it. Close and reopen the drawer, then review its notes before saving."); return; }
    setSelected((current: any) => current?.id === leadId ? { ...current, ...data } : current);
    setLeads((current: any[] | null) => current?.map((row) => row.id === leadId ? { ...row, ...data } : row) ?? null);
    if (selectedIdRef.current === leadId) setNotesDraft(data.notes ?? "");
    notify("Lead notes saved.");
  }
  function archive(lead: any) { setDeleteLeadError(""); setLeadToDelete(lead); }
  async function confirmLeadDelete() {
    if (!founder || !leadToDelete || deleteLeadBusy) return;
    setDeleteLeadBusy(true);setDeleteLeadError("");
    const {data,error:archiveError}=await db().from("leads").update({archived_at:new Date().toISOString()}).eq("id",leadToDelete.id).eq("workspace_id",founder.workspaceId).is("archived_at",null).select("id").maybeSingle();
    setDeleteLeadBusy(false);
    if(archiveError||!data){setDeleteLeadError(archiveError?.message??"This lead changed or is no longer available. Refresh and try again.");return;}
    const deletedId=leadToDelete.id;setLeadToDelete(null);notify("Lead deleted.");if(selected?.id===deletedId)closeLeadDrawer();await load();
  }
  const list = leads ?? [];
  return <><PageHeader eyebrow="Sales workspace" title="Leads" description="Manage website inquiries and move promising conversations toward a real project." action={<button className="button button-primary" onClick={() => setAdding(true)}>＋ Add Lead</button>}/><section className="leads-metrics">{[["Total Leads",counts.all ?? 0,"All active inquiries","orange"],["New Leads",counts.new ?? 0,"Awaiting first contact","blue"],["Contacted",counts.contacted ?? 0,"Conversation started","green"],["Converted",counts.won ?? 0,"Confirmed projects","purple"]].map(([label,value,hint,tone]) => <div key={label} className={`leads-metric leads-metric-${tone}`}><span className="leads-metric-icon"><CrmIcon name={label === "Total Leads" ? "users" : label === "New Leads" ? "inbox" : label === "Contacted" ? "phone" : "check"}/></span><span><span className="leads-metric-label">{label}</span><strong>{value}</strong><small>{hint}</small></span></div>)}</section><nav className="lead-stage-filters" aria-label="Filter leads by stage">{["all",...stages].map((key) => <button key={key} className={cx("lead-stage-filter", stage === key || (!stage && key === "all") ? "is-active" : "")} onClick={() => { const next = new URLSearchParams(params); if (key === "all") next.delete("stage"); else next.set("stage",key); setParams(next); }}><span>{key === "all" ? "All Leads" : stageLabels[key]}</span><strong>{counts[key] ?? 0}</strong></button>)}</nav>{error && <ErrorBox/>}<div className="leads-workspace-grid"><section className="record-list-panel leads-table-panel"><div className="leads-table-toolbar"><div><h2>All Leads</h2><p>{list.length} {list.length === 1 ? "lead" : "leads"}</p></div><form className="leads-table-controls" onSubmit={(event) => {event.preventDefault();const form=new FormData(event.currentTarget);setParams((old)=>{const next=new URLSearchParams(old);const value=String(form.get("q")??"").trim();if(value)next.set("q",value);else next.delete("q");return next;});}}><CrmIcon name="search"/><input aria-label="Search leads by name or email" name="q" defaultValue={q} placeholder="Search leads…"/><button className="button button-secondary">Search</button></form></div>{leads === null ? <Loading/> : list.length ? <div className="leads-table-scroll"><table className="leads-table"><thead><tr>{["Name","Contact","Source","Project Type","Budget","Status","Date","Actions"].map((x)=><th key={x}>{x}</th>)}</tr></thead><tbody>{list.map((lead)=><tr key={lead.id} className={selected?.id===lead.id?"is-selected":""}><td><button className="lead-table-name" onClick={()=>{setSelected(lead);setParams((old)=>{const next=new URLSearchParams(old);next.set("selected",lead.id);return next;});}}><RecordAvatar recordType="lead" recordId={lead.id} name={lead.company_name} className="lead-table-avatar" refreshKey={avatarVersion}/><span><strong>{lead.company_name}</strong>{!isPhoneLikeContactName(lead.contact_name) && <small>{lead.contact_name}</small>}{hasSiblingClientInquiry(lead,leads)&&<small className="lead-sibling-inquiry-tag">Other inquiry for this client</small>}</span></button></td><td><div className="lead-table-contact"><span className="lead-table-email"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.75" y="4.25" width="14.5" height="11.5" rx="2"/><path d="m3.5 5.5 6.5 5 6.5-5"/></svg>{lead.email}</span>{lead.phone && <span className="lead-table-phone"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.1 2.75H3.8a1.05 1.05 0 0 0-1.05 1.1c.55 6.8 5.95 12.2 12.75 12.75a1.05 1.05 0 0 0 1.1-1.05v-2.3a1.05 1.05 0 0 0-.88-1.04l-1.08 1.08a10.75 10.75 0 0 1-4.58-4.58l1.08-1.08a1.05 1.05 0 0 0 .3-1l-.42-2.48a1.05 1.05 0 0 0-1.04-.88Z"/></svg>{lead.phone}</span>}</div></td><td>{lead.source||"Unspecified"}</td><td><span className="lead-project-type">{lead.project_type?.trim()||"Website"}</span></td><td>{moneyText(lead.budget_min ?? lead.budget_max, lead.budget_currency)}</td><td><span className={`stage-badge stage-${lead.stage}`}>{stageLabels[lead.stage]}</span></td><td>{dateText(lead.created_at)}</td><td><LeadRowActions lead={lead} onOpen={()=>{setSelected(lead);setParams((old)=>{const next=new URLSearchParams(old);next.set("selected",lead.id);return next;});}} onEdit={()=>setEditing(lead)} onDelete={()=>void archive(lead)}/></td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>{q||stage?"No leads match these filters":"Your pipeline starts with an inquiry"}</h3><p>{q||stage?"Clear or adjust your search and stage filter.":"Add a real website inquiry to keep its brief, contact, and next step together."}</p></div>}</section>{selected && <dialog
  ref={drawerRef}
  className="lead-quick-panel lead-drawer"
  aria-label={selected.company_name + " lead details"}
  onCancel={(event) => { event.preventDefault(); closeLeadDrawer(); }}
  onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeLeadDrawer();
  }}
>
  <header className="lead-quick-head">
    <RecordAvatar recordType="lead" recordId={selected.id} name={selected.company_name} className="lead-quick-avatar" refreshKey={avatarVersion}/>
    <div><h2>{selected.company_name}</h2><p>{selected.contact_name || "Contact not added"} · {stageLabels[selected.stage]}</p></div>
    <button type="button" className="lead-drawer-close" aria-label="Close lead details" onClick={closeLeadDrawer}>×</button>
  </header>
  <nav className="lead-detail-tabs" aria-label="Lead details">
    <button type="button" className={drawerTab === "overview" ? "is-active" : ""} aria-current={drawerTab === "overview" ? "page" : undefined} onClick={() => setDrawerTab("overview")}>Overview</button>
    <button type="button" className={drawerTab === "activity" ? "is-active" : ""} aria-current={drawerTab === "activity" ? "page" : undefined} onClick={() => setDrawerTab("activity")}>Activity</button>
    <button type="button" className={drawerTab === "notes" ? "is-active" : ""} aria-current={drawerTab === "notes" ? "page" : undefined} onClick={() => setDrawerTab("notes")}>Notes</button>
    <Link className="lead-drawer-workflow-link" to={"/leads/" + selected.id}>Full workflow ↗</Link>
  </nav>
  <div className="lead-drawer-scroll">
    {drawerTab === "overview" ? <>
      <section className="lead-drawer-stage">
        <span>Opportunity stage</span>
        <div><span className={"stage-badge stage-" + selected.stage}>{stageLabels[selected.stage]}</span><Link to={"/leads/" + selected.id}>Manage stage in workflow ↗</Link></div>
      </section>
      <dl className="lead-drawer-facts" aria-label="Lead information">
        <div><dt>Contact name</dt><dd>{selected.contact_name || "Not provided"}</dd></div>
        <div><dt>Email</dt><dd><a href={"mailto:" + selected.email}>{selected.email}</a></dd></div>
        <div><dt>Phone</dt><dd>{selected.phone ? <a href={"tel:" + selected.phone}>{selected.phone}</a> : "Not provided"}</dd></div>
        <div><dt>Source</dt><dd>{selected.source || "Not recorded"}</dd></div>
        <div><dt>Project type</dt><dd>{selected.project_type || "Website"}</dd></div>
        <div><dt>Estimated budget</dt><dd>{moneyText(selected.budget_min ?? selected.budget_max, selected.budget_currency)}</dd></div>
        <div><dt>Next follow-up</dt><dd>{dateText(selected.next_follow_up_at)}</dd></div>
        <div><dt>Created</dt><dd>{dateText(selected.created_at)}</dd></div>
        <div><dt>Timeline</dt><dd>{selected.timeline || "Not set"}</dd></div>
        <div><dt>Location</dt><dd>{selected.location || "Not provided"}</dd></div>
      </dl>
      <section className="lead-drawer-brief"><h3>About this opportunity</h3><p>{selected.website_brief || "No notes added."}</p></section>
      <section className="lead-drawer-tags">
        <div className="lead-tags-heading"><h3>Tags</h3><span>{(Array.isArray(selected.tags) ? selected.tags.length : 0)}/12</span></div>
        <div className="lead-tag-list">{(Array.isArray(selected.tags) ? selected.tags : []).map((tag: string) => <span className="lead-tag-chip" key={tag}>{tag}<button type="button" aria-label={"Remove " + tag + " tag"} disabled={tagBusy} onClick={() => void saveLeadTags(selected.tags.filter((item: string) => item !== tag))}>×</button></span>)}{(!Array.isArray(selected.tags) || selected.tags.length === 0) && <span className="lead-tags-empty">No tags yet</span>}</div>
        <form className="lead-tags-form" onSubmit={(event) => { event.preventDefault(); const tag = tagInput.trim(); if (!tag || tagBusy) return; const tags: string[] = Array.isArray(selected.tags) ? selected.tags : []; if (tags.length >= 12) { notify("A lead can have up to 12 tags.", true); return; } if (tags.some((item) => item.toLowerCase() === tag.toLowerCase())) { notify("That tag is already added.", true); return; } void saveLeadTags([...tags, tag]); }}>
          <input aria-label="Add a tag" placeholder="Add a tag…" maxLength={32} value={tagInput} onChange={(event) => setTagInput(event.target.value)} disabled={tagBusy || (Array.isArray(selected.tags) && selected.tags.length >= 12)}/>
          <button className="button button-secondary" disabled={tagBusy || !tagInput.trim() || (Array.isArray(selected.tags) && selected.tags.length >= 12)}>{tagBusy ? "Saving…" : "＋ Add"}</button>
        </form>
      </section>
    </> : drawerTab === "activity" ? <section className="lead-drawer-activity">
      <h3>Recent activity</h3>
      {leadActivityError ? <ErrorBox>Lead activity could not be loaded.</ErrorBox> : leadActivity === null ? <p role="status">Loading activity…</p> : leadActivity.length === 0 ? <p>No recorded activity for this lead yet.</p> :
        <ol className="lead-panel-activity">{leadActivity.map((item: any) => <li key={item.id}><span aria-hidden="true"><CrmIcon name="activity"/></span><div><strong>{leadActivityTitle(item)}</strong><time dateTime={item.occurred_at}>{new Date(item.occurred_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</time></div></li>)}</ol>}
    </section> : <form className="lead-drawer-notes" onSubmit={(event) => void saveLeadNotes(event)}>
      <label htmlFor="lead-notes">Notes for the next conversation</label>
      <textarea id="lead-notes" value={notesDraft} onChange={(event) => { setNotesDraft(event.target.value); setNotesError(""); }} maxLength={5000} rows={8} placeholder="Add follow-up context, questions, or client preferences…" disabled={notesBusy}/>
      <p className="lead-notes-help">Saved with this lead and available to your workspace. <span>{notesDraft.length}/5,000</span></p>
      {notesError && <ErrorBox>{notesError}</ErrorBox>}
      <button className="button button-primary" disabled={notesBusy || notesDraft === (selected.notes ?? "")}>{notesBusy ? "Saving…" : "Save notes"}</button>
    </form>}
  </div>
  <footer className="lead-quick-actions">
    <div className="lead-quick-action-row">
      <button type="button" className="button button-secondary lead-drawer-edit" onClick={() => { const leadToEdit = selected; closeLeadDrawer(); setEditing(leadToEdit); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 20 4.5-1 10.7-10.7a2.1 2.1 0 0 0-3-3L5.5 16zM14.8 6.7l3 3"/></svg>Edit lead</button>
      {conversion.status === "converted" && conversion.projectId ? <Link className="button button-primary lead-quick-action" to={"/projects/" + conversion.projectId}>Open project</Link> : conversion.status === "ready" ? <Link className="button button-primary lead-quick-action" to={"/leads/" + selected.id + "?convert=1#convert-to-project"}>Convert to project</Link> : <button type="button" className="button button-secondary lead-quick-action" disabled title={conversion.status === "error" ? "Project conversion eligibility could not be checked." : conversion.status === "checking" ? "Checking conversion requirements." : "Requires an accepted proposal and a recorded deposit."}>{conversion.status === "checking" ? "Checking conversion…" : "Convert to project"}</button>}
    </div>
    {conversion.status === "blocked" && <p className="lead-convert-hint">Record an accepted proposal and deposit to convert.</p>}
    {conversion.status === "error" && <p className="lead-convert-hint" role="status">Conversion requirements could not be checked. Open the full workflow to retry.</p>}
  </footer>
</dialog>}</div>{leadToDelete&&<DeleteRecordModal recordType="lead" recordName={leadToDelete.company_name} busy={deleteLeadBusy} error={deleteLeadError} onClose={()=>{if(!deleteLeadBusy)setLeadToDelete(null);}} onConfirm={()=>void confirmLeadDelete()}/>}{(adding||editing)&&<Modal title={editing?"Edit website inquiry":"Add a website inquiry"} description={editing?"Update the contact, request, and follow-up details for this lead.":"Capture the request and primary contact."} onClose={()=>{setAdding(false);setEditing(null);}} className="lead-record-dialog"><LeadForm lead={editing||undefined} onClose={()=>{setAdding(false);setEditing(null);}} onSaved={()=>{setAvatarVersion((value)=>value+1);void load();}}/></Modal>}</>;
}


export function LeadWorkflow(){const location=useLocation();const id=location.pathname.split("/")[2];const {founder}=useAuth();const notify=useToast();const [lead,setLead]=useState<any>(null);const [proposals,setProposals]=useState<any[]|null>(null);const [payments,setPayments]=useState<any[]>([]);const [project,setProject]=useState<any>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [budgetOpen,setBudgetOpen]=useState(false);const [budgetError,setBudgetError]=useState("");const [projectImages,setProjectImages]=useState<File[]>([]);const [conversionClients,setConversionClients]=useState<any[]|null>(null);const [conversionClientId,setConversionClientId]=useState("");const [conversionClientError,setConversionClientError]=useState("");const [reload,setReload]=useState(0);const [avatarVersion,setAvatarVersion]=useState(0);const refresh=()=>setReload(x=>x+1);useEffect(()=>{let active=true;void Promise.all([db().from("leads").select("*").eq("id",id).eq("workspace_id",founder!.workspaceId).maybeSingle(),db().from("proposals").select("*").eq("lead_id",id).eq("workspace_id",founder!.workspaceId).order("version",{ascending:false}),db().from("payment_entries").select("*").eq("lead_id",id).eq("workspace_id",founder!.workspaceId).order("received_at",{ascending:false}),db().from("projects").select("id,name").eq("lead_id",id).eq("workspace_id",founder!.workspaceId).maybeSingle()]).then(([l,p,pay,pr])=>{if(active){setLead(l.data);setProposals(p.data??[]);setPayments(pay.data??[]);setProject(pr.data);}});return()=>{active=false;};},[founder,id,reload]);useEffect(()=>{setConversionClientId("");if(!founder?.workspaceId||!lead||lead.client_id){setConversionClients([]);return;}let active=true;setConversionClients(null);setConversionClientError("");void db().from("clients").select("id,name").eq("workspace_id",founder.workspaceId).is("archived_at",null).order("name").then(({data,error:loadError})=>{if(!active)return;if(loadError){setConversionClientError(loadError.message);setConversionClients([]);return;}setConversionClients(data??[]);});return()=>{active=false;};},[founder?.workspaceId,lead?.id,lead?.client_id]);useEffect(()=>{if(new URLSearchParams(location.search).get("convert")!=="1"||!lead||proposals===null)return;const frame=requestAnimationFrame(()=>document.getElementById("convert-to-project")?.scrollIntoView({behavior:"smooth",block:"center"}));return()=>cancelAnimationFrame(frame);},[location.search,lead,proposals,payments,project]);async function saveBudget(event:FormEvent<HTMLFormElement>){event.preventDefault();setBudgetError("");const form=new FormData(event.currentTarget);const minText=String(form.get("budget_min")??"").trim();const maxText=String(form.get("budget_max")??"").trim();const min=minText?Number(minText):null;const max=maxText?Number(maxText):null;if(min!==null&&max!==null&&min>max){setBudgetError("Maximum budget must be at least the minimum.");return;}setBusy(true);const {error:e}=await db().from("leads").update({budget_min:min,budget_max:max,budget_currency:min!==null||max!==null?String(form.get("budget_currency")):null}).eq("id",id).eq("workspace_id",founder!.workspaceId);setBusy(false);if(e){setBudgetError(e.message);return;}notify("Estimated budget updated.");setBudgetOpen(false);refresh();}async function updateStage(stage:string){setError("");if(stage==="lost"){const reason=prompt("Why is this inquiry being closed as lost?");if(!reason?.trim())return;const accepted=proposals?.some(p=>p.status==="accepted");if(accepted){setError("A lead with an accepted proposal can’t be marked lost.");return;}setBusy(true);const {error:e}=await db().from("leads").update({stage,lost_reason:reason.trim()}).eq("workspace_id",founder!.workspaceId).eq("id",id);setBusy(false);if(e){setError(e.message);return;}}else{if(stage==="proposal_sent"&&!proposals?.some(p=>p.status==="sent")){setError("Mark a saved proposal as sent before moving to this stage.");return;}setBusy(true);const {error:e}=await db().from("leads").update({stage,lost_reason:null}).eq("workspace_id",founder!.workspaceId).eq("id",id);setBusy(false);if(e){setError(e.message);return;}}notify(`Moved to ${stageLabels[stage]}.`);refresh();}
 async function deleteDraftProposal(proposal:any){
  if(proposal.status!=="draft"||busy)return;
  if(!window.confirm(`Delete proposal version ${proposal.version}? This draft will be removed from the proposal history.`))return;
  setBusy(true);setError("");
  const {data:deleted,error:deleteError}=await db().from("proposals").delete().eq("id",proposal.id).eq("workspace_id",founder!.workspaceId).eq("status","draft").select("id").maybeSingle();
  setBusy(false);
  if(deleteError){setError(deleteError.message);return;}
  if(!deleted){setError("This draft changed or can no longer be deleted. Refresh and try again.");return;}
  notify("Proposal draft deleted.");refresh();
 } async function markSent(proposal:any){setBusy(true);const {error:e}=await db().from("proposals").update({status:"sent",sent_at:new Date().toISOString()}).eq("id",proposal.id).eq("workspace_id",founder!.workspaceId).eq("status","draft");if(!e){const stageResult=await db().from("leads").update({stage:"proposal_sent"}).eq("id",id).eq("workspace_id",founder!.workspaceId).in("stage",["new","contacted","discovery","proposal_sent"]);if(stageResult.error)setError("Proposal sent, but the lead stage did not update. Refresh and retry.");}setBusy(false);if(e){setError(e.message);return;}notify("Proposal marked as sent.");refresh();}
 async function accept(event:FormEvent<HTMLFormElement>,proposal:any){event.preventDefault();const form=new FormData(event.currentTarget);const note=String(form.get("note")).trim();const reference=String(form.get("reference")).trim();if(!note||!reference||!form.get("confirmed")){setError("Add acceptance details and confirm before continuing.");return;}setBusy(true);const {error:e}=await db().from("proposals").update({status:"accepted",accepted_at:new Date().toISOString(),acceptance_note:note,acceptance_evidence_type:String(form.get("evidence_type")),acceptance_evidence_ref:reference}).eq("id",proposal.id).eq("workspace_id",founder!.workspaceId).eq("status","sent");if(e){setError(e.message);setBusy(false);return;}const {error:stageError}=await db().from("leads").update({stage:"accepted_awaiting_deposit"}).eq("id",id).eq("workspace_id",founder!.workspaceId).not("stage","in","(won,lost)");setBusy(false);if(stageError)setError("Acceptance saved, but stage sync failed. Refresh to retry.");else notify("Proposal acceptance recorded.");refresh();}
 async function recordDeposit(event:FormEvent<HTMLFormElement>,proposal:any){event.preventDefault();const form=new FormData(event.currentTarget);const amount=Number(form.get("amount"));const received=String(form.get("received"));const reference=String(form.get("reference")).trim();if(!form.get("confirmed")||!reference||!received||amount<=0||amount>Number(proposal.amount)){setError("Confirm receipt and enter a valid amount, date, and reference. The deposit must not exceed the accepted proposal.");return;}setBusy(true);const {data:existing}=await db().from("payment_entries").select("id").eq("workspace_id",founder!.workspaceId).eq("proposal_id",proposal.id).eq("payment_kind","deposit").maybeSingle();if(existing){setError("A deposit is already recorded for this proposal.");setBusy(false);return;}const {error:e}=await db().from("payment_entries").insert({workspace_id:founder!.workspaceId,lead_id:id,proposal_id:proposal.id,payment_kind:"deposit",amount,currency:proposal.currency,received_at:`${received}T12:00:00.000Z`,reference,recorded_by:founder!.userId,created_by:founder!.userId});setBusy(false);if(e){setError(e.message);return;}notify("Deposit recorded.");refresh();}
 async function convert(event:FormEvent<HTMLFormElement>,proposal:any){
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  const name=String(form.get("project_name")).trim();
  const clientType=String(form.get("client_type")||"organization");
  const selectedClientId=String(form.get("client_id")||"");
  if(!name||!form.get("confirmed")){setError("Enter a project name and confirm the accepted agreement.");return;}
  if(!lead.client_id&&(conversionClients===null||conversionClientError)){setError("Wait for the existing client list to finish loading before creating this project.");return;}
  if(selectedClientId&&!conversionClients?.some((client:any)=>client.id===selectedClientId)){setError("Select an existing client from the list or create a new client.");return;}
  setBusy(true);setError("");
  let clientId=lead.client_id||selectedClientId;
  if(!clientId){
   const contactName=isPhoneLikeContactName(lead.contact_name)?lead.company_name:lead.contact_name;
   const contactPhone=lead.phone||(isPhoneLikeContactName(lead.contact_name)?lead.contact_name:null);
   const {data:newClientId,error:clientError}=await db().rpc("create_client_with_primary_contact",{
    p_workspace_id:founder!.workspaceId,p_name:lead.company_name,p_client_type:clientType,p_relationship_status:"active",
    p_website:null,p_notes:null,p_contact_name:contactName,p_contact_title:null,p_contact_email:lead.email,p_contact_phone:contactPhone,
   });
   if(clientError||!newClientId){setError(clientError?.message??"Client creation failed.");setBusy(false);return;}
   clientId=newClientId;
   const {error:linkError}=await db().from("leads").update({client_id:clientId,client_link_id:clientId}).eq("id",id).eq("workspace_id",founder!.workspaceId);
   if(linkError){setError(linkError.message);setBusy(false);return;}
  }else{
   if(!lead.client_id){
    const {error:linkError}=await db().from("leads").update({client_id:clientId,client_link_id:clientId}).eq("id",id).eq("workspace_id",founder!.workspaceId);
    if(linkError){setError(linkError.message);setBusy(false);return;}
   }
   const contactName=isPhoneLikeContactName(lead.contact_name)?lead.company_name:lead.contact_name;
   const contactPhone=lead.phone||(isPhoneLikeContactName(lead.contact_name)?lead.contact_name:null);
   const {data:primaryContact,error:contactLookupError}=await db().from("contacts").select("id,full_name,email,phone,title").eq("workspace_id",founder!.workspaceId).eq("client_id",clientId).eq("is_primary",true).is("archived_at",null).limit(1).maybeSingle();
   if(contactLookupError){setError(contactLookupError.message);setBusy(false);return;}
   if(primaryContact){
    const changes={full_name:primaryContact.full_name||contactName,title:primaryContact.title||null,email:primaryContact.email||lead.email,phone:primaryContact.phone||contactPhone};
    if(changes.full_name!==primaryContact.full_name||changes.email!==primaryContact.email||changes.phone!==primaryContact.phone||changes.title!==primaryContact.title){
     const {error:contactUpdateError}=await db().from("contacts").update(changes).eq("id",primaryContact.id).eq("workspace_id",founder!.workspaceId);
     if(contactUpdateError){setError(contactUpdateError.message);setBusy(false);return;}
    }
   }else{
    const {error:contactError}=await db().from("contacts").insert({workspace_id:founder!.workspaceId,client_id:clientId,full_name:contactName,title:null,email:lead.email,phone:contactPhone,is_primary:true,created_by:founder!.userId});
    if(contactError){setError(contactError.message);setBusy(false);return;}
   }
  }
  const {data:newProject,error:e}=await db().from("projects").insert({workspace_id:founder!.workspaceId,lead_id:id,client_id:clientId,accepted_proposal_id:proposal.id,name,agreed_amount:proposal.amount,currency:proposal.currency,status:"planned",start_date:form.get("start_date")||null,target_date:form.get("target_date")||null,owner_user_id:founder!.userId,created_by:founder!.userId}).select("id").single();
  if(e||!newProject){setBusy(false);setError(e?.message??"Project creation failed.");return;}
  setProject({id:newProject.id,name});
  if(projectImages.length){
    const result=await uploadRecordImages(founder!.workspaceId,"project",newProject.id,projectImages);
    setProjectImages(result.failed);
    if(result.error){setBusy(false);setError(`Project created, but ${result.failed.length} ${result.failed.length===1?"image":"images"} could not upload. ${result.error} Open the project to add them there.`);refresh();return;}
  }
  setBusy(false);
  notify("Project created.");window.location.href=`/projects/${newProject.id}`;
 }
 if(!lead||proposals===null)return <Loading label="Loading lead workflow…"/>;const accepted=proposals.find(p=>p.status==="accepted");const deposit=payments.find(p=>p.payment_kind==="deposit"&&accepted&&p.proposal_id===accepted.id);const budgetValue=lead.budget_min!=null&&lead.budget_max!=null?`${moneyText(lead.budget_min,lead.budget_currency)} – ${moneyText(lead.budget_max,lead.budget_currency)}`:moneyText(lead.budget_min??lead.budget_max,lead.budget_currency);return <div className="lead-workflow-page"><PageHeader eyebrow="Lead workflow" title={lead.company_name} avatar={<RecordAvatar recordType="lead" recordId={lead.id} name={lead.company_name} className="lead-heading-avatar" refreshKey={avatarVersion} fallbackClientId={lead.client_id ?? ""}/>} description={`${isPhoneLikeContactName(lead.contact_name) ? "Contact name needed" : lead.contact_name}${lead.phone ? ` · ${lead.phone}` : ""} · ${lead.email}`}  action={<Link className="button button-secondary" to="/leads">← Leads</Link>}/><section className="dashboard-metrics"><Metric label="Lead stage" value={deposit && lead.stage==="accepted_awaiting_deposit" ? "Ready to convert" : stageLabels[lead.stage]} hint={deposit ? "Deposit received" : lead.source||"Source not recorded"}/><button type="button" className="dashboard-metric metric-blue budget-metric-button" onClick={()=>{setBudgetError("");setBudgetOpen(true);}} aria-label="Edit estimated budget"><span className="dashboard-metric-icon"><CrmIcon name="money"/></span><span><span className="dashboard-metric-label">Estimated budget</span><strong>{budgetValue}</strong><small>Click to edit</small></span></button><Metric label="Proposals" value={proposals.length} hint="Version history" tone="green" icon="▤"/><Metric label="Next follow-up" value={dateText(lead.next_follow_up_at)} hint="Lead reminder" tone="purple" icon="▦"/></section><div className="dashboard-grid lead-workflow-grid"><section className="record-list-panel lead-workflow-card lead-workflow-inquiry"><h2>Inquiry details</h2><div className="workflow-brief"><span>Notes</span><p>{lead.website_brief || "No notes added."}</p></div><p className="workflow-contact">{lead.email}{lead.phone?` · ${lead.phone}`:""}</p><label className="field"><span>Lead stage</span><StageDropdown value={lead.stage} options={[...new Set([lead.stage,"new","contacted","discovery","proposal_sent","lost"])]} disabled={busy||lead.stage==="won"} label={`Lead stage for ${lead.company_name}`} optionLabels={deposit ? {accepted_awaiting_deposit:"Ready to convert"} : undefined} onChange={stage=>void updateStage(stage)}/></label><p>Created {dateText(lead.created_at)}</p>{project&&<p><Link to={`/projects/${project.id}`}>Open project: {project.name} →</Link></p>}</section><RecordImages recordType="lead" recordId={lead.id} onImagesChanged={() => setAvatarVersion((value) => value + 1)}/><section className="record-list-panel lead-workflow-card lead-workflow-proposals"><h2>Proposal history <span className="workflow-count">{proposals.length}</span></h2>{proposals.length?proposals.map((proposal:any)=><article className="task-card proposal-card" key={proposal.id}><div><strong>Version {proposal.version} · {moneyText(proposal.amount,proposal.currency)}</strong><p>{proposal.scope_summary}</p><small>{proposal.status}</small>{proposal.status==="draft"&&<div className="proposal-card-actions"><button className="button button-secondary" disabled={busy} onClick={()=>void markSent(proposal)}>Mark as sent</button><button type="button" className="button button-secondary proposal-delete-button" disabled={busy} onClick={()=>void deleteDraftProposal(proposal)}>Delete draft</button></div>}{proposal.status==="sent"&&<form className="record-form proposal-acceptance-form" onSubmit={event=>void accept(event,proposal)}><div className="proposal-acceptance-heading"><span className="proposal-acceptance-icon" aria-hidden="true">✓</span><div><h3>Record client acceptance</h3><p>Save how the client approved this proposal.</p></div></div><div className="proposal-acceptance-fields"><AcceptanceEvidenceField/><label className="field"><span>Message or document reference</span><input name="reference" required maxLength={2000} placeholder="Email subject, message link, or document reference"/></label><label className="field proposal-acceptance-note"><span>Acceptance note</span><textarea name="note" required maxLength={4000} rows={3} placeholder="Summarize the client approval and any relevant details."/></label></div><label className="proposal-acceptance-confirm"><input type="checkbox" name="confirmed" required/><span><strong>Confirm client approval</strong><small>I confirm this proposal was accepted by the client.</small></span></label><button className="button button-primary" disabled={busy}>Record acceptance</button></form>}</div></article>):<p>No proposal versions yet.</p>}<ProposalForm lead={lead} onSaved={refresh}/></section>{accepted&&<section className="record-list-panel lead-workflow-card lead-payment-card"><div className="lead-payment-heading"><div><p className="eyebrow">Payment checkpoint</p><h2>Accepted proposal and deposit</h2></div><span className="lead-payment-approved">Accepted</span></div><article className="accepted-proposal-summary"><div><span>Accepted proposal</span><strong>Version {accepted.version}</strong><b>{moneyText(accepted.amount,accepted.currency)}</b></div><p>{accepted.acceptance_note||"Client acceptance recorded."}</p><small>{accepted.acceptance_evidence_type==="signed_document"?"Signed document":"Approval message"}</small></article>{deposit?<article className="deposit-recorded-card"><div><span className="deposit-recorded-icon"><CrmIcon name="check"/></span><div><h3>Deposit recorded</h3><p>{dateText(deposit.received_at)}{deposit.reference?` · ${deposit.reference}`:""}</p></div></div><strong>{moneyText(deposit.amount,deposit.currency)}</strong></article>:<form className="record-form deposit-entry-form" onSubmit={event=>void recordDeposit(event,accepted)}><div className="deposit-entry-heading"><h3>Record the deposit</h3><p>Enter the amount received, date, and payment reference.</p></div><div className="form-grid"><label className="field"><span>Deposit amount ({accepted.currency})</span><input name="amount" type="number" min=".01" step=".01" required/></label><label className="field"><span>Date received</span><input type="date" name="received" defaultValue={new Date().toISOString().slice(0,10)} required/></label><label className="field field-wide"><span>Payment reference</span><input name="reference" required maxLength={1000} placeholder="Receipt or transaction reference"/></label></div><label className="deposit-confirmation"><input type="checkbox" name="confirmed" required/><span>I confirm this deposit was received.</span></label><button className="button button-primary" disabled={busy}>{busy?"Recording…":"Record deposit"}</button></form>}</section>}{accepted&&deposit&&!project&&<section id="convert-to-project" className="record-list-panel lead-workflow-card lead-conversion-card"><div className="lead-conversion-heading"><div><p className="eyebrow">Project setup</p><h2>Convert to website project</h2><p>Set the project name and delivery dates before creating the project.</p></div><span className="lead-conversion-ready"><CrmIcon name="check"/>Ready</span></div><form className="record-form lead-conversion-form" onSubmit={event=>void convert(event,accepted)}><div className="lead-conversion-fields"><label className="field lead-conversion-project-name"><span>Project name</span><input name="project_name" defaultValue={`${lead.company_name} website`} required maxLength={180}/></label>{!lead.client_id&&<><label className="field"><span>Existing client (optional)</span><input type="hidden" name="client_id" value={conversionClientId}/>{conversionClients===null?<Loading label="Loading clients…"/>:conversionClientError?<p className="field-error" role="alert">Existing clients could not load. Refresh this page to retry.</p>:<StageDropdown value={conversionClientId} options={["",...conversionClients.map((client:any)=>client.id)]} disabled={busy} label="Existing client" optionLabels={{"":"Create a new client",...Object.fromEntries(conversionClients.map((client:any)=>[client.id,client.name]))}} onChange={setConversionClientId} className="new-project-client-dropdown" minMenuWidth={240}/>}</label>{!conversionClientId&&<ClientTypeField/>}</>}<label className="field"><span>Start date <small>Optional</small></span><DatePicker name="start_date" label="Start date"/></label><label className="field"><span>Target date <small>Optional</small></span><DatePicker name="target_date" label="Target date"/></label></div><ImagePicker files={projectImages} onChange={setProjectImages} disabled={busy}/><label className="lead-conversion-confirm"><input type="checkbox" name="confirmed" required/><span><strong>Confirm project conversion</strong><small>I confirm the accepted agreement and deposit are recorded.</small></span></label><div className="lead-conversion-footer"><span>Project will be linked to the accepted proposal and deposit.</span><button className="button button-primary" disabled={busy}>{busy?"Creating project…":"Create project"}</button></div></form></section>}</div>{error&&<ErrorBox>{error}</ErrorBox>}{budgetOpen&&<Modal title="Estimated budget" description="Update the inquiry estimate. Leave both amounts blank if no budget has been discussed." onClose={()=>setBudgetOpen(false)} className="budget-editor-dialog"><form className="record-form" onSubmit={saveBudget}><div className="form-grid"><label className="field"><span>Budget from</span><input type="number" name="budget_min" min="0" step=".01" defaultValue={lead.budget_min??""}/></label><label className="field"><span>Budget to</span><input type="number" name="budget_max" min="0" step=".01" defaultValue={lead.budget_max??""}/></label><BudgetCurrencyField initialCurrency={lead.budget_currency??"USD"} label="Currency" disabled={busy}/></div>{budgetError&&<ErrorBox>{budgetError}</ErrorBox>}<div className="form-actions"><button type="button" className="button button-secondary" onClick={()=>setBudgetOpen(false)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy?"Saving…":"Save budget"}</button></div></form></Modal>}</div>}
function ProposalForm({lead,onSaved}:{lead:any;onSaved:()=>void}){const {founder}=useAuth();const notify=useToast();const [currency,setCurrency]=useState("USD");async function submit(event:FormEvent<HTMLFormElement>){const proposalForm=event.currentTarget;event.preventDefault();const form=new FormData(proposalForm);const {data:latest}=await db().from("proposals").select("version").eq("workspace_id",founder!.workspaceId).eq("lead_id",lead.id).order("version",{ascending:false}).limit(1).maybeSingle();const {error}=await db().from("proposals").insert({workspace_id:founder!.workspaceId,lead_id:lead.id,version:(latest?.version??0)+1,scope_summary:String(form.get("scope_summary")),amount:Number(form.get("amount")),currency:String(form.get("currency")),created_by:founder!.userId});if(error)notify(error.message,true);else{notify("Proposal draft created.");proposalForm.reset();setCurrency("USD");onSaved();}}return <details className="proposal-create"><summary>Create proposal version</summary><form className="record-form" onSubmit={submit}><label className="field"><span>Scope summary</span><textarea name="scope_summary" required rows={4}/></label><label className="field"><span>Amount</span><input type="number" name="amount" min="0" step=".01" required/></label><div className="field budget-currency-field"><span>Currency</span><input type="hidden" name="currency" value={currency}/><StageDropdown value={currency} options={budgetCurrencies} disabled={false} label="Proposal currency" optionLabels={budgetCurrencyNames} optionIcon={(option)=><span className="budget-currency-symbol" aria-hidden="true">{budgetCurrencySymbols[option]}</span>} onChange={setCurrency} className="budget-currency-dropdown" minMenuWidth={245}/></div><button className="button button-primary">Save proposal draft</button></form></details>}