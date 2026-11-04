import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { prepareAction, executeAction, matchesVoiceConfirmation } from "./actions.js";
import { runAssistant } from "./graph.js";
import { ApiError, authenticate, config, requireString, requireUuid, signAction, validSignature, type ActionRow, type Principal } from "./shared.js";

const rate = new Map<string, number[]>();

function limit(userId: string, operation: string, count: number) {
  const key = `${userId}:${operation}`;
  const now = Date.now();
  const recent = (rate.get(key) || []).filter((time) => time > now - 60 * 60 * 1000);
  if (recent.length >= count) {
    const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + 60 * 60 * 1000 - now) / 1000));
    throw new ApiError(429, "Forgey has reached the hourly usage limit. Your request is still here; try again after the wait.", { code: "AI_USAGE_LIMIT", retryAfterSeconds });
  }
  recent.push(now); rate.set(key, recent);
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(data));
}

async function bytes(req: IncomingMessage, max: number): Promise<Buffer> {
  const parts: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const part = Buffer.from(chunk);
    length += part.length;
    if (length > max) throw new ApiError(413, "Request is too large.");
    parts.push(part);
  }
  return Buffer.concat(parts);
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const content = await bytes(req, 40000);
  let parsed: unknown;
  try { parsed = JSON.parse(content.toString("utf8")); } catch { throw new ApiError(400, "Request must contain valid JSON."); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new ApiError(400, "Request must contain an object.");
  return parsed as Record<string, unknown>;
}

async function ownConversation(principal: Principal, id: string) {
  const { data, error } = await principal.db.from("ai_conversations").select("id,title,created_at,updated_at")
    .eq("workspace_id", principal.workspaceId).eq("user_id", principal.userId).eq("id", id).maybeSingle();
  if (error || !data) throw new ApiError(404, "Conversation not found. Apply the assistant migration if it is not installed.");
  return data;
}

async function actionRow(principal: Principal, id: string): Promise<ActionRow> {
  const { data, error } = await principal.db.from("ai_actions").select("*")
    .eq("workspace_id", principal.workspaceId).eq("user_id", principal.userId).eq("id", id).maybeSingle();
  if (error || !data) throw new ApiError(404, "Action proposal not found.");
  return data as ActionRow;
}

