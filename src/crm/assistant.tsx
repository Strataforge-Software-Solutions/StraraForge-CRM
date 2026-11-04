import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { db, moneyText, useAuth, useToast } from "./core";
import { compactRecordPath, decodeRecordId } from "./record-links";
import { RecordAvatar } from "./images";

type Conversation = { id: string; title: string; updated_at: string };
type Message = { id: string; role: "user" | "assistant"; content: string; created_at: string };
type Action = { id: string; kind: string; payload: Record<string, unknown>; summary: string; voice_phrase: string | null; status: string; expires_at: string; created_at: string; result?: { message: string; href?: string } | null };
type AssistantLeadContext = { id: string; company_name: string; contact_name: string | null; stage: string; source: string | null; budget_min: number | null; budget_max: number | null; budget_currency: string | null };

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await db().auth.getSession();
  if (!data.session?.access_token) throw new Error("Sign in again to use the assistant.");
  let response: Response;
  try {
    response = await fetch(`/api/ai/${path}`, { ...options, headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(typeof options.body === "string" ? { "Content-Type": "application/json" } : {}), ...options.headers
    } });
  } catch {
    throw new Error("Forgey’s service could not be reached. Your request is still in the composer; check the connection and retry.");
  }
  let result: any;
  try { result = await response.json(); } catch { throw new Error("Forgey did not receive a complete response. Your message is still in the composer; try again."); }
  if (!response.ok) {
    const requestRef = result.requestId ? ` Reference: ${result.requestId}.` : "";
    const retry = Number(result.retryAfterSeconds);
    if (result.code === "AI_PROVIDER_RATE_LIMITED" && retry > 0) {
      throw new Error(`Forgey is rate-limited. Your message is still in the composer; retry in about ${retry} seconds.${requestRef}`);
    }
    if (result.code === "AI_USAGE_LIMIT" && retry > 0) {
      throw new Error(`Forgey has reached its hourly request limit. Your message is still in the composer; retry in about ${Math.ceil(retry / 60)} minutes.${requestRef}`);
    }
    if (result.code === "TRANSCRIPTION_RATE_LIMITED" && retry > 0) {
      throw new Error(`Voice transcription is rate-limited. Your transcript draft is still here; retry in about ${retry} seconds or keep typing.${requestRef}`);
    }
    throw new Error(`${result.error || "Forgey request failed."}${requestRef}`);
  }
  return result as T;
}
const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
function findMentionedLead(prompt: string, leads: AssistantLeadContext[]): AssistantLeadContext | null {
  const normalizedPrompt = normalize(prompt);
  const matches = leads.flatMap((lead) => [
    { lead, alias: normalize(lead.company_name), priority: 2 },
    { lead, alias: normalize(lead.contact_name || ""), priority: 1 }
  ]).filter((item) => item.alias.length >= 2 && normalizedPrompt.includes(item.alias))
    .sort((left, right) => right.priority - left.priority || right.alias.length - left.alias.length);
  if (!matches.length) return null;
  const best = matches[0];
  const equallySpecific = matches.filter((item) => item.priority === best.priority && item.alias.length === best.alias.length);
  return new Set(equallySpecific.map((item) => item.lead.id)).size === 1 ? best.lead : null;
}
const capitalizeReply = (value: string) => value.replace(/^(\s*)[a-z]/, (_match, whitespace: string, letter: string) => whitespace + letter.toUpperCase());
const crmScopeReply = "I can help with StrataForge CRM leads, clients, tasks, projects, proposals, payments, and follow-ups. I can’t create code or system commands. What would you like to do in the CRM?";
const isBlockedRequest = (value: string) => /\b(?:php|python|javascript|typescript|html|css|sql|bash|shell|powershell)\b.{0,50}\b(?:code|snippet|script|program|example|sample)\b|\b(?:code|snippet|script|program|example|sample)\b.{0,50}\b(?:php|python|javascript|typescript|html|css|sql|bash|shell|powershell)\b|\b(?:write|make|create|generate|show|give|build)\b.{0,70}\b(?:code|snippet|script|program|terminal command|command line)\b|```|<\?php|\b(?:npm|npx|pip|sudo|curl|chmod)\s+(?:install|run|exec|add|start)\b|\b(?:ignore|disregard|override|bypass|reveal|repeat|print|show|follow)\b.{0,70}\b(?:system|developer|previous|hidden|internal|prompt|instructions|rules|api key|secret|credentials|chain.of.thought)\b|\b(?:pretend|act)\s+(?:to\s+be|as)\b|\b(?:jailbreak|prompt injection|developer message|system prompt)\b/i.test(value);
const safeReply = (value: string) => /```|<\?(?:php|=)|^\s*(?:#!|\$\s|npm\s|npx\s|pip\s|sudo\s|curl\s|SELECT\s+.+\s+FROM\s|console\.log\s*\()/im.test(value) ? crmScopeReply : value;

function actionDetails(payload: Record<string, unknown>) {
  const currency = String(payload.currency || payload.budget_currency || "");
  const rows: Array<{ label: string; value: string }> = [];
  const visit = (record: Record<string, unknown>, parent = "") => {
    for (const [key, value] of Object.entries(record)) {
      if (key === "id" || key.endsWith("_id") || key === "expected_updated_at") continue;
      const label = key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
      if (value && typeof value === "object" && !Array.isArray(value)) { visit(value as Record<string, unknown>, parent); continue; }
      if (Array.isArray(value)) { rows.push({ label: parent ? `${parent} ${label}` : label, value: value.map(String).join(", ") }); continue; }
      if (value === null || value === undefined || value === "") continue;
      const rowLabel = parent ? `${parent} ${label}` : label;
      const isMoney = /(budget|amount|price|deposit|payment|total)/i.test(key);
      const rowValue = typeof value === "number" && isMoney && /^[A-Z]{3}$/.test(currency)
        ? new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value)
        : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
      rows.push({ label: rowLabel, value: rowValue });
    }
  };
  visit(payload);
  return rows;
}

const assistantFieldLabels: Record<string, string> = {
  company_name: "Company Name", contact_name: "Contact Name", email: "Email", phone: "Phone Number",
  website_brief: "Project Brief", project_type: "Project Type", timeline: "Timeline", stage: "Lead Stage",
  source: "Source", budget_min: "Minimum Budget", budget_max: "Maximum Budget", budget_currency: "Budget Currency",
  next_follow_up_at: "Next Follow-up", client_type: "Client Type", relationship_status: "Relationship Status",
  created_at: "Created Date", updated_at: "Last Updated",
};

