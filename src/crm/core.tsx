import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/config";

type Founder = { userId: string; email: string; name: string; avatarPath: string | null; avatarUrl: string | null; workspaceId: string; workspaceName: string; role: string; aal: string };
type AuthValue = { founder: Founder | null; ready: boolean; reload: () => Promise<void> };
const AuthContext = createContext<AuthValue>({ founder: null, ready: false, reload: async () => {} });
const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {});
export const db = () => createClient();
export const stages = ["new", "contacted", "discovery", "proposal_sent", "accepted_awaiting_deposit", "won", "lost"];
export const stageLabels: Record<string, string> = { new: "New Leads", contacted: "Contacted", discovery: "Discovery", proposal_sent: "Proposal sent", accepted_awaiting_deposit: "Awaiting deposit", won: "Won", lost: "Lost" };
export const projectStatus: Record<string, string> = { planned: "Planned", in_progress: "In progress", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled" };
export const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");
export const dateText = (value?: string | null) => value ? new Date(value).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Not set";
export const moneyText = (value: string | number | null | undefined, currency = "USD") => value == null ? "Not discussed" : `${currency} ${Number(value).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const isPhoneLikeContactName = (value?: string | null) => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 && !/[a-z]/i.test(trimmed) && trimmed.replace(/\D/g, "").length >= 7;
};
const leadStageActivityKey = (workspaceId: string) => `strataforge:lead-stage-activity:${workspaceId}`;
export function rememberLeadStageTransition(workspaceId: string, leadId: string, from: string, to: string) {
  try {
    const key = leadStageActivityKey(workspaceId);
    const saved = JSON.parse(localStorage.getItem(key) ?? "[]");
    const entries = Array.isArray(saved) ? saved : [];
    entries.unshift({ id: `local-${crypto.randomUUID()}`, subject_id: leadId, from, to, occurred_at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(entries.slice(0, 100)));
  } catch { /* The database update remains successful if local activity storage is unavailable. */ }
}
export function readLocalLeadStageTransitions(workspaceId: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(leadStageActivityKey(workspaceId)) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [founder, setFounder] = useState<Founder | null>(null);
  const [ready, setReady] = useState(false);
  const avatarRef = useRef<{ path: string; url: string } | null>(null);
  const reloadIdRef = useRef(0);
  const reload = useCallback(async () => {
    const requestId = ++reloadIdRef.current;
    if (!getSupabaseConfig()) {
      if (avatarRef.current) URL.revokeObjectURL(avatarRef.current.url);
      avatarRef.current = null;
      setFounder(null);
      setReady(true);
      return;
    }
    const supabase = db();
    const [{ data: userResult }, assurance] = await Promise.all([supabase.auth.getUser(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
    const user = userResult.user;
    if (requestId !== reloadIdRef.current) return;
    if (!user) {
      if (avatarRef.current) URL.revokeObjectURL(avatarRef.current.url);
      avatarRef.current = null;
      setFounder(null);
      setReady(true);
      return;
    }
    const { data: membership } = await supabase.from("workspace_members").select("workspace_id, role").eq("user_id", user.id).eq("active", true).limit(1).maybeSingle();
    let workspaceName = "StrataForge";
    if (membership?.workspace_id && assurance.data?.currentLevel === "aal2") {
      const { data: workspace } = await supabase.from("workspaces").select("name").eq("id", membership.workspace_id).maybeSingle();
      workspaceName = workspace?.name ?? workspaceName;
    }
    const storedPath = user.user_metadata?.avatar_path;
    const avatarPath = typeof storedPath === "string" && storedPath.startsWith(`${user.id}/`) ? storedPath : null;
    const canReadAvatar = assurance.data?.currentLevel === "aal2" && membership?.role === "admin";
    let avatarUrl = canReadAvatar && avatarPath && avatarRef.current?.path === avatarPath ? avatarRef.current.url : null;
    let createdUrl = false;
    if (avatarPath && !avatarUrl && canReadAvatar) {
      try {
        const { data } = await supabase.storage.from("profile-avatars").download(avatarPath);
        if (data) { avatarUrl = URL.createObjectURL(data); createdUrl = true; }
      } catch { /* Keep the initial avatar if the private image is unavailable. */ }
    }
    if (requestId !== reloadIdRef.current) {
      if (createdUrl && avatarUrl) URL.revokeObjectURL(avatarUrl);
      return;
    }
    const previousAvatar = avatarRef.current;
    avatarRef.current = avatarPath && avatarUrl ? { path: avatarPath, url: avatarUrl } : null;
    setFounder({ userId: user.id, email: user.email ?? "", name: user.user_metadata?.full_name ?? "", avatarPath, avatarUrl, workspaceId: membership?.workspace_id ?? "", workspaceName, role: membership?.role ?? "", aal: assurance.data?.currentLevel ?? "aal1" });
    setReady(true);
    if (previousAvatar && previousAvatar.url !== avatarUrl) URL.revokeObjectURL(previousAvatar.url);
  }, []);
  useEffect(() => {
    if (!getSupabaseConfig()) { setReady(true); return; }
    void reload();
    const { data } = db().auth.onAuthStateChange(() => { window.setTimeout(() => void reload(), 0); });
    return () => {
      data.subscription.unsubscribe();
      reloadIdRef.current += 1;
      if (avatarRef.current) URL.revokeObjectURL(avatarRef.current.url);
      avatarRef.current = null;
    };
  }, [reload]);
  return <AuthContext.Provider value={{ founder, ready, reload }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; error: boolean }>>([]);
  const notify = useCallback((message: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items, { id, message, error }].slice(-3));
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5000);
  }, []);
  return <ToastContext.Provider value={notify}>{children}<div className="toast-stack" aria-label="Notifications">{toasts.map((item) => <article key={item.id} className={cx("toast-card", item.error ? "toast-card-error" : "toast-card-success")} role={item.error ? "alert" : "status"}><span className="toast-icon">{item.error ? "!" : "✓"}</span><div className="toast-copy"><strong>{item.error ? "Something went wrong" : "Done"}</strong><p>{item.message}</p></div><button className="toast-dismiss" onClick={() => setToasts((items) => items.filter((x) => x.id !== item.id))} aria-label="Dismiss">×</button></article>)}</div></ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);

export function Gate() {
  const { founder, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="page-loading" role="status">Loading your workspace…</div>;
  if (!founder) return <Navigate to={getSupabaseConfig() ? "/sign-in" : "/setup"} replace state={{ from: location.pathname }} />;
  if (!founder.workspaceId) return <Navigate to="/access-pending" replace />;
  if (founder.aal !== "aal2" && location.pathname !== "/verify") return <Navigate to="/verify" replace />;
  if (founder.role === "developer" && !/^\/team\/tasks\/?$/.test(location.pathname)) return <Navigate to="/team/tasks" replace />;
  return <Outlet />;
}