async function transcribe(principal: Principal, req: IncomingMessage) {
  limit(principal.userId, "voice", 120);
  const mime = String(req.headers["content-type"] || "").split(";")[0];
  const suffix = ({ "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/wav": "wav", "audio/mpeg": "mp3" } as Record<string, string>)[mime];
  if (!suffix) throw new ApiError(415, "This browser's audio format is unsupported. Type your request instead.");
  const recording = await bytes(req, 10 * 1024 * 1024);
  if (recording.length < 1000) throw new ApiError(400, "No speech was recorded. Try again or type your request.");
  const form = new FormData();
  form.append("model", "whisper-large-v3");
  form.append("response_format", "json");
  const encodedContext = req.headers["x-transcription-context"];
  let previousContext = "";
  if (typeof encodedContext === "string" && encodedContext.length <= 4000) {
    try { previousContext = decodeURIComponent(encodedContext).slice(-240); } catch { /* Ignore invalid continuation context. */ }
  }
  const prompt = [
    "StrataForge CRM: leads, clients, tasks, projects, proposals, payments, follow-ups.",
    "Transcribe the words as spoken in English, Filipino, or Taglish. Preserve the original language.",
    previousContext ? `Previous transcript for continuity: ${previousContext}` : ""
  ].filter(Boolean).join(" ");
  form.append("prompt", prompt);
  form.append("temperature", "0");
  form.append("file", new Blob([new Uint8Array(recording)], { type: mime }), `request.${suffix}`);
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${config().groqKey}` }, body: form, signal: AbortSignal.timeout(30000)
  }).catch(() => { throw new ApiError(503, "Transcription is unavailable. Try again or type your request."); });
  if (response.status === 429) {
    const retryAfterSeconds = Math.max(1, Math.min(3600, Number(response.headers.get("retry-after")) || 60));
    throw new ApiError(429, "Voice transcription is rate-limited. Your draft is still here; try again after the wait or continue typing.", { code: "TRANSCRIPTION_RATE_LIMITED", retryAfterSeconds });
  }
  if (!response.ok) throw new ApiError(503, "Speech could not be transcribed. Try again or type your request.");
  const result = await response.json() as { text?: string };
  return { transcript: String(result.text || "").trim().slice(0, 4000) };
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const path = new URL(req.url || "/", "http://localhost").pathname;
  if (req.method === "GET" && path === "/api/ai/health") {
    try { config(); json(res, 200, { ready: true }); } catch { json(res, 200, { ready: false }); }
    return;
  }
  if (!path.startsWith("/api/ai/")) throw new ApiError(404, "Not found.");
  const origin = req.headers.origin;
  const appOrigin = process.env.AI_APP_ORIGIN;
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { throw new ApiError(403, "Request origin is not allowed."); }
    if (appOrigin ? origin !== appOrigin : originHost !== req.headers.host) throw new ApiError(403, "Request origin is not allowed.");
  }
  const principal = await authenticate(req.headers.authorization);
  const segments = path.split("/").filter(Boolean);
  if (req.method === "POST" && path === "/api/ai/transcribe") { json(res, 200, await transcribe(principal, req)); return; }

  if (req.method === "GET" && path === "/api/ai/conversations") {
    const { data, error } = await principal.db.from("ai_conversations").select("id,title,created_at,updated_at")
      .eq("workspace_id", principal.workspaceId).eq("user_id", principal.userId).order("updated_at", { ascending: false }).limit(50);
    if (error) throw new ApiError(503, "Conversations could not be loaded. Check the assistant migration.");
    json(res, 200, { conversations: data || [] }); return;
  }
  if (req.method === "POST" && path === "/api/ai/conversations") {
    const { data, error } = await principal.db.from("ai_conversations")
      .insert({ workspace_id: principal.workspaceId, user_id: principal.userId }).select("id,title,created_at,updated_at").single();
    if (error || !data) throw new ApiError(503, "Conversation could not be created. Check the assistant migration.");
    json(res, 201, { conversation: data }); return;
  }
  if (segments[2] === "conversations" && segments[3]) {
    const conversationId = requireUuid(segments[3], "conversation");
    const conversation = await ownConversation(principal, conversationId);
    if (req.method === "GET" && segments.length === 4) {
      const [messages, actions] = await Promise.all([
        principal.db.from("ai_messages").select("id,role,content,created_at").eq("conversation_id", conversationId).eq("workspace_id", principal.workspaceId).order("created_at").limit(100),
        principal.db.from("ai_actions").select("id,kind,payload,summary,voice_phrase,status,expires_at,result,created_at").eq("conversation_id", conversationId).eq("workspace_id", principal.workspaceId).order("created_at").limit(100)
      ]);
      if (messages.error || actions.error) throw new ApiError(503, "Conversation could not be loaded.");
      json(res, 200, { conversation, messages: messages.data || [], actions: actions.data || [] }); return;
    }
    if (req.method === "DELETE" && segments.length === 4) {
      const { error } = await principal.db.from("ai_conversations").delete().eq("id", conversationId).eq("workspace_id", principal.workspaceId).eq("user_id", principal.userId);
      if (error) throw new ApiError(503, "Conversation could not be deleted.");
      json(res, 200, { deleted: true }); return;
    }
    if (req.method === "PATCH" && segments.length === 4) {
      const input = await body(req);
      const title = requireString(input.title, "conversation title", 100);
      const { data, error } = await principal.db.from("ai_conversations").update({ title, updated_at: new Date().toISOString() })
        .eq("id", conversationId).eq("workspace_id", principal.workspaceId).eq("user_id", principal.userId)
        .select("id,title,created_at,updated_at").maybeSingle();
      if (error || !data) throw new ApiError(404, "Conversation could not be renamed.");
      json(res, 200, { conversation: data }); return;
    }
    if (req.method === "POST" && segments[4] === "messages" && segments.length === 5) {
      limit(principal.userId, "chat", 40);
      const input = await body(req);
      const request = requireString(input.text, "message", 4000);
      const pagePath = typeof input.pagePath === "string" && /^\/(?:leads|clients|projects)\/[0-9a-f-]{36}$|^\/(?:dashboard|tasks-deals|team\/tasks|calendar|reports|access)$/i.test(input.pagePath) ? input.pagePath : "";
      const { data: history, error: historyError } = await principal.db.from("ai_messages").select("role,content")
        .eq("conversation_id", conversationId).eq("workspace_id", principal.workspaceId).order("created_at", { ascending: false }).limit(8);
      if (historyError) throw new ApiError(503, "Conversation history could not be loaded.");
      const completedHistory = (history || []).reverse();
      while (completedHistory.at(-1)?.role === "user") completedHistory.pop();
      const decision = await runAssistant(principal, pagePath ? `${request}\n(Current CRM page: ${pagePath})` : request, completedHistory);
      const { error: saveError } = await principal.db.from("ai_messages").insert({ conversation_id: conversationId, workspace_id: principal.workspaceId, user_id: principal.userId, role: "user", content: request });
      if (saveError) throw new ApiError(503, "Message could not be saved.");
      if (conversation.title === "New conversation") {
        await principal.db.from("ai_conversations").update({ title: request.slice(0, 100), updated_at: new Date().toISOString() }).eq("id", conversationId).eq("workspace_id", principal.workspaceId);
      }
      let action: any = null;
      let reply = decision.reply || "I could not form a response. Please try again.";
      if (decision.kind !== "none") {
        try {
          const prepared = await prepareAction(principal, decision.kind, decision.payload);
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          const toSign = { conversation_id: conversationId, workspace_id: principal.workspaceId, user_id: principal.userId,
            kind: prepared.kind, payload: prepared.payload, summary: prepared.summary,
            voice_phrase: prepared.voicePhrase, expires_at: expiresAt };
          const { data, error } = await principal.db.from("ai_actions").insert({ ...toSign, signature: signAction(toSign) })
            .select("id,kind,payload,summary,voice_phrase,status,expires_at,created_at").single();
          if (error || !data) throw new ApiError(503, "Action proposal could not be saved.");
          action = data;
        } catch (error) {
          reply = `I couldn't prepare that change: ${error instanceof Error ? error.message : "please give more detail"} Ask me again with the exact record and fields.`;
        }
      }
      const { data: saved, error: replyError } = await principal.db.from("ai_messages").insert({ conversation_id: conversationId,
        workspace_id: principal.workspaceId, user_id: principal.userId, role: "assistant", content: reply }).select("id,role,content,created_at").single();
      if (replyError) throw new ApiError(503, "The assistant reply could not be saved.");
      await principal.db.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("workspace_id", principal.workspaceId);
      json(res, 200, { message: saved, action }); return;
    }
  }
  if (segments[2] === "actions" && segments[3] && req.method === "POST") {
    const id = requireUuid(segments[3], "action");
    const action = await actionRow(principal, id);
    if (!validSignature(action)) throw new ApiError(409, "This action proposal is invalid. Ask the assistant to prepare it again.");
    if (action.status !== "pending" || new Date(action.expires_at).getTime() <= Date.now()) throw new ApiError(409, "This action expired or was already handled. Ask the assistant to prepare it again.");
    if (segments[4] === "reject") {
      const { data: rejected, error } = await principal.db.from("ai_actions").update({ status: "rejected" }).eq("id", id).eq("status", "pending").eq("workspace_id", principal.workspaceId).select("id").maybeSingle();
      if (error || !rejected) throw new ApiError(409, "This action was already handled.");
      json(res, 200, { status: "rejected" }); return;
    }
    if (segments[4] === "confirm") {
      const input = await body(req);
      const mode = input.mode === "voice" ? "voice" : "tap";
      if (mode === "voice" && (!action.voice_phrase || !matchesVoiceConfirmation(action, String(input.transcript || "")))) {
        throw new ApiError(400, "Say the exact confirmation phrase shown on the action card.");
      }
      if (mode === "tap" && input.acknowledged !== true) throw new ApiError(400, "Review and confirm this action first.");
      if (["record_deposit", "record_progress_payment", "accept_proposal", "mark_proposal_sent", "convert_lead"].includes(action.kind) && input.attestation !== true) {
        throw new ApiError(400, "Confirm the recorded evidence or payment details first.");
      }
      const { data: claimed, error: claimError } = await principal.db.from("ai_actions").update({ status: "executing" })
        .eq("id", id).eq("status", "pending").gt("expires_at", new Date().toISOString()).eq("workspace_id", principal.workspaceId).eq("user_id", principal.userId).select("id").maybeSingle();
      if (claimError || !claimed) throw new ApiError(409, "This action was already handled.");
      try {
        const result = await executeAction(principal, action);
        await principal.db.from("ai_actions").update({ status: "succeeded", result, executed_at: new Date().toISOString() }).eq("id", id);
        const { data: message } = await principal.db.from("ai_messages").insert({ conversation_id: action.conversation_id,
          workspace_id: principal.workspaceId, user_id: principal.userId, role: "assistant", content: result.message })
          .select("id,role,content,created_at").single();
        await principal.db.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", action.conversation_id);
        json(res, 200, { status: "succeeded", result, message }); return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Action failed";
        await principal.db.from("ai_actions").update({ status: "failed", result: { message }, executed_at: new Date().toISOString() }).eq("id", id);
        throw error;
      }
    }
  }
  throw new ApiError(404, "Not found.");
}

export function apiHandler(req: IncomingMessage, res: ServerResponse): void {
  const requestId = randomUUID();
  res.setHeader("X-Request-ID", requestId);
  void handle(req, res).catch((error) => {
    const failure = error instanceof ApiError ? error : new ApiError(500, "Forgey hit an unexpected error. Your request is still here; retry in a moment.", { code: "INTERNAL_ERROR", retryable: true });
    if (failure.status >= 429) console.warn("Assistant API error:", failure.status, failure.code, requestId);
    json(res, failure.status, { error: failure.message, code: failure.code, retryable: failure.retryable, retryAfterSeconds: failure.retryAfterSeconds, requestId });
  });
}

if (!process.env.VERCEL) {
  const server = createServer(apiHandler);
  const port = Number(process.env.AI_PORT || 3001);
  const host = process.env.AI_HOST || "127.0.0.1";
  server.listen(port, host, () => console.log(`StrataForge AI API listening on ${host}:${port}`));
}
