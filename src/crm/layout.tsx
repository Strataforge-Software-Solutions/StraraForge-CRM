import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cx, db, useAuth } from "./core";
import { CrmIcon } from "./icons";
import { Assistant } from "./assistant";

const navigation = [["dashboard", "Dashboard", "/dashboard"], ["tasks", "Tasks / Deals", "/tasks-deals"], ["inbox", "Project tasks", "/team/tasks"], ["users", "Leads", "/leads"], ["clients", "Clients", "/clients"], ["projects", "Projects", "/projects"], ["calendar", "Calendar", "/calendar"], ["reports", "Reports", "/reports"]] as const;
export function Shell() {
  const { founder } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [leadCount, setLeadCount] = useState<number | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem("strataforge.sidebar-collapsed") === "true"; } catch { return false; }
  });
  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      try { window.localStorage.setItem("strataforge.sidebar-collapsed", String(next)); } catch { /* storage is optional */ }
      return next;
    });
  }
  useEffect(() => {
    if (!founder || founder.role === "developer") return;
    let active = true;
    void db().from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", founder.workspaceId).is("archived_at", null).then(({ count }) => {
      if (active) setLeadCount(count ?? 0);
    });
    return () => { active = false; };
  }, [founder?.workspaceId, founder?.role, location.pathname]);
  if (!founder) return <Outlet />;
  const activePath = location.pathname.startsWith("/leads") ? "/leads" : location.pathname.startsWith("/tasks") ? (location.pathname.startsWith("/tasks-deals") ? "/tasks-deals" : "/tasks-deals") : location.pathname.startsWith("/projects") ? "/projects" : location.pathname.startsWith("/clients") ? "/clients" : location.pathname;
  const visibleNavigation = founder.role === "developer" ? [["tasks", "Project tasks", "/team/tasks"]] as const : navigation;
  async function signOut() { await db().auth.signOut(); navigate("/sign-in", { replace: true }); }
  return <div className={cx("app-shell", founder.role === "developer" && "app-shell-developer", sidebarCollapsed && "is-sidebar-collapsed")}><aside className="sidebar"><div className="sidebar-brand-row"><Link className="brand-link brand-link-full" to={founder.role === "developer" ? "/team/tasks" : "/dashboard"}><span className="brand-lockup brand-lockup-full"><img className="brand-full-logo" src="/strataforge-mark.png" alt=""/><span className="brand-type"><span>STRATA<span className="brand-accent">FORGE</span></span><small>CRM</small></span></span></Link><button type="button" className="sidebar-collapse-toggle" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed}><span aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span></button></div><nav className="sidebar-nav" aria-label="Primary navigation"><p className="nav-section-label">{founder.role === "developer" ? "Delivery" : "Workspace"}</p>{visibleNavigation.map(([icon, label, href]) => <Link key={href} className={cx("nav-link", activePath === href && "is-active")} to={href} title={sidebarCollapsed ? label : undefined} aria-label={label}><span className="nav-icon-text"><CrmIcon name={icon}/></span><span className="nav-link-label">{label}</span>{href === "/leads" && leadCount !== null && <span className="nav-link-count" aria-label={`${leadCount} active leads`}>{leadCount > 99 ? "99+" : leadCount}</span>}</Link>)}{founder.role === "admin" && <><p className="nav-section-label nav-section-gap">Admin</p><Link className={cx("nav-link", activePath === "/access" && "is-active")} to="/access" title={sidebarCollapsed ? "Access" : undefined} aria-label="Access"><span className="nav-icon-text"><CrmIcon name="users"/></span><span className="nav-link-label">Access</span></Link><Link className={cx("nav-link", activePath === "/audit-history" && "is-active")} to="/audit-history" title={sidebarCollapsed ? "Audit history" : undefined} aria-label="Audit history"><span className="nav-icon-text"><CrmIcon name="activity"/></span><span className="nav-link-label">Audit history</span></Link></>}<p className="nav-section-label nav-section-gap">Account</p><Link className={cx("nav-link", activePath === "/settings" && "is-active")} to="/settings" title={sidebarCollapsed ? "Settings" : undefined} aria-label="Settings"><span className="nav-icon-text"><CrmIcon name="settings"/></span><span className="nav-link-label">Settings</span></Link><Link className={cx("nav-link", activePath === "/account" && "is-active")} to="/account" title={sidebarCollapsed ? "Security" : undefined} aria-label="Security"><span className="nav-icon-text"><CrmIcon name="security"/></span><span className="nav-link-label">Security</span></Link></nav><div className="sidebar-footer"><span className="sidebar-status-dot"/><span className="sidebar-footer-label">{founder.role === "developer" ? "Project team workspace" : "StrataForge CRM V1"}</span></div></aside><div className="app-main"><header className="topbar"><form className="workspace-search" onSubmit={(event) => { event.preventDefault(); navigate(`/leads?q=${encodeURIComponent(search)}`); }}><input aria-label="Search leads" placeholder="Search leads…" value={search} onChange={(event) => setSearch(event.target.value)}/><button className="button button-secondary" type="submit">Search</button></form><div className="topbar-actions">{founder.role === "admin" && <button type="button" className="ai-floating-button" onClick={() => setAssistantOpen(true)} aria-label="Open CRM assistant"><span aria-hidden="true">✦</span><span className="ai-topbar-label">Assistant</span></button>}<Link className="topbar-notifications" to="/calendar" aria-label="Calendar and reminders"><CrmIcon name="bell"/></Link><details className="profile-menu"><summary aria-label={`Open account menu for ${founder.email}`}><span className="avatar">{founder.avatarUrl ? <img src={founder.avatarUrl} alt=""/> : (founder.name?.trim()[0] ?? founder.email[0] ?? "A").toUpperCase()}</span><span className="profile-menu-name">{founder.email}</span><svg className="profile-menu-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 7.5 4.5 4.5 4.5-4.5"/></svg></summary><div className="profile-menu-panel"><p>{founder.email}</p><Link to="/settings">Profile settings</Link><Link to="/account">Security</Link><button className="button button-secondary" onClick={signOut}>Sign out</button></div></details></div></header><main id="main-content" className={cx("page-content", activePath === "/dashboard" && "dashboard-page-content", activePath === "/reports" && "reports-page-content", activePath === "/settings" && "profile-settings-page", activePath === "/leads" && "leads-page-content")}><Outlet/></main></div><Assistant open={assistantOpen} onClose={() => setAssistantOpen(false)}/></div>;
}