function humanizeFieldIdentifiers(text: string): string {
  const fields = Object.keys(assistantFieldLabels).sort((left, right) => right.length - left.length).join("|");
  const fieldList = new RegExp(`\\b(?:${fields})(?:\\s*,\\s*(?:${fields})){2,}\\b`, "gi");
  const friendlyList = text.replace(fieldList, (list) => list.split(/\s*,\s*/).map((field) => assistantFieldLabels[field.toLowerCase()] ?? field).join(", "));
  return friendlyList.replace(/`?\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b`?/gi, (identifier) => {
    const field = identifier.replaceAll("`", "").toLowerCase();
    if (assistantFieldLabels[field]) return assistantFieldLabels[field];
    return field.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  });
}

function replyInline(text: string, close: () => void): ReactNode[] {
  const token = /\*\*[^*\n]+\*\*|\[([^\]\n]+)\]\((\/(?:leads|clients|projects)\/(?:[0-9a-f-]{36}|[A-Za-z0-9_-]{22})|\/tasks-deals)\)|(\/(?:leads|clients|projects)\/(?:[0-9a-f-]{36}|[A-Za-z0-9_-]{22})|\/tasks-deals)/gi;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let index = 0;
  for (const match of text.matchAll(token)) {
    const offset = match.index ?? 0;
    if (offset > lastIndex) parts.push(<span key={index++}>{text.slice(lastIndex, offset)}</span>);
    const value = match[0];
    if (value.startsWith("**")) parts.push(<strong key={index++}>{value.slice(2, -2)}</strong>);
    else {
      const href = match[2] || match[3];
      const path = compactRecordPath(href);
      parts.push(<Link key={index++} to={path} onClick={close}>{match[1] || path}</Link>);
    }
    lastIndex = offset + value.length;
  }
  if (lastIndex < text.length) parts.push(<span key={index}>{text.slice(lastIndex)}</span>);
  return parts;
}

function Reply({ text, close, assistant }: { text: string; close: () => void; assistant: boolean }) {
  const blocks: ReactNode[] = [];
  const incompleteBold = (text.match(/\*\*/g)?.length || 0) % 2 !== 0;
  const incompleteLink = /\[[^\]\n]*$/.test(text) || /\]\([^\)\n]*$/.test(text);
  const incomplete = assistant && (incompleteBold || incompleteLink);
  const lastMarker = assistant && incompleteBold ? text.lastIndexOf("**") : -1;
  let visibleText = lastMarker < 0 ? text : text.slice(0, lastMarker) + text.slice(lastMarker + 2);
  if (assistant && incompleteLink) {
    visibleText = visibleText.replace(/\[([^\]\n]+)\]\([^\)\n]*$/, "$1").replace(/\[[^\]\n]*$/, "");
  }
  const lines = visibleText.replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length;) {
    if (!lines[index].trim()) { index++; continue; }
    const numbered = lines[index].match(/^\s*(\d+)\.\s+(.+)$/);
    const bulleted = lines[index].match(/^\s*[-*•]\s+(.+)$/);
    if (numbered || bulleted) {
      const items: ReactNode[] = [];
      const start = numbered ? Number(numbered[1]) : 1;
      const ordered = !!numbered;
      while (index < lines.length) {
        const match = ordered ? lines[index].match(/^\s*\d+\.\s+(.+)$/) : lines[index].match(/^\s*[-*•]\s+(.+)$/);
        if (!match) break;
        items.push(<li key={index}>{replyInline(match[1], close)}</li>);
        index++;
      }
      blocks.push(ordered ? <ol key={index} start={start}>{items}</ol> : <ul key={index}>{items}</ul>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^\s*(?:\d+\.\s+|[-*•]\s+)/.test(lines[index])) paragraph.push(lines[index++]);
    if (!paragraph.length) paragraph.push(lines[index++]);
    blocks.push(<p key={index}>{replyInline(paragraph.join("\n"), close)}</p>);
  }
  return <div className="ai-reply">{blocks}{incomplete && <p className="ai-reply-incomplete">This earlier answer ended early. Ask me to continue.</p>}</div>;
}

function SpeakerIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M11 5 6.5 8.5H3v7h3.5L11 19V5Z"/><path d="M14.5 8.5a5 5 0 0 1 0 7"/><path d="M17 6a8 8 0 0 1 0 12"/></svg>;
}

function CopyIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>;
}

function MicrophoneIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8"/></svg>;
}

function MoreIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>;
}

function SendIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 19V5m-7 7 7-7 7 7"/></svg>;
}

