import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Principal = { userId: string; workspaceId: string; db: SupabaseClient<any> };
export type ActionRow = {
  id: string; conversation_id: string; workspace_id: string; user_id: string;
  kind: string; payload: Record<string, unknown>; summary: string; voice_phrase: string | null;
  signature: string; status: string; expires_at: string; created_at: string;
};

export function config() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const groqKey = process.env.GROQ_API_KEY || "";
  const signingKey = process.env.AI_ACTION_SIGNING_KEY || "";
  if (!url || !key || !groqKey || signingKey.length < 32) {
    throw new Error("Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, GROQ_API_KEY, and a 32-character AI_ACTION_SIGNING_KEY");
  }
  return { url, key, groqKey, signingKey, model: process.env.GROQ_MODEL || "qwen/qwen3.8-27b" };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function authenticate(authorization: string | undefined): Promise<Principal> {
  if (!authorization?.startsWith("Bearer ")) throw new ApiError(401, "Sign in to use the assistant.");
  const token = authorization.slice(7);
  const { url, key } = config();
  const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: claimsResult, error: claimsError } = await verifier.auth.getClaims(token);
  const claims = claimsResult?.claims as Record<string, unknown> | undefined;
  if (claimsError || !claims?.sub) throw new ApiError(401, "Your session expired. Sign in again.");
  if (claims.aal !== "aal2") throw new ApiError(403, "Complete two-factor verification first.");
  const db = createClient<any>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const userId = String(claims.sub);
  const { data: membership, error } = await db.from("workspace_members")
    .select("workspace_id,role").eq("user_id", userId).eq("active", true).eq("role", "admin").limit(1).maybeSingle();
  if (error || !membership?.workspace_id) throw new ApiError(403, "Founder administrator access is required.");
  return { userId, workspaceId: membership.workspace_id, db };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function signAction(row: Omit<ActionRow, "id" | "signature" | "status" | "created_at">): string {
  const { signingKey } = config();
  const signed = { conversation_id: row.conversation_id, workspace_id: row.workspace_id,
    user_id: row.user_id, kind: row.kind, payload: row.payload, summary: row.summary,
    voice_phrase: row.voice_phrase, expires_at: new Date(row.expires_at).toISOString() };
  return createHmac("sha256", signingKey).update(canonical(signed)).digest("hex");
}

export function validSignature(row: ActionRow): boolean {
  const expected = signAction({
    conversation_id: row.conversation_id, workspace_id: row.workspace_id, user_id: row.user_id,
    kind: row.kind, payload: row.payload, summary: row.summary,
    voice_phrase: row.voice_phrase, expires_at: row.expires_at
  });
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(row.signature, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireString(value: unknown, label: string, max = 5000): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) throw new ApiError(400, `${label} is required (maximum ${max} characters).`);
  return text;
}

export function optionalString(value: unknown, max = 5000): string | null {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (text.length > max) throw new ApiError(400, `Text exceeds ${max} characters.`);
  return text || null;
}

export function requireUuid(value: unknown, label: string): string {
  const text = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new ApiError(400, `Choose a valid ${label}.`);
  }
  return text;
}

export function normalizePhrase(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}
