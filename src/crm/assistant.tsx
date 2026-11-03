import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { db, useToast } from "./core";

type Conversation = { id: string; title: string; updated_at: string };
type Message = { id: string; role: "user" | "assistant"; content: string; created_at: string };
type Action = { id: string; kind: string; payload: Record<string, unknown>; summary: string; voice_phrase: string | null; status: string; expires_at: string; created_at: string; result?: { message: string; href?: string } | null };

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await db().auth.getSession();
  if (!data.session?.access_token) throw new Error("Sign in again to use the assistant.");
  const response = await fetch(`/api/ai/${path}`, { ...options, headers: {
    Authorization: `Bearer ${data.session.access_token}`,
    ...(typeof options.body === "string" ? { "Content-Type": "application/json" } : {}), ...options.headers
  } });
  let result: any;
  try { result = await response.json(); } catch { throw new Error("The assistant service did not respond."); }
  if (!response.ok) throw new Error(result.error || "Assistant request failed.");
  return result as T;
}
const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
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

function replyInline(text: string, close: () => void): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|\/(?:leads|clients|projects)\/[0-9a-f-]{36}|\/tasks-deals)/gi).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^\/(?:leads|clients|projects)\/[0-9a-f-]{36}$|^\/tasks-deals$/i.test(part)) return <Link key={index} to={part} onClick={close}>{part}</Link>;
    return <span key={index}>{part}</span>;
  });
}

