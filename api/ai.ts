import type { IncomingMessage, ServerResponse } from "node:http";
import { apiHandler } from "../server/index.js";

// Vercel rewrites all /api/ai/* requests to this function. Keep the raw stream
// available because voice transcription sends audio rather than parsed JSON.
export const config = { api: { bodyParser: false }, maxDuration: 60 };

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const incoming = new URL(req.url || "/api/ai", "https://strataforge.invalid");
  const routePath = incoming.searchParams.get("__ai_path");
  if (routePath !== null) {
    const query = new URLSearchParams(incoming.searchParams);
    query.delete("__ai_path");
    req.url = `/api/ai/${routePath}${query.size ? `?${query.toString()}` : ""}`;
  }
  apiHandler(req, res);
}
