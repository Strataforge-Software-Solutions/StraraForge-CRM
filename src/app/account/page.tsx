import { AppShell } from "@/components/app-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { MfaSettings } from "@/components/mfa-settings";
import { requireFounder } from "@/lib/auth/require-founder";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const founder = await requireFounder();

  return (
    <AppShell founder={founder} current="account">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Security</h1>
          <p>Review the access protecting your StrataForge workspace.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-card">
          <h2>Signed-in account</h2>
          <dl className="detail-list">
            <div><dt>Email</dt><dd>{founder.email}</dd></div>
            <div><dt>Workspace role</dt><dd>{founder.role === "admin" ? "Administrator" : "Member"}</dd></div>
            <div><dt>Second factor</dt><dd><span className="status-pill">Verified for this session</span></dd></div>
          </dl>
        </section>
        <section className="settings-card">
          <h2>Session</h2>
          <p className="settings-copy">Sign out when you finish working on a shared device. This ends the session on this device.</p>
          <SignOutButton />
        </section>
      </div>
      <div className="settings-followup"><MfaSettings /></div>
    </AppShell>
  );
}
