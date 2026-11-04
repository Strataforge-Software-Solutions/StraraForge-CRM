import { spawn } from "node:child_process";

const api = spawn(process.execPath, ["--watch", "--env-file=.env.local", "--import", "tsx", "server/index.ts"], {
  stdio: "inherit",
});
const web = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0", "--port", "3000", "--strictPort"], {
  stdio: "inherit",
});

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  api.kill();
  web.kill();
  process.exitCode = code;
};

api.on("error", (error) => { console.error("Forgey API failed to start:", error.message); stop(1); });
web.on("error", (error) => { console.error("Vite failed to start:", error.message); });
api.on("exit", async (code) => {
  if (stopping || code === 0) return;
  try {
    const response = await fetch("http://127.0.0.1:3001/api/ai/health", { signal: AbortSignal.timeout(3000) });
    const health = await response.json();
    if (response.ok && health.ready === true) {
      console.log("Using the healthy Forgey API already running on port 3001.");
      return;
    }
  } catch { /* The existing listener is not a healthy Forgey API. */ }
  stop(code);
});
web.on("exit", (code) => {
  if (!stopping && code !== 0) console.error("Vite is already running or failed to start; Forgey API remains available on port 3001.");
  else if (!stopping) stop(0);
});
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