function Reply({ text, close, assistant }: { text: string; close: () => void; assistant: boolean }) {
  const blocks: ReactNode[] = [];
  const incomplete = assistant && (text.match(/\*\*/g)?.length || 0) % 2 !== 0;
  const lastMarker = incomplete ? text.lastIndexOf("**") : -1;
  const visibleText = lastMarker < 0 ? text : text.slice(0, lastMarker) + text.slice(lastMarker + 2);
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

export function Assistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const notify = useToast();
  const [ready, setReady] = useState<boolean | null>(null);
  const [list, setList] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
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
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const pickerMenuRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => setList((await api<{ conversations: Conversation[] }>("conversations")).conversations), []);
  const load = useCallback(async (id: string) => {
    setError("");
    const result = await api<{ messages: Message[]; actions: Action[] }>(`conversations/${id}`);
    setConversationId(id); setMessages(result.messages); setActions(result.actions);
  }, []);

  useEffect(() => {
    if (!open) return;
    oldFocus.current = document.activeElement as HTMLElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (deleteConfirmOpen) { setDeleteConfirmOpen(false); return; } onClose(); return; }
      if (event.key !== "Tab") return;
      if (deleteConfirmOpen) {
        const modalFocus = [...document.querySelectorAll<HTMLElement>('.ai-delete-dialog button:not(:disabled)')];
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
    void fetch("/api/ai/health").then((response) => response.json()).then(async (health: { ready: boolean }) => {
      setReady(!!health.ready); if (health.ready) await loadList();
    }).catch(() => setReady(false)).finally(() => setTimeout(() => inputRef.current?.focus(), 0));
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", onKey); oldFocus.current?.focus(); };
  }, [open, onClose, loadList, deleteConfirmOpen]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages, actions, status]);
  useEffect(() => { if (recording) bottomRef.current?.scrollIntoView({ block: "end" }); }, [input, recording]);
  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = Math.min(field.scrollHeight, 180) + "px";
  }, [input]);
  useEffect(() => {
    if (!pickerOpen) return;
    (pickerMenuRef.current?.querySelector<HTMLElement>('[aria-current="true"]') || pickerMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]'))?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [pickerOpen]);
  useEffect(() => { if (!open) { window.speechSynthesis?.cancel(); if (releaseRecording()) { setRecording(false); setBusy(false); setStatus(""); } } }, [open]);
  useEffect(() => () => { releaseRecording(); window.speechSynthesis?.cancel(); }, []);

  async function createConversation() {
    setPickerOpen(false);
    const result = await api<{ conversation: Conversation }>("conversations", { method: "POST" });
    setList((current) => [result.conversation, ...current]); setConversationId(result.conversation.id); setMessages([]); setActions([]);
    return result.conversation.id;
  }
  async function deleteConversation() {
    if (!conversationId || busy) return;
    setDeleteConfirmOpen(false);
    setBusy(true); setError("");
    try { await api(`conversations/${conversationId}`, { method: "DELETE" }); setConversationId(null); setMessages([]); setActions([]); await loadList(); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  function pickerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setPickerOpen(false); pickerButtonRef.current?.focus(); return; }
    if (event.key === "Tab") { setPickerOpen(false); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (!pickerOpen) { setPickerOpen(true); return; }
    const items = [...(pickerMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || [])];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
    items[next].focus();
  }
  function chooseConversation(id: string) {
    setPickerOpen(false);
    pickerButtonRef.current?.focus();
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
      if (result.message) setMessages((current) => [...current, result.message!]);
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
  async function send(text: string, fromVoice = false) {
    const value = text.trim(); if (!value || busy) return;
    if (isBlockedRequest(value)) {
      const now = new Date().toISOString();
      setInput(""); setError("");
      setMessages((current) => [...current, { id: `local-user-${Date.now()}`, role: "user", content: value, created_at: now }, { id: `local-assistant-${Date.now()}`, role: "assistant", content: crmScopeReply, created_at: now }]);
      return;
    }
    const pending = [...actions].reverse().find((item) => item.status === "pending" && new Date(item.expires_at).getTime() > Date.now());
    if (fromVoice && pending?.voice_phrase && normalize(value) === normalize(pending.voice_phrase)) { setInput(""); await confirm(pending, "voice", value); return; }
    setBusy(true); setError(""); setStatus("Checking your CRM records…"); setInput("");
    let currentId = conversationId;
    const localId = `local-${Date.now()}`;
    try {
      const id = conversationId || await createConversation();
      currentId = id;
      setMessages((current) => [...current, { id: localId, role: "user", content: value, created_at: new Date().toISOString() }]);
      const result = await api<{ message: Message; action: Action | null }>(`conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ text: value, pagePath: window.location.pathname }) });
      setMessages((current) => [...current, result.message]); if (result.action) setActions((current) => [...current, result.action!]);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream;
      if (session !== recordingSessionRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const mime = ["audio/webm", "audio/ogg", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error("This browser's audio format is unsupported. Type your request instead.");
      const abort = new AbortController(); recordingAbortRef.current = abort;
      const queueSegment = (audio: Blob) => {
        transcriptQueueRef.current = transcriptQueueRef.current.then(async () => {
          if (session !== recordingSessionRef.current || transcriptionFailedRef.current) return;
          const { transcript } = await api<{ transcript: string }>("transcribe", { method: "POST", body: audio, headers: { "Content-Type": mime }, signal: abort.signal });
          if (session !== recordingSessionRef.current || !transcript.trim()) return;
          transcriptTextRef.current = `${transcriptTextRef.current} ${transcript.trim()}`.trim().slice(0, 4000);
          setInput(transcriptTextRef.current);
        }).catch((cause) => {
          if (session !== recordingSessionRef.current || abort.signal.aborted) return;
          transcriptionFailedRef.current = true;
          setError((cause as Error).message || "Speech could not be transcribed. Your draft is still here.");
          stopRecording();
        });
      };
      let finished = false;
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
        recorder.onstop = () => {
          if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
          segmentTimerRef.current = null;
          const audio = new Blob(chunks, { type: mime });
          if (audio.size >= 1000 && Date.now() - startedAt >= 500) queueSegment(audio);
          if (!stopRequestedRef.current && session === recordingSessionRef.current && stream.active) {
            try { startSegment(); }
            catch (cause) { transcriptionFailedRef.current = true; setError((cause as Error).message || "Microphone recording stopped unexpectedly."); finish(); }
          } else finish();
        };
        recorder.start();
        segmentTimerRef.current = window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 5000);
      };
      startSegment();
      setBusy(false); setRecording(true); setStatus("Listening… transcript appears here every few seconds.");
      timerRef.current = window.setTimeout(stopRecording, 60000);
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

  if (!open) return null;
  return <div className="ai-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef} className="ai-panel" role="dialog" aria-modal="true" aria-label="CRM assistant">
      <header className="ai-header"><div><small>StrataForge CRM</small><h2>Forgey | AI CRM Assistant</h2></div><div><button type="button" onClick={() => void createConversation().catch((cause) => setError((cause as Error).message))} disabled={busy || !ready}>New chat</button><button type="button" onClick={onClose} aria-label="Close assistant">×</button></div></header>
      {ready === null ? <div className="ai-empty" role="status">Checking assistant setup…</div> : !ready ? <div className="ai-empty"><strong>Assistant setup needed</strong><p>Start the AI API and set its server environment values.</p></div> : <>
        <div className="ai-conversations"><span className="ai-conversation-label">Conversation</span><div className="ai-conversation-picker" ref={pickerRef} onKeyDown={pickerKeyDown}><button ref={pickerButtonRef} type="button" className="ai-conversation-trigger" aria-label="Conversation" aria-haspopup="menu" aria-expanded={pickerOpen} aria-controls="ai-conversation-menu" onClick={() => setPickerOpen((value) => !value)} disabled={busy}><span>{list.find((item) => item.id === conversationId)?.title || "New conversation"}</span><span className="ai-conversation-chevron" aria-hidden="true"/></button>{pickerOpen && <div className="ai-conversation-menu" id="ai-conversation-menu" role="menu" aria-label="Saved conversations" ref={pickerMenuRef}>{list.length ? list.map((item) => <button key={item.id} type="button" role="menuitem" aria-current={item.id === conversationId ? "true" : undefined} onClick={() => chooseConversation(item.id)}><span>{item.title}</span><small>{new Date(item.updated_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></button>) : <p>No saved conversations yet.</p>}</div>}</div>{conversationId && <button type="button" onClick={() => setDeleteConfirmOpen(true)} disabled={busy}>Delete</button>}</div>
        <div className="ai-thread" aria-label="Assistant conversation">
          {!messages.length && !actions.length && !recording && <div className="ai-empty"><strong>What would you like to do?</strong><p>Try “Which leads need follow-up?” or “Create a lead for Acme.” Speak or type in English, Filipino, or Taglish.</p></div>}
          {timeline.map((entry) => {
            if (entry.type === "message") {
              const message = entry.item;
              const content = message.role === "assistant" ? safeReply(message.content) : message.content;
              return <article key={`message-${message.id}`} className={`ai-message is-${message.role}`}><span>{message.role === "assistant" ? "Assistant" : "You"}</span><Reply text={content} close={onClose} assistant={message.role === "assistant"}/>{message.role === "assistant" && <div className="ai-message-tools"><button type="button" className="ai-play ai-listen" aria-label="Listen to assistant reply" title="Listen to reply" onClick={() => speak(content)}><SpeakerIcon/></button><button type="button" className="ai-play ai-copy" aria-label="Copy assistant reply" title="Copy reply" onClick={() => void navigator.clipboard.writeText(content).then(() => notify("Reply copied.")).catch(() => setError("Copy is unavailable on this device."))}><CopyIcon/></button></div>}</article>;
            }
            const action = entry.item;
            const needsAttestation = ["record_deposit", "record_progress_payment", "accept_proposal", "mark_proposal_sent", "convert_lead"].includes(action.kind);
            return <article key={`action-${action.id}`} className="ai-action"><span className="ai-action-label">Proposed CRM change</span><strong>{action.summary}</strong><dl>{actionDetails(action.payload).map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{action.status === "pending" && new Date(action.expires_at).getTime() > Date.now() ? <><p>Review these details. {action.voice_phrase ? `To confirm by voice, say “${action.voice_phrase}”.` : "This action requires a tap confirmation."}</p>{needsAttestation && <label className="ai-attestation"><input type="checkbox" checked={!!attested[action.id]} onChange={(event) => setAttested((current) => ({ ...current, [action.id]: event.target.checked }))}/><span>{action.kind === "record_deposit" || action.kind === "record_progress_payment" ? "I confirm this payment was received." : action.kind === "accept_proposal" ? "I confirm the client accepted this proposal and the evidence is correct." : action.kind === "mark_proposal_sent" ? "I confirm this proposal was sent outside the CRM." : "I confirm the accepted proposal and deposit are recorded."}</span></label>}<div className="ai-action-controls"><button type="button" className="button button-primary" disabled={busy || (needsAttestation && !attested[action.id])} onClick={() => void confirm(action, "tap")}>Confirm change</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => void reject(action)}>Reject</button></div></> : <p className="ai-action-state">{action.status === "succeeded" ? "Saved" : action.status === "rejected" ? "Rejected" : action.status === "pending" ? "Expired" : action.status === "failed" ? "Failed" : "Processing"}{action.result?.href && <> · <Link className="button button-secondary ai-open-record" to={action.result.href} onClick={onClose}>Open record</Link></>}</p>}</article>;
          })}
          {recording && <article className="ai-message is-user ai-dictation-preview" role="status" aria-live="polite"><span>You · Dictating</span><p>{input.trim() || "Listening for your voice…"}</p></article>}
          <div ref={bottomRef}/>
        </div>
        <div className="ai-footer"><p className="ai-privacy">Relevant CRM data and voice clips are sent to Groq. This CRM does not store audio; chats are kept for 90 days. Client emails are drafts only.</p>{status && <p role="status" className="ai-status">{status}</p>}{error && <p role="alert" className="ai-error">{error}</p>}<form onSubmit={submit}><textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={composerKeyDown} placeholder="Ask or tell the assistant what to do…" rows={2} maxLength={4000} aria-label="Message to CRM assistant" aria-describedby="ai-compose-hint" readOnly={recording} disabled={busy && !recording}/><span id="ai-compose-hint" className="ai-compose-hint">Enter to send · Shift+Enter for a new line</span><div className="ai-compose-actions"><button type="button" className={recording ? "is-recording" : ""} onClick={recording ? stopRecording : () => void startRecording()} disabled={busy} aria-label={recording ? "Stop recording" : "Start microphone recording"}>{recording ? "Stop" : "🎙 Mic"}</button><button className="button button-primary" disabled={busy || recording || !input.trim()}>Send</button></div></form></div>
      </>}
    </section>
    {deleteConfirmOpen && <div className="ai-delete-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteConfirmOpen(false); }}><section className="ai-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ai-delete-title" aria-describedby="ai-delete-description"><span className="ai-delete-icon" aria-hidden="true">!</span><h3 id="ai-delete-title">Delete this conversation?</h3><p id="ai-delete-description">This conversation and its messages will be permanently deleted.</p><div className="ai-delete-actions"><button type="button" className="button button-secondary" autoFocus onClick={() => setDeleteConfirmOpen(false)}>Cancel</button><button type="button" className="button button-danger" onClick={() => void deleteConversation()}>Delete conversation</button></div></section></div>}
  </div>;
}
