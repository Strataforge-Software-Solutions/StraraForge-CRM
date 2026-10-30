import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireFounder } from "@/lib/auth/require-founder";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const founder = await requireFounder();

  return (
    <AppShell founder={founder} current="dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Your workspace</h1>
          <p>The place for client conversations, project work, and payment milestones.</p>
        </div>
        <span className="workspace-badge"><span aria-hidden="true" /> Private workspace</span>
      </div>

      <section className="welcome-panel" aria-labelledby="welcome-heading">
        <div>
          <p className="eyebrow eyebrow-light">StrataForge CRM</p>
          <h2 id="welcome-heading">A clearer view of every website project.</h2>
          <p>Your workspace is ready. As you add inquiries and projects, this page will surface the work that needs attention.</p>
        </div>
        <div className="welcome-art" aria-hidden="true"><span>SF</span></div>
      </section>

      <div className="section-heading">
        <div>
          <h2>What belongs here</h2>
          <p>Information will appear as the team starts using the CRM.</p>
        </div>
      </div>
      <div className="foundation-grid">
        <section className="foundation-card">
          <span className="card-index">01</span>
          <h3>Lead conversations</h3>
          <p>Inquiries, discovery notes, proposals, and the next follow-up.</p>
          <span className="empty-label">No records yet</span>
        </section>
        <section className="foundation-card">
          <span className="card-index">02</span>
          <h3>Website delivery</h3>
          <p>Confirmed projects, milestones, assigned work, and target dates.</p>
          <span className="empty-label">No records yet</span>
        </section>
        <section className="foundation-card">
          <span className="card-index">03</span>
          <h3>Progress payments</h3>
          <p>Deposit and installment records tied to the agreed project price.</p>
          <span className="empty-label">No records yet</span>
        </section>
      </div>

      <section className="security-callout">
        <div className="callout-mark" aria-hidden="true">✓</div>
        <div>
          <h2>Founder access is active</h2>
          <p>This session passed the second verification step and is linked to the StrataForge workspace.</p>
        </div>
        <Link className="button button-outline" href="/account">View account security</Link>
      </section>
    </AppShell>
  );
}
