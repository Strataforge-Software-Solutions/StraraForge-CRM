# Phase 1 setup and verification

This local foundation is connected to StrataForge's Supabase test project and has founder membership data. Google OAuth is not yet configured: the Google provider is disabled and has no client credentials. Keep `.env.local` private and untracked. A successful build does not prove live authentication or database policy behavior.

## Technology choice

- React, TypeScript, Vite, and React Router for a client-rendered single-page application.
- Supabase Auth for Google and email/password sign-in with an application-enforced TOTP second factor.
- Supabase Postgres for the workspace membership boundary and a read-only audit-event table. Later CRM tables must have their own grants and row-level security (RLS) policies. Future sensitive mutations must write their audit event in the same trusted transaction.

This is a local-only Phase 1 checkout. No site has been registered, published, or connected to a production account.

## Connect a private Supabase project

1. Use the existing Supabase project; do not create another one. Enable MFA on Supabase administrator accounts as well as in the CRM. Configure the email/password provider and confirmed email. Set a strong server-enforced password minimum (at least 12 characters), disable anonymous sign-ins and public self-sign-up after founder provisioning, and configure custom SMTP before relying on invitation or recovery email. Never put a secret or service-role key in a `VITE_` variable; those values are sent to browsers.
2. Set the Supabase Auth **Site URL** to the app origin `http://localhost:3000` (without a path). Add `http://localhost:3000/auth/*` and the matching `127.0.0.1` callback URLs to the redirect allowlist. Paste `supabase/email-templates/recovery.html` and `invite.html` into their matching Supabase Auth email templates after changing them. For Google Cloud, create a Web application OAuth client. Its authorized redirect URI must be the **Supabase provider callback URL** shown in Supabase Google provider settings, not the app's `/auth/callback`. Add the local CRM origin (`http://localhost:3000`) as an authorized JavaScript origin. Add the resulting Google Client ID and Secret only in Supabase's provider settings, enable Google there, and add invited founders as OAuth consent-screen test users. Before deployment, set the Site URL to the production app origin, add the production app callbacks to Supabase's allowlist, and add the production origin to Google. Custom hosted Auth email templates require custom SMTP on this project; without them, Supabase's default template redirects to the Site URL.
3. Apply `supabase/migrations/202610300001_foundation.sql` through the Supabase migration workflow. In a trusted administrative SQL session, create the StrataForge workspace and record the returned ID:

   ```sql
   insert into public.workspaces (name)
   values ('StrataForge')
   returning id;
   ```

4. Invite the two founders through the Supabase Dashboard or a trusted server administration path. Ask them to wait before opening their invitation links. Record each invited **auth user ID**, then add both as active administrators in the trusted SQL session, replacing the placeholders with the real IDs:

   ```sql
   insert into public.workspace_members (workspace_id, user_id, role)
   values
     ('WORKSPACE_UUID'::uuid, 'FOUNDER_1_USER_UUID'::uuid, 'admin'),
     ('WORKSPACE_UUID'::uuid, 'FOUNDER_2_USER_UUID'::uuid, 'admin');
   ```

   Do not expose an admin invitation API or secret key to the browser, and do not add membership from browser code. The founders can then open their links and set their passwords and authenticators. Disable public self-sign-up after the founder identities are provisioned. Google sign-in must resolve to the intended invited account; test automatic linking with the same verified email or use an authenticated linking flow. A separate Google identity must never gain membership just because its email text matches. The browser can read only its own active membership at AAL1; workspace and audit data require AAL2.
5. Copy `.env.example` to `.env.local` and enter only `VITE_SUPABASE_URL` and the Supabase publishable key as `VITE_SUPABASE_PUBLISHABLE_KEY`. The Vite client bundle exposes both values by design; database access must remain protected by workspace RLS policies and RPC validation. No service-role key or private auth secret belongs in the browser app. Then run `npm install` and `npm run dev`.

Provider setup references: [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp), and [Supabase account MFA](https://supabase.com/docs/guides/platform/multi-factor-authentication).

The application fails closed when configuration is missing. No CRM data is available merely because someone has a valid Supabase account: membership and AAL2 are required.

## Checks before treating sign-in as ready

- Both founders can sign in through email/password and Google, then complete TOTP verification before `/dashboard` or `/account` loads.
- Each founder can add a backup authenticator from Account Security while signed in at AAL2, then choose either verified factor on the next sign-in. Keep the backup on a separate device or in a separately secured location. Test both factors; do not assume password recovery replaces MFA.
- Before real use, agree on a lost-all-factors procedure: the other founder verifies identity through an established offline channel, a trusted Supabase administrator handles factor recovery, active sessions are reviewed, the founder reenrolls an authenticator, and the action is documented. Test this with a dummy account. Do not build an automatic email-only bypass.
- An invitation link opens password setup, then MFA enrollment, and expires as configured. A recovery request gives a neutral response for registered and unregistered email addresses; a valid recovery link changes only the account password, then still requires TOTP for CRM access.
- A signed-in account without an active workspace membership reaches Access pending and cannot read workspace data.
- An invited founder at AAL1 cannot read the workspace through the browser or the Supabase Data API; after TOTP, the same account can read only its permitted workspace.
- Anonymous access, revoked membership, expired session, and invalid TOTP all fail without exposing CRM records.
- Test account recovery and Google/password identity linking with dummy founder accounts before production use.
- Verify the migration's table grants and RLS policies in the connected project, including that browser clients cannot insert, update, or delete audit events. A successful Vite build alone does not prove live authentication or database policy behavior.
- Review sign-in, invitation, recovery, MFA, dashboard, and account at desktop, tablet, 320 CSS px, keyboard-only, and reduced-motion settings. The current environment could not reach its local browser preview.

## Current verification

`npm run build` and `npm run typecheck` pass; `npm audit --audit-level=high` reported zero vulnerabilities at the time checked. On a loopback production server with no Supabase configuration, `/dashboard` and `/sign-in` returned a streamed redirect to `/setup`, and no dashboard or email form was rendered. The Supabase project is unconfigured, so provider sign-in, email delivery, RLS enforcement, recovery, and account linking have not been exercised against live services. Do not enter real client information until those checks pass.

Phase 2 will add leads, clients, proposals, and projects behind the same membership and MFA boundary.
