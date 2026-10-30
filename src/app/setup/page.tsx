import { AuthShell } from "@/components/auth-shell";

export default function SetupPage() {
  return (
    <AuthShell>
      <div className="auth-card info-card">
        <p className="eyebrow">Local setup</p>
        <h1>Connect the private workspace</h1>
        <p>The CRM is running, but it has not been connected to StrataForge’s Supabase project yet. No CRM data is available until you connect it.</p>
        <ol className="setup-steps">
          <li>Create a Supabase project owned by StrataForge and copy its project URL and publishable key.</li>
          <li>In the project folder, copy <code>.env.example</code> to <code>.env.local</code>.</li>
          <li>Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>. Generate <code>AUTH_FLOW_SECRET</code> with this command:<code className="setup-command">node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"</code></li>
          <li>Save the file and restart the development server.</li>
        </ol>
        <p className="setup-security-note"><strong>Keep secrets private.</strong> Never put a Supabase service-role key in a <code>NEXT_PUBLIC_</code> variable or commit <code>.env.local</code>.</p>
        <p className="settings-copy">After connecting, follow <code>PHASE1_SETUP.md</code> to apply the database migration, provision both founders, and configure Google sign-in, email, and MFA.</p>
      </div>
    </AuthShell>
  );
}
