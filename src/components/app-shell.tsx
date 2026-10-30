import Link from "next/link";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import type { Founder } from "@/lib/auth/require-founder";

function NavLinks({ current }: { current: "dashboard" | "account" }) {
  return (
    <>
      <p className="nav-section-label">Workspace</p>
      <Link className={`nav-link ${current === "dashboard" ? "is-active" : ""}`} href="/dashboard" aria-current={current === "dashboard" ? "page" : undefined}>
        <span className="nav-icon" aria-hidden="true">▦</span>
        Dashboard
      </Link>
      <p className="nav-section-label nav-section-gap">Account</p>
      <Link className={`nav-link ${current === "account" ? "is-active" : ""}`} href="/account" aria-current={current === "account" ? "page" : undefined}>
        <span className="nav-icon" aria-hidden="true">◉</span>
        Security
      </Link>
    </>
  );
}

export function AppShell({ founder, current, children }: { founder: Founder; current: "dashboard" | "account"; children: React.ReactNode }) {
  const initial = founder.email.slice(0, 1).toUpperCase();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="sidebar-nav" aria-label="Primary navigation"><NavLinks current={current} /></nav>
        <div className="sidebar-footer">
          <span className="sidebar-status-dot" aria-hidden="true" />
          Private founder workspace
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <details className="mobile-nav">
            <summary aria-label="Open navigation"><span aria-hidden="true">☰</span><span>Menu</span></summary>
            <nav className="mobile-nav-panel" aria-label="Mobile navigation">
              <Brand />
              <NavLinks current={current} />
              <SignOutButton subtle />
            </nav>
          </details>
          <p className="topbar-label">StrataForge workspace</p>
          <div className="topbar-actions">
            <span className="topbar-role">Co-founder</span>
            <Link className="avatar-link" href="/account" aria-label="Account security"><span className="avatar">{initial}</span></Link>
          </div>
        </header>
        <main id="main-content" className="page-content">{children}</main>
      </div>
    </div>
  );
}
