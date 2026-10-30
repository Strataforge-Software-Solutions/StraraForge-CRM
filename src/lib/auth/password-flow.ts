import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export type PasswordFlow = "invite" | "recovery";
export const PASSWORD_FLOW_COOKIE = "sf-password-flow";
const FLOW_LIFETIME_SECONDS = 15 * 60;

function flowSecret() {
  const secret = process.env.AUTH_FLOW_SECRET;
  if (!secret || secret.length < 32 || secret === "GENERATE_A_LONG_RANDOM_SECRET") {
    throw new Error("Password flow secret is not configured");
  }
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", flowSecret()).update(payload).digest("base64url");
}

export async function issuePasswordFlow(userId: string, flow: PasswordFlow) {
  const expires = Math.floor(Date.now() / 1000) + FLOW_LIFETIME_SECONDS;
  const payload = Buffer.from(JSON.stringify({ userId, flow, expires })).toString("base64url");
  (await cookies()).set(PASSWORD_FLOW_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: FLOW_LIFETIME_SECONDS
  });
}

export async function readPasswordFlow(userId: string): Promise<PasswordFlow | null> {
  const value = (await cookies()).get(PASSWORD_FLOW_COOKIE)?.value;
  if (!value) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const data = parsed as { userId?: unknown; flow?: unknown; expires?: unknown };
    if (data.userId !== userId || (data.flow !== "invite" && data.flow !== "recovery")) return null;
    if (typeof data.expires !== "number" || data.expires <= Math.floor(Date.now() / 1000)) return null;
    return data.flow;
  } catch {
    return null;
  }
}

export async function clearPasswordFlow() {
  (await cookies()).delete(PASSWORD_FLOW_COOKIE);
}