export function Assistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const notify = useToast();
  const { founder } = useAuth();
  const location = useLocation();
  const founderLabel = founder?.name.trim() || founder?.email.split("@")[0] || "You";
  const activeLeadParam = /^\/leads\/([^/]+)/.exec(location.pathname)?.[1] || null;
  const activeLeadId = activeLeadParam ? decodeRecordId(activeLeadParam) : null;
  const [ready, setReady] = useState<boolean | null>(null);
  const [healthIssue, setHealthIssue] = useState<"offline" | "configuration" | null>(null);
  const [healthRetry, setHealthRetry] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [list, setList] = useState<Conversation[]>([]);
  const [founderId, setFounderId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [openConversationMenu, setOpenConversationMenu] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingReply, setTypingReply] = useState<{ id: string; text: string } | null>(null);
  const [typedCharacters, setTypedCharacters] = useState(0);
  const [actions, setActions] = useState<Action[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [currentLead, setCurrentLead] = useState<AssistantLeadContext | null>(null);
  const [currentLeadLoading, setCurrentLeadLoading] = useState(false);
  const [currentLeadUnavailable, setCurrentLeadUnavailable] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [attested, setAttested] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const recordingSessionRef = useRef(0);
  const stopRequestedRef = useRef(false);
  const voiceActiveRef = useRef(false);
  const transcriptionFailedRef = useRef(false);
  const transcriptTextRef = useRef("");
  const transcriptQueueRef = useRef<Promise<void>>(Promise.resolve());
  const recordingAbortRef = useRef<AbortController | null>(null);
  const oldFocus = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeStartedRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const leadDirectoryRef = useRef<AssistantLeadContext[]>([]);
  const leadDirectoryLoadedRef = useRef(false);

  useEffect(() => {
    let active = true;
    if (!open || !founder?.workspaceId) {
      leadDirectoryRef.current = [];
      leadDirectoryLoadedRef.current = false;
      setCurrentLead(null);
      setCurrentLeadLoading(false);
      setCurrentLeadUnavailable(Boolean(open && activeLeadId));
      return () => { active = false; };
    }
    leadDirectoryLoadedRef.current = false;
    if (activeLeadId) {
      setCurrentLead(null);
      setCurrentLeadLoading(true);
    } else {
      setCurrentLead(null);
      setCurrentLeadLoading(false);
    }
    setCurrentLeadUnavailable(false);
    void (async () => {
      try {
        const { data, error: leadError } = await db().from("leads").select("id,company_name,contact_name,stage,source,budget_min,budget_max,budget_currency")
          .eq("workspace_id", founder.workspaceId).is("archived_at", null);
        if (!active) return;
        const directory = (data || []) as AssistantLeadContext[];
        leadDirectoryRef.current = directory;
        leadDirectoryLoadedRef.current = !leadError;
        if (activeLeadId) setCurrentLead(directory.find((lead) => lead.id === activeLeadId) || null);
        setCurrentLeadUnavailable(Boolean(leadError));
        setCurrentLeadLoading(false);
      } catch {
        if (!active) return;
        leadDirectoryRef.current = [];
        leadDirectoryLoadedRef.current = false;
        setCurrentLead(null);
        setCurrentLeadUnavailable(true);
        setCurrentLeadLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, activeLeadId, founder?.workspaceId]);

  useEffect(() => {
    if (!typingReply) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTypingReply(null);
      return;
    }
    const tickMs = 24;
    const durationMs = Math.min(1800, Math.max(320, typingReply.text.length * 12));
    const step = Math.max(1, Math.ceil(typingReply.text.length / (durationMs / tickMs)));
    let visible = 0;
    setTypedCharacters(0);
    const timer = window.setInterval(() => {
      visible = Math.min(typingReply.text.length, visible + step);
      setTypedCharacters(visible);
      if (visible >= typingReply.text.length) {
        window.clearInterval(timer);
        setTypingReply(null);
      }
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [typingReply]);

  const requestClose = useCallback(() => {
    if (closeStartedRef.current) return;
    closeStartedRef.current = true;
    setClosing(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimerRef.current = window.setTimeout(onClose, reducedMotion ? 0 : 480);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    closeStartedRef.current = false;
    setClosing(false);
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => { body.style.overflow = previousOverflow; };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const launcher = document.querySelector<HTMLElement>(".ai-floating-button");
    if (!launcher) return;

    const launcherBounds = launcher.getBoundingClientRect();
    const panelBounds = panelRef.current.getBoundingClientRect();
    const translateX = launcherBounds.left + launcherBounds.width / 2 - (panelBounds.left + panelBounds.width / 2);
    const translateY = launcherBounds.top + launcherBounds.height / 2 - (panelBounds.top + panelBounds.height / 2);
    panelRef.current.style.setProperty("--ai-origin-translate-x", `${translateX}px`);
    panelRef.current.style.setProperty("--ai-origin-translate-y", `${translateY}px`);
    panelRef.current.style.setProperty("--ai-origin-scale-x", String(Math.min(1, Math.max(0.02, launcherBounds.width / panelBounds.width))));
    panelRef.current.style.setProperty("--ai-origin-scale-y", String(Math.min(1, Math.max(0.02, launcherBounds.height / panelBounds.height))));
  }, [open]);

  const loadList = useCallback(async () => setList((await api<{ conversations: Conversation[] }>("conversations")).conversations), []);
  const load = useCallback(async (id: string) => {
    setError("");
    setTypingReply(null);
    const result = await api<{ messages: Message[]; actions: Action[] }>(`conversations/${id}`);
    setConversationId(id); setMessages(result.messages); setActions(result.actions);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void db().auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (!id || cancelled) return;
      let saved: string[] = [];
      try {
        const parsed = JSON.parse(localStorage.getItem(`strataforge.ai.pinned.${id}`) || "[]");
        if (Array.isArray(parsed)) saved = parsed.filter((item): item is string => typeof item === "string");
      } catch { /* Ignore malformed local pin state. */ }
      setFounderId(id); setPinnedIds(saved);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open]);
  useEffect(() => {
    if (founderId) {
      try { localStorage.setItem(`strataforge.ai.pinned.${founderId}`, JSON.stringify(pinnedIds)); }
      catch { /* Pins stay available for the current session if browser storage is disabled. */ }
    }
  }, [founderId, pinnedIds]);

  useEffect(() => {
    if (!open) { setReady(null); setHealthIssue(null); return; }
    let cancelled = false;
    let timer: number | undefined;
    let wasReady = false;
    const checkHealth = async () => {
      let retryDelay = 2500;
      try {
        const response = await fetch("/api/ai/health", { cache: "no-store" });
        const health = await response.json() as { ready?: boolean };
        if (cancelled) return;
        if (response.ok && health.ready === true) {
          const shouldLoad = !wasReady;
          wasReady = true;
          setReady(true); setHealthIssue(null);
          if (shouldLoad) void loadList().catch((cause) => setError((cause as Error).message));
          return;
        }
        wasReady = false;
        setReady(false); setHealthIssue(response.ok ? "configuration" : "offline");
        retryDelay = response.ok ? 10000 : 3000;
      } catch {
        if (cancelled) return;
        wasReady = false;
        setReady(false); setHealthIssue("offline");
      }
      if (!cancelled) timer = window.setTimeout(() => void checkHealth(), retryDelay);
    };
    const retryNow = () => {
      if (timer) window.clearTimeout(timer);
      void checkHealth();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") retryNow(); };
    void checkHealth();
    window.addEventListener("focus", retryNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", retryNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [open, loadList, healthRetry]);

  useEffect(() => {
    if (!open) return;
    oldFocus.current = document.activeElement as HTMLElement;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (deleteTarget) { setDeleteTarget(null); return; } if (renameTarget) { setRenameTarget(null); return; } if (openConversationMenu) { setOpenConversationMenu(null); return; } if (historyOpen) { setHistoryOpen(false); return; } if (contextOpen) { setContextOpen(false); return; } requestClose(); return; }
      if (event.key !== "Tab") return;
      if (deleteTarget || renameTarget) {
        const modalFocus = [...document.querySelectorAll<HTMLElement>('.ai-delete-dialog button:not(:disabled), .ai-delete-dialog input:not(:disabled)')];
        if (modalFocus.length && event.shiftKey && document.activeElement === modalFocus[0]) { event.preventDefault(); modalFocus.at(-1)?.focus(); }
        else if (modalFocus.length && !event.shiftKey && document.activeElement === modalFocus.at(-1)) { event.preventDefault(); modalFocus[0].focus(); }
        return;
      }
      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') || [])];
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => { document.removeEventListener("keydown", onKey); oldFocus.current?.focus(); };
  }, [open, requestClose, deleteTarget, renameTarget, openConversationMenu, historyOpen, contextOpen]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages, actions, status]);
  useEffect(() => { if (recording) bottomRef.current?.scrollIntoView({ block: "end" }); }, [input, recording]);
  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = Math.min(field.scrollHeight, 180) + "px";
  }, [input]);
  useEffect(() => { if (!open) { window.speechSynthesis?.cancel(); if (releaseRecording()) { setRecording(false); setBusy(false); setStatus(""); } } }, [open]);
  useEffect(() => () => { releaseRecording(); window.speechSynthesis?.cancel(); }, []);

  async function createConversation() {
    setOpenConversationMenu(null);
    setTypingReply(null);
    const result = await api<{ conversation: Conversation }>("conversations", { method: "POST" });
    setList((current) => [result.conversation, ...current]); setConversationId(result.conversation.id); setMessages([]); setActions([]);
    return result.conversation.id;
  }
  async function deleteConversation() {
    const target = deleteTarget;
    if (!target || busy) return;
    setDeleteTarget(null); setOpenConversationMenu(null);
    setBusy(true); setError("");
    try {
      await api(`conversations/${target.id}`, { method: "DELETE" });
      setPinnedIds((current) => current.filter((id) => id !== target.id));
      if (target.id === conversationId) { setConversationId(null); setMessages([]); setActions([]); }
      await loadList();
    }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  async function renameConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = renameTarget;
    const title = renameValue.trim();
    if (!target || !title || busy) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ conversation: Conversation }>(`conversations/${target.id}`, { method: "PATCH", body: JSON.stringify({ title }) });
      setList((current) => current.map((item) => item.id === target.id ? result.conversation : item));
      setRenameTarget(null); setOpenConversationMenu(null);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  function chooseConversation(id: string) {
    setHistoryOpen(false);
    setOpenConversationMenu(null);
    if (id !== conversationId) void load(id).catch((cause) => setError((cause as Error).message));
  }
  async function confirm(action: Action, mode: "voice" | "tap", transcript?: string) {
    if (busy) return;
    setBusy(true); setError(""); setStatus("Saving the confirmed CRM change…");
    try {
      const result = await api<{ status: string; result: { message: string; href?: string }; message?: Message }>(`actions/${action.id}/confirm`, {
        method: "POST", body: JSON.stringify(mode === "voice" ? { mode, transcript } : { mode, acknowledged: true, attestation: attested[action.id] === true })
      });
      setActions((current) => current.map((item) => item.id === action.id ? { ...item, status: result.status, result: result.result } : item));
      if (result.message) {
        setMessages((current) => [...current, result.message!]);
        if (result.message.role === "assistant") setTypingReply({ id: result.message.id, text: humanizeFieldIdentifiers(capitalizeReply(safeReply(result.message.content))) });
      }
      window.dispatchEvent(new Event("strataforge:crm-data-changed"));
      notify("CRM change saved."); await loadList();
    } catch (cause) { const message = (cause as Error).message; if (conversationId) await load(conversationId).catch(() => {}); setError(message); }
    finally { setBusy(false); setStatus(""); }
  }
  async function reject(action: Action) {
    setBusy(true); setError("");
    try { await api(`actions/${action.id}/reject`, { method: "POST" }); setActions((current) => current.map((item) => item.id === action.id ? { ...item, status: "rejected" } : item)); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  function chooseQuickAction(prompt: string) {
    if (busy) return;
    setInput(prompt);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(prompt.length, prompt.length);
    });
  }
  async function send(text: string, fromVoice = false) {
    const value = text.trim(); if (!value || busy) return;
    // Finish the last reply before showing a new request's thinking indicator.
    // This prevents two assistant states from appearing at once if the founder
    // sends a follow-up while the previous reply is still animating.
    setTypingReply(null);
    if (isBlockedRequest(value)) {
      const now = new Date().toISOString();
      setInput(""); setError("");
      const replyId = `local-assistant-${Date.now()}`;
      setMessages((current) => [...current, { id: `local-user-${Date.now()}`, role: "user", content: value, created_at: now }, { id: replyId, role: "assistant", content: crmScopeReply, created_at: now }]);
      setTypingReply({ id: replyId, text: crmScopeReply });
      return;
    }
    const pending = [...actions].reverse().find((item) => item.status === "pending" && new Date(item.expires_at).getTime() > Date.now());
    if (fromVoice && pending?.voice_phrase && normalize(value) === normalize(pending.voice_phrase)) { setInput(""); await confirm(pending, "voice", value); return; }
    setBusy(true); setError(""); setStatus("Checking your CRM records…"); setInput("");
    if (!leadDirectoryLoadedRef.current && founder?.workspaceId) {
      try {
        const { data, error: directoryError } = await db().from("leads").select("id,company_name,contact_name,stage,source,budget_min,budget_max,budget_currency")
          .eq("workspace_id", founder.workspaceId).is("archived_at", null);
        if (!directoryError) {
          leadDirectoryRef.current = (data || []) as AssistantLeadContext[];
          leadDirectoryLoadedRef.current = true;
        }
      } catch { /* The assistant can still handle the message if the lead lookup is unavailable. */ }
    }
    const mentionedLead = findMentionedLead(value, leadDirectoryRef.current);
    if (mentionedLead) setCurrentLead(mentionedLead);
    let currentId = conversationId;
    const localId = `local-${Date.now()}`;
    try {
      const id = conversationId || await createConversation();
      currentId = id;
      setMessages((current) => [...current, { id: localId, role: "user", content: value, created_at: new Date().toISOString() }]);
      const result = await api<{ message: Message; action: Action | null }>(`conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ text: value, pagePath: window.location.pathname }) });
      setMessages((current) => [...current, result.message]);
      if (result.message.role === "assistant") setTypingReply({ id: result.message.id, text: humanizeFieldIdentifiers(capitalizeReply(safeReply(result.message.content))) });
      if (result.action) setActions((current) => [...current, result.action!]);
      await loadList();
    } catch (cause) { const message = (cause as Error).message; setMessages((current) => current.filter((item) => item.id !== localId)); if (currentId) await load(currentId).catch(() => {}); setError(message); setInput(value); }
    finally { setBusy(false); setStatus(""); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(input); }
  function composerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.repeat) return;
    event.preventDefault();
    if (!busy && !recording && input.trim()) void send(input);
  }
  function releaseRecording(): boolean {
    const wasActive = voiceActiveRef.current;
    voiceActiveRef.current = false;
    recordingSessionRef.current++;
    stopRequestedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    timerRef.current = null; segmentTimerRef.current = null;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") { recorder.onstop = null; recorder.stop(); }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recordingAbortRef.current?.abort();
    recordingAbortRef.current = null;
    return wasActive;
  }
  function stopRecording() {
    if (!voiceActiveRef.current || stopRequestedRef.current) return;
    stopRequestedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    timerRef.current = null; segmentTimerRef.current = null;
    setRecording(false); setBusy(true); setStatus("Finishing transcription…");
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }
  async function startRecording() {
    if (busy || voiceActiveRef.current) return;
    setError(""); setBusy(true); setStatus("Requesting microphone…");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setBusy(false); setStatus(""); setError("Microphone recording is unavailable. Type your request instead."); return; }
    const session = ++recordingSessionRef.current;
    voiceActiveRef.current = true;
    stopRequestedRef.current = false;
    transcriptionFailedRef.current = false;
    transcriptTextRef.current = input.trim();
    transcriptQueueRef.current = Promise.resolve();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: { ideal: 1 }, echoCancellation: { ideal: true }, noiseSuppression: { ideal: true }, autoGainControl: { ideal: true }
      } }); streamRef.current = stream;
      if (session !== recordingSessionRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const mime = ["audio/webm", "audio/ogg", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error("This browser's audio format is unsupported. Type your request instead.");
      const abort = new AbortController(); recordingAbortRef.current = abort;
      const queueSegment = (audio: Blob, segmentEndedAt: number) => {
        transcriptQueueRef.current = transcriptQueueRef.current.then(async () => {
          if (session !== recordingSessionRef.current || transcriptionFailedRef.current) return;
          const previousContext = encodeURIComponent(transcriptTextRef.current.slice(-240));
          const { transcript } = await api<{ transcript: string }>("transcribe", { method: "POST", body: audio, headers: { "Content-Type": mime, "X-Transcription-Context": previousContext }, signal: abort.signal });
          if (session !== recordingSessionRef.current || !transcript.trim()) return;
          transcriptTextRef.current = `${transcriptTextRef.current} ${transcript.trim()}`.trim().slice(0, 4000);
          setInput(transcriptTextRef.current);
          if (!stopRequestedRef.current) setStatus(`Listening… latest words updated in ${((Date.now() - segmentEndedAt) / 1000).toFixed(1)}s.`);
        }).catch((cause) => {
          if (session !== recordingSessionRef.current || abort.signal.aborted) return;
          transcriptionFailedRef.current = true;
          setError((cause as Error).message || "Speech could not be transcribed. Your draft is still here.");
          stopRecording();
        });
      };
      let finished = false;
      let listeningStarted = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        setRecording(false); setBusy(true); setStatus("Finishing transcription…");
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null; recorderRef.current = null;
        void transcriptQueueRef.current.then(() => {
          if (session !== recordingSessionRef.current) return;
          const transcript = transcriptTextRef.current.trim();
          const failed = transcriptionFailedRef.current;
          voiceActiveRef.current = false; recordingAbortRef.current = null;
          setBusy(false); setStatus("");
          if (!transcript && !failed) setError("No speech was detected. Try again or type your request.");
          const pending = [...actions].reverse().find((item) => item.status === "pending" && item.voice_phrase && new Date(item.expires_at).getTime() > Date.now());
          if (!failed && pending && normalize(transcript) === normalize(pending.voice_phrase!)) void send(transcript, true);
          else inputRef.current?.focus();
        });
      };
      const startSegment = () => {
        if (session !== recordingSessionRef.current || stopRequestedRef.current) return;
        const chunks: BlobPart[] = [];
        const startedAt = Date.now();
        const recorder = new MediaRecorder(stream, { mimeType: mime }); recorderRef.current = recorder;
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => {
          transcriptionFailedRef.current = true;
          setError("Microphone recording stopped unexpectedly. Your draft is still here.");
          stopRecording();
          if (recorder.state === "inactive") finish();
        };
        recorder.onstart = () => {
          if (session !== recordingSessionRef.current || stopRequestedRef.current) return;
          segmentTimerRef.current = window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 5000);
          if (!listeningStarted) {
            listeningStarted = true;
            setBusy(false); setRecording(true); setStatus("Listening… transcript updates every few seconds.");
            timerRef.current = window.setTimeout(stopRecording, 60000);
          }
        };
        recorder.onstop = () => {
          if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
          segmentTimerRef.current = null;
          const audio = new Blob(chunks, { type: mime });
          if (audio.size >= 1000 && Date.now() - startedAt >= 500) queueSegment(audio, Date.now());
          if (!stopRequestedRef.current && session === recordingSessionRef.current && stream.active) {
            try { startSegment(); }
            catch (cause) { transcriptionFailedRef.current = true; setError((cause as Error).message || "Microphone recording stopped unexpectedly."); finish(); }
          } else finish();
        };
        recorder.start();
      };
      setStatus("Starting microphone…");
      startSegment();
    } catch (cause) {
      if (session !== recordingSessionRef.current) return;
      releaseRecording(); setBusy(false); setRecording(false); setStatus("");
      setError(cause instanceof DOMException && cause.name === "NotAllowedError" ? "Allow microphone access for this CRM page, then try again." : (cause as Error).message || "Microphone access was denied.");
    }
  }
  function speak(text: string) {
    if (!("speechSynthesis" in window)) { setError("Spoken playback is unavailable on this device."); return; }
    window.speechSynthesis.cancel(); const speech = new SpeechSynthesisUtterance(text);
    speech.lang = /[ñ]|\b(ang|mga|po|salamat|kailangan)\b/i.test(text) ? "fil-PH" : "en-US";
    window.speechSynthesis.speak(speech);
  }

  const timeline = [
    ...messages.map((item) => ({ type: "message" as const, item, created_at: item.created_at })),
    ...actions.map((item) => ({ type: "action" as const, item, created_at: item.created_at }))
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const currentLeadStage = currentLead?.stage.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "";
  const currentLeadBudget = currentLead && (currentLead.budget_min != null || currentLead.budget_max != null)
    ? currentLead.budget_min != null && currentLead.budget_max != null
      ? `${moneyText(currentLead.budget_min, currentLead.budget_currency || "USD")} – ${moneyText(currentLead.budget_max, currentLead.budget_currency || "USD")}`
      : moneyText(currentLead.budget_min ?? currentLead.budget_max, currentLead.budget_currency || "USD")
    : "Not discussed";
  const pinnedConversations = [...list].filter((item) => pinnedIds.includes(item.id)).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const recentConversations = [...list].filter((item) => !pinnedIds.includes(item.id)).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  function renderConversation(item: Conversation) {
    const pinned = pinnedIds.includes(item.id);
    const menuOpen = openConversationMenu === item.id;
    return <div key={item.id} className={`ai-history-row${item.id === conversationId ? " is-current" : ""}${pinned ? " is-pinned" : ""}`}>
      <button type="button" className="ai-history-select" aria-current={item.id === conversationId ? "page" : undefined} title={item.title} disabled={busy} onClick={() => chooseConversation(item.id)}><span>{item.title}</span><small>{new Date(item.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></button>
      <button type="button" className="ai-history-menu-toggle" aria-label={`Options for ${item.title}`} aria-haspopup="menu" aria-expanded={menuOpen} disabled={busy} onClick={() => setOpenConversationMenu(menuOpen ? null : item.id)}><MoreIcon/></button>
      {menuOpen && <div className="ai-history-menu" role="menu" aria-label={`Options for ${item.title}`}><button type="button" role="menuitem" onClick={() => { setRenameTarget(item); setRenameValue(item.title); setOpenConversationMenu(null); }}>Rename</button><button type="button" role="menuitem" onClick={() => { setPinnedIds((current) => pinned ? current.filter((id) => id !== item.id) : [item.id, ...current]); setOpenConversationMenu(null); }}>{pinned ? "Unpin" : "Pin"}</button><button type="button" role="menuitem" className="is-danger" onClick={() => { setDeleteTarget(item); setOpenConversationMenu(null); }}>Delete</button></div>}
    </div>;
  }

  if (!open) return null;
  return <div className={`ai-backdrop${closing ? " is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); else if (!(event.target instanceof Element) || !event.target.closest(".ai-history-row")) setOpenConversationMenu(null); }}>
    <section ref={panelRef} className={`ai-panel${historyOpen ? " history-open" : ""}${contextOpen ? " context-open" : ""}${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label="Forgey CRM assistant">
      <aside className="ai-sidebar" aria-label="Assistant conversations">
        <div className="ai-sidebar-brand"><div><small>StrataForge CRM</small><strong>Forgey AI</strong></div><button type="button" className="ai-sidebar-close" onClick={requestClose} aria-label="Close assistant">×</button></div>
        <button type="button" className="ai-new-chat" onClick={() => { setHistoryOpen(false); void createConversation().catch((cause) => setError((cause as Error).message)); }} disabled={busy || !ready}><span aria-hidden="true">＋</span>New chat</button>
        <nav className="ai-history" aria-label="Saved conversations">{pinnedConversations.length > 0 && <><h3>Pinned</h3>{pinnedConversations.map(renderConversation)}</>}<h3>Recent</h3>{recentConversations.length ? recentConversations.map(renderConversation) : !pinnedConversations.length && <p>Your conversations will appear here.</p>}</nav>
        <div className="ai-sidebar-footer">Forgey AI v1</div>
      </aside>
      <div className="ai-main" onClick={() => { if (historyOpen) setHistoryOpen(false); if (contextOpen) setContextOpen(false); }}>
      <header className="ai-header"><button type="button" className="ai-history-toggle" onClick={() => { setContextOpen(false); setHistoryOpen((value) => !value); }} aria-label={historyOpen ? "Close conversation history" : "Open conversation history"} aria-expanded={historyOpen}><span aria-hidden="true">☰</span></button><div className="ai-main-heading"><h2>CRM Assistant</h2></div><div><span className="ai-current-title">{list.find((item) => item.id === conversationId)?.title || "New conversation"}</span><button type="button" className="ai-context-toggle" onClick={() => { setHistoryOpen(false); setContextOpen((value) => !value); }} aria-label={contextOpen ? "Close Forgey tools" : "Open Forgey tools"} aria-expanded={contextOpen}><span aria-hidden="true">☷</span></button><button type="button" onClick={requestClose} aria-label="Close assistant">×</button></div></header>
      {ready === null ? <div className="ai-connection-state" role="status">Connecting to Forgey…</div> : !ready ? <div className="ai-connection-state" role="status"><strong>{healthIssue === "configuration" ? "Forgey’s server settings need attention" : "Forgey is reconnecting"}</strong><p>{healthIssue === "configuration" ? "The assistant will check again automatically. If this continues, the server environment settings need to be checked." : "The assistant service is temporarily unavailable. It will reconnect automatically; you can also retry now."}</p><button type="button" className="button button-secondary" onClick={() => setHealthRetry((attempt) => attempt + 1)}>Retry connection</button></div> : <>
        <div className={`ai-chat-content${!messages.length && !actions.length && !recording ? " is-empty" : ""}`}>
        <div className="ai-thread" aria-label="Assistant conversation">
          {!messages.length && !actions.length && !recording && <div className="ai-empty"><strong>What would you like to do?</strong><p>Try “Which leads need follow-up?” or “Create a lead for Acme.” Speak or type in English, Filipino, or Taglish.</p></div>}
          {timeline.map((entry) => {
            if (entry.type === "message") {
              const message = entry.item;
              const content = message.role === "assistant" ? humanizeFieldIdentifiers(capitalizeReply(safeReply(message.content))) : message.content;
              const isTyping = message.role === "assistant" && typingReply?.id === message.id;
              const visibleContent = isTyping ? content.slice(0, typedCharacters) : content;
              const completedUpdate = message.role === "assistant" ? actions
                .filter((action) => action.kind === "update_lead" && action.status === "succeeded" && action.result?.message === message.content && new Date(action.created_at).getTime() <= new Date(message.created_at).getTime())
                .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
                .pop() : undefined;
              if (completedUpdate) {
                const leadName = completedUpdate.summary.split(":").slice(1).join(":").trim();
                const changes = completedUpdate.payload.changes && typeof completedUpdate.payload.changes === "object" ? completedUpdate.payload.changes as Record<string, unknown> : {};
                const description = Object.entries(changes).map(([field, value]) => {
                  const label = assistantFieldLabels[field] || field.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
                  const displayValue = value == null || value === "" ? "Not set" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
                  return `${label.toLowerCase()} is now ${displayValue}`;
                }).join("; ");
                return <article key={`message-${message.id}`} className="ai-message is-assistant ai-message-success" aria-label={`Update completed for ${leadName}`}>
                  <span className="ai-message-success-icon" aria-hidden="true">✓</span>
                  <div className="ai-message-success-copy"><strong>Update completed.</strong><p>{leadName}{description ? ` ${description}` : " was updated successfully"}.</p><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time></div>
                </article>;
              }
              return <article key={`message-${message.id}`} className={`ai-message is-${message.role}${isTyping ? " is-typing" : ""}`}><span>{message.role === "assistant" ? "Forgey" : founderLabel}</span><Reply text={visibleContent} close={requestClose} assistant={message.role === "assistant"}/>{isTyping && <span className="ai-type-caret" aria-hidden="true"/>}{message.role === "assistant" && <div className="ai-message-tools"><button type="button" className="ai-play ai-listen" aria-label="Listen to Forgey reply" title="Listen to reply" onClick={() => speak(content)}><SpeakerIcon/></button><button type="button" className="ai-play ai-copy" aria-label="Copy Forgey reply" title="Copy reply" onClick={() => void navigator.clipboard.writeText(content).then(() => notify("Reply copied.")).catch(() => setError("Copy is unavailable on this device."))}><CopyIcon/></button></div>}</article>;
            }
            const action = entry.item;
            const needsAttestation = ["record_deposit", "record_progress_payment", "accept_proposal", "mark_proposal_sent", "convert_lead"].includes(action.kind);
            const leadChanges = action.payload.changes && typeof action.payload.changes === "object" ? action.payload.changes as Record<string, unknown> : {};
            const previousValues = action.payload.previous_values && typeof action.payload.previous_values === "object" ? action.payload.previous_values as Record<string, unknown> : {};
            const formatChangeValue = (value: unknown) => value == null || value === "" ? "Not set" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
            if (action.kind === "update_lead") {
              const leadName = action.summary.split(":").slice(1).join(":").trim();
              const isPending = action.status === "pending" && new Date(action.expires_at).getTime() > Date.now();
              return <article key={`action-${action.id}`} className={`ai-action ai-action-review${isPending ? " is-pending" : ""}`} aria-label={`Lead change approval for ${leadName}`}>
                <header className="ai-action-review-header"><span className="ai-action-review-icon" aria-hidden="true">✎</span><div className="ai-action-review-heading"><strong>Update lead · {leadName}</strong><span>Review the changes before applying.</span></div><span className={`ai-action-review-badge${isPending ? " is-pending" : action.status === "succeeded" ? " is-approved" : action.status === "rejected" ? " is-rejected" : ""}`}>{isPending ? <><span aria-hidden="true">◷</span> Needs Approval</> : action.status === "succeeded" ? "Approved" : action.status === "rejected" ? "Cancelled" : action.status === "failed" ? "Failed" : "Expired"}</span></header>
                {Object.keys(leadChanges).length > 0 && <dl className="ai-action-review-changes">{Object.entries(leadChanges).map(([field, nextValue]) => <div className="ai-action-review-change" key={field}><dt>{assistantFieldLabels[field] || field.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</dt><dd><span className="ai-action-review-before">{formatChangeValue(previousValues[field])}</span><span className="ai-action-review-arrow" aria-label="changes to">→</span><span className="ai-action-review-after">{formatChangeValue(nextValue)}</span></dd></div>)}</dl>}
                {isPending ? <><p className="ai-action-review-help">{action.voice_phrase ? `To confirm by voice, say “${action.voice_phrase}”.` : "Confirm to apply this change to the lead record."}</p>{needsAttestation && <label className="ai-attestation"><input type="checkbox" checked={!!attested[action.id]} onChange={(event) => setAttested((current) => ({ ...current, [action.id]: event.target.checked }))}/><span>I confirm these details are correct.</span></label>}<div className="ai-action-controls ai-action-review-controls"><button type="button" className="button button-secondary" disabled={busy} onClick={() => void reject(action)}>Cancel</button><button type="button" className="button button-primary" disabled={busy || (needsAttestation && !attested[action.id])} onClick={() => void confirm(action, "tap")}>✓ &nbsp;Confirm Change</button></div></> : <p className="ai-action-state">{action.status === "succeeded" ? "Change saved." : action.status === "rejected" ? "Change cancelled." : action.status === "failed" ? "Change failed." : "This approval expired."}{action.result?.href && <> · <Link className="button button-secondary ai-open-record" to={compactRecordPath(action.result.href)} onClick={requestClose}>Open lead</Link></>}</p>}
              </article>;
            }
            return <article key={`action-${action.id}`} className="ai-action"><span className="ai-action-label">Proposed CRM change</span><strong>{action.summary}</strong><dl>{actionDetails(action.payload).map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{action.status === "pending" && new Date(action.expires_at).getTime() > Date.now() ? <><p>Review these details. {action.voice_phrase ? `To confirm by voice, say “${action.voice_phrase}”.` : "This action requires a tap confirmation."}</p>{needsAttestation && <label className="ai-attestation"><input type="checkbox" checked={!!attested[action.id]} onChange={(event) => setAttested((current) => ({ ...current, [action.id]: event.target.checked }))}/><span>{action.kind === "record_deposit" || action.kind === "record_progress_payment" ? "I confirm this payment was received." : action.kind === "accept_proposal" ? "I confirm the client accepted this proposal and the evidence is correct." : action.kind === "mark_proposal_sent" ? "I confirm this proposal was sent outside the CRM." : "I confirm the accepted proposal and deposit are recorded."}</span></label>}<div className="ai-action-controls"><button type="button" className="button button-primary" disabled={busy || (needsAttestation && !attested[action.id])} onClick={() => void confirm(action, "tap")}>Confirm change</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => void reject(action)}>Reject</button></div></> : <p className="ai-action-state">{action.status === "succeeded" ? "Saved" : action.status === "rejected" ? "Rejected" : action.status === "pending" ? "Expired" : action.status === "failed" ? "Failed" : "Processing"}{action.result?.href && <> · <Link className="button button-secondary ai-open-record" to={compactRecordPath(action.result.href)} onClick={requestClose}>Open record</Link></>}</p>}</article>;
          })}
          {busy && !typingReply && status === "Checking your CRM records…" && <article className="ai-message is-assistant ai-thinking" role="status" aria-label="Forgey is thinking"><span>Forgey</span><p><span>Forgey is thinking</span><span className="ai-thinking-dots" aria-hidden="true"><i/><i/><i/></span></p></article>}
          {recording && <article className="ai-message is-user ai-dictation-preview" role="status" aria-live="polite"><span>{founderLabel} · Dictating</span><p>{input.trim() || "Listening for your voice…"}</p></article>}
          <div ref={bottomRef}/>
        </div>
        <div className="ai-footer"><p className="ai-privacy">Voice clips are sent to Groq in short segments for live transcription. StrataForge does not store audio; chats are kept for 90 days. Client emails are drafts only.</p>{status && <p role="status" className="ai-status">{status}</p>}{error && <p role="alert" className="ai-error">{error}</p>}<form onSubmit={submit}><textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={composerKeyDown} placeholder="Ask or tell the assistant what to do…" rows={1} wrap="soft" maxLength={4000} aria-label="Message to CRM assistant" aria-describedby="ai-compose-hint" readOnly={recording} disabled={busy && !recording}/><span id="ai-compose-hint" className="ai-compose-hint">Enter to send · Shift+Enter for a new line</span><div className="ai-compose-actions"><button type="button" className={`ai-mic-button${recording ? " is-recording" : ""}`} onClick={recording ? stopRecording : () => void startRecording()} disabled={busy} aria-label={recording ? "Stop recording" : "Start microphone recording"} title={recording ? "Stop recording" : "Record a voice message"}><MicrophoneIcon/><span>{recording ? "Stop recording" : "Microphone"}</span></button><button type="submit" className="ai-send-button" aria-label="Send message" title="Send message" disabled={busy || recording || !input.trim()}><SendIcon/><span>Send</span></button></div></form></div>
        </div>
      </>}
      </div>
      <aside className="ai-context-sidebar" aria-label="Forgey tools and current record">
        <div className="ai-context-heading"><span className="ai-tool-icon" aria-hidden="true">✦</span><strong>Forgey Tools</strong></div>
        <div className="ai-sidebar-scroll">
          <button type="button" className={`ai-voice-card${recording ? " is-recording" : ""}`} onClick={recording ? stopRecording : () => void startRecording()} disabled={busy && !recording} aria-label={recording ? "Stop voice assistant recording" : "Start voice assistant recording"}>
            <span className="ai-tool-card-heading"><span className="ai-tool-icon ai-voice-wave" aria-hidden="true"><i/><i/><i/><i/><i/></span><span><strong>Voice Assistant</strong><small>Talk to Forgey AI hands-free</small></span></span>
            <span className="ai-voice-mic"><MicrophoneIcon/></span>
            <span className="ai-voice-caption">{recording ? "Tap to stop" : busy ? status || "Working…" : "Tap to speak"}</span>
          </button>
          <section className="ai-tool-card ai-quick-actions" aria-labelledby="ai-quick-actions-title">
            <h3 id="ai-quick-actions-title"><span className="ai-tool-icon" aria-hidden="true">ϟ</span>Quick Actions</h3>
            <div>
              <button type="button" onClick={() => chooseQuickAction(currentLead ? `Update the ${currentLead.company_name} lead` : "Update a lead")} disabled={busy}><span className="ai-quick-action-icon" aria-hidden="true">✎</span><span>Update a lead</span><span aria-hidden="true">›</span></button>
              <button type="button" onClick={() => chooseQuickAction("Create a new lead")} disabled={busy}><span className="ai-quick-action-icon" aria-hidden="true">＋</span><span>Create a new lead</span><span aria-hidden="true">›</span></button>
              <button type="button" onClick={() => chooseQuickAction(currentLead ? `Change ${currentLead.company_name}'s lead source to ` : "Change the lead source to ")} disabled={busy}><span className="ai-quick-action-icon" aria-hidden="true">◈</span><span>Change lead source</span><span aria-hidden="true">›</span></button>
              <button type="button" onClick={() => chooseQuickAction(currentLead ? `Update ${currentLead.company_name}'s lead budget to ` : "Update the lead budget to ")} disabled={busy}><span className="ai-quick-action-icon" aria-hidden="true">▤</span><span>Update lead budget</span><span aria-hidden="true">›</span></button>
            </div>
          </section>
          <section className="ai-tool-card ai-current-record" aria-labelledby="ai-current-record-title">
            <h3 id="ai-current-record-title"><span className="ai-tool-icon" aria-hidden="true">♙</span>Current Record</h3>
            {currentLeadLoading ? <p className="ai-record-message" role="status">Loading current lead…</p> : currentLeadUnavailable ? <p className="ai-record-message" role="status">Lead details are unavailable right now.</p> : currentLead ? <>
              <div className="ai-record-summary"><RecordAvatar recordType="lead" recordId={currentLead.id} name={currentLead.company_name} className="ai-record-store"/><span><strong>{currentLead.company_name}</strong><small>Lead · {currentLeadStage}</small></span></div>
              <dl className="ai-record-fields"><div><dt><span aria-hidden="true">◈</span>Lead Source</dt><dd>{currentLead.source || "Not set"}</dd></div><div><dt><span aria-hidden="true">▤</span>Lead Budget</dt><dd>{currentLeadBudget}</dd></div></dl>
              <Link className="ai-record-link" to={`/leads/${currentLead.id}`} onClick={requestClose}>View Full Record <span aria-hidden="true">↗</span></Link>
            </> : <p className="ai-record-message">Open a lead to see its source and budget here.</p>}
          </section>
        </div>
      </aside>
    </section>
    {deleteTarget && <div className="ai-delete-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}><section className="ai-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ai-delete-title" aria-describedby="ai-delete-description"><span className="ai-delete-icon" aria-hidden="true">!</span><h3 id="ai-delete-title">Delete this conversation?</h3><p id="ai-delete-description"><strong>{deleteTarget.title}</strong> and its messages will be permanently deleted.</p>{error && <p className="ai-error" role="alert">{error}</p>}<div className="ai-delete-actions"><button type="button" className="button button-secondary" autoFocus onClick={() => setDeleteTarget(null)}>Cancel</button><button type="button" className="button button-danger" disabled={busy} onClick={() => void deleteConversation()}>Delete conversation</button></div></section></div>}
    {renameTarget && <div className="ai-delete-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameTarget(null); }}><section className="ai-delete-dialog ai-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-rename-title"><h3 id="ai-rename-title">Rename conversation</h3><form onSubmit={(event) => void renameConversation(event)}><label className="ai-rename-label" htmlFor="ai-rename-input">Conversation name</label><input id="ai-rename-input" className="ai-rename-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={100} required autoFocus/>{error && <p className="ai-error" role="alert">{error}</p>}<div className="ai-delete-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => setRenameTarget(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={busy || !renameValue.trim()}>Save name</button></div></form></section></div>}
  </div>;
}
