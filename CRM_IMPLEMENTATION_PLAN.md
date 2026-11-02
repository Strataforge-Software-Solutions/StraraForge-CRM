# StrataForge CRM: product goal and implementation plan

**Status:** Phase 1 and Phase 2 database migrations are applied and verified in Supabase. The public schema contains `workspaces`, `workspace_members`, `audit_events`, and the seven Phase 2 CRM tables. The `StrataForge` workspace has an active admin membership for a founder test account; the user reports that sign-in now reaches the dashboard. An earlier test account no longer has CRM membership. The local app now covers the lead-to-project workflow and actual payment ledger, but scheduled payment plans, additional record management, and live end-to-end checks remain before real client data use.
**Audience at launch:** StrataForge co-founders.  
**Design status:** the ten supplied images are provisional references, not an approved design system.

For individual screen fields, actions, dialogs, toasts, and mobile/tablet behavior, see [CRM_PAGE_BLUEPRINT.md](CRM_PAGE_BLUEPRINT.md).

**Founder decisions confirmed October 30, 2026:** both co-founders have administrator access; the CRM starts with no imported leads or clients; launch sign-in offers Google and email/password, and both paths require two-factor authentication (2FA).

**Business context confirmed October 30, 2026:** StrataForge is a software development team that builds websites for clients and companies. The CRM's first workflow should make website inquiries, client details, follow-ups, and delivery work easier to understand.

**Commercial workflow confirmed October 30, 2026:** StrataForge sends proposals and uses progress payments. A website job becomes a confirmed project only after the client accepts the proposal **and** the deposit is recorded. The first release tracks payment milestones and amounts paid; direct client payment through the CRM is a later phase.

**Recording rules confirmed October 30, 2026:** proposal acceptance can be supported by a signed proposal/contract or an approval email/message, with an acceptance note. Progress-payment milestones can be fixed amounts or percentages of the agreed project price.

These choices simplify the first data release because there is no import or migration to reconcile. They also make authentication a larger foundation task: the two sign-in methods must reach the same invited founder account safely, enforce the same 2FA gate, and have a recovery path. The email/password route provides an alternative when Google sign-in is unavailable, but it must meet the same security standard.

## Goal

Give the co-founders one secure place to follow a website inquiry from first contact through proposal, client agreement, website delivery, and follow-up. The first release should reduce lost leads and unclear ownership while keeping private contact, commercial, and project information available only to authorized founders.

The product should feel like a working tool, not a decorative dashboard. A screen is complete when its data, states, permissions, keyboard use, and small-screen behavior work together.

## What the references show and what needs clarification

| Images | Reference | Direction for implementation |
| --- | --- | --- |
| 1 | Dashboard | Keep the overview and next actions; compute every number and chart from real records. |
| 2 | Tasks / Deals board | Turn the mixed board into a website inquiry pipeline and a separate task view. A task completion must not silently change a lead stage. |
| 3 | Leads | Preserve the searchable list and detail view; define stage names once and use them everywhere. |
| 4 | Clients | Show contacts, linked projects, and activity; avoid duplicating lead records when converting. |
| 5 | Projects | Follow real delivery status, dates, accepted scope, linked tasks, and payments. Only show payment collection as a financial calculation; never imply it is delivery completion. |
| 6 | Calendar | Surface existing follow-ups, task deadlines, and project targets in Month, Week, Day, and List views. Standalone meeting/event creation needs a future event schema and workflow. |
| 7 | Reports | Show only metrics with defined formulas and date ranges; exclude guessed revenue. |
| 8 | Settings | Start with founder accounts, company details, preferences, security, and activity. Third-party integrations and StrataForge's own subscription billing appear only when real services exist; client payment tracking belongs with projects. |
| 9 | Sign in | Use a simple, trustworthy form. Social sign-in appears only if configured. |
| 10 | Toast examples | Adopt one restrained toast system rather than twelve competing styles. |

The examples contain conflicting counts, dates, statuses, and revenue. They are layout examples, not test data or business facts. The mascot can be used sparingly as brand art; an AI assistant should only appear after it has a defined, useful, safe capability.

## Product rules to agree before implementation

1. **Core objects:** Lead (a possible website job, including an inquiry from an existing client), Client (an organization or person with an active relationship), Contact (a person at a client), Proposal (scope and commercial terms offered to a lead), Project (website work being delivered), Payment Milestone (an agreed installment and its recorded payment), Task (an assigned sales or delivery action), Event (meeting or deadline), Activity (a dated record), and File (an attachment). A separate Deal object is deferred until StrataForge needs multiple commercial opportunities under one inquiry.
2. **Sales workflow:** New inquiry → Contacted → Discovery → Proposal sent → Accepted, awaiting deposit → Won; a lead can also be marked Lost with a reason. **Won** requires both an accepted proposal and a recorded deposit. The conversion action then links or creates a client and creates a website project, preserving the inquiry and proposal history. Project delivery has separate states: Planned → In progress → On hold → Completed or Cancelled. A task's status never changes a lead or project stage automatically.
3. **Ownership:** A founder owns each lead, opportunity, project, and task. The other founder can see shared company records in the first release; the system still records who created and changed them.
4. **Metrics:** Counts derive from current records and date filters. Show contracted value, scheduled installments, invoiced value, and payments received as separate concepts when the supporting records exist; do not label an inquiry budget as revenue. No sample percentage is presented as a live fact.
5. **Source of truth:** One record per real client, linked to its leads and projects. Conversion retains history and avoids creating a duplicate client automatically.
6. **Launch scope assumption:** Internal use by co-founders. External client portals, multi-company tenancy, and online payment processing are later phases. The first release records proposals and progress payments entered by the founders; it does not collect card or bank credentials. The CRM starts empty, with useful first-record guidance instead of invented sample metrics.

### Website-work data to capture

| Record | First-release fields | Why it helps the founders |
| --- | --- | --- |
| Lead | Company or client name, contact name, email and optional phone, short website brief, source, owner, stage, next follow-up date, optional budget range and desired launch window. | Shows what the client asked for, who should reply, and when. Budget and timeline remain optional until discussed. |
| Proposal | Related lead, version, scope summary, quoted amount and currency, sent date, status, acceptance date, acceptance note, and a private signed document or approval-message reference. | Keeps the agreed offer distinct from an early estimate and preserves revisions. |
| Client and contact | Client name, primary contact, verified contact details, notes, linked leads and projects. | Keeps the relationship in one place without duplicating a client after each project. |
| Website project | Client, project name, accepted proposal, agreed scope summary, delivery owner, start and target dates, status, milestones, linked tasks, and agreed amount. | Makes delivery commitments and next steps visible. |
| Payment milestone | Related proposal or project, installment label, fixed amount or percentage, calculated amount and currency, due date, status, amount received, received date, payment reference, and recorder. | Shows deposit, progress payments, outstanding balance, and who recorded each change. |
| Task or event | Title, related lead/client/project, assignee, due time and timezone, status, and a short outcome note. | Turns follow-ups and delivery work into accountable actions. |

Store proposal documents or contracts as private attachments only when the founders use them. Do not infer an agreed price from an inquiry budget range. A milestone schedule shows the sum of its installments against the accepted price; percentage-based amounts need explicit rounding rules, and the final installment reconciles any remainder. Recording a deposit requires an amount, date, and reference, and creates an audit entry. Corrections preserve the earlier record; a refund or reversed payment is visible and does not silently rewrite the sales history. A project can be created for an existing client without creating a duplicate client record.

### Proposed launch access model

| Person | Read and change CRM records | Invite or remove users | Change security and company settings | Export data |
| --- | --- | --- | --- | --- |
| Invited co-founder | Yes, within the StrataForge workspace; every change is attributed to an account. | Yes; both founders are administrators. | Yes, with reauthentication for sensitive actions. | Yes, with an audit entry and the export limited to data the account can read. |
| Uninvited visitor | No CRM access. | No. | No. | No. |
| Future staff role | To be designed from actual duties before staff accounts are enabled. | No by default. | No by default. | No by default. |

The server must enforce this model for list queries, individual records, search, files, notifications, reports, and exports. Hiding a button does not grant or remove permission. Invitations expire and can be revoked; removing a founder should revoke active sessions and preserve the audit history of their past work.

## Pages and behavior

| Page | What it should do | Key interaction and state |
| --- | --- | --- |
| **Sign in and account recovery** | Let invited founders sign in and recover access. | Google sign-in and email/password, with 2FA required for both; password manager support; clear invalid-credential, expired-link, locked/rate-limited, and success states. No public self-registration. |
| **Dashboard** | Answer: what needs attention today? | Real lead/task/project counts, lead trend and source charts for a selected range, recent leads, next tasks, active project target dates/status, and audit activity. Empty states explain the first action; sample metrics are never shown. |
| **Tasks / Deals, Pipeline, and Tasks** | Track website opportunities and assigned work without conflating them. | New `/tasks-deals` page has a real-record opportunity board and separate task view; each links to the existing lead/task workflow. The dedicated Pipeline and Tasks pages remain available. No task status change can move a lead stage. |
| **Leads and Proposals** | Capture, discuss, propose, and convert website inquiries. | KPI counts, URL-backed stage filters, searchable/sortable paginated list, selected-lead detail/activity panel, plus a separate full lead workflow for proposals, payments, and conversion. Conversion requires accepted proposal and deposit. |
| **Clients** | Review client relationships after conversion. | URL-filtered, searchable and sortable directory with real client/project summaries, primary contact, grouped-currency agreed value, and selected-client panel for overview, projects, notes, and audited CRM changes. This directory is read-only; direct client creation/editing, files, and messaging are not implemented. |
| **Projects and Payments** | Follow website delivery and progress payments from deposit to launch. | Workspace-scoped project directory with status counts/filters, search/sort, pagination, and a selected-record panel for accepted scope, linked tasks, payment entries, and CRM changes. Full project detail keeps delivery status separate from paid-to-date and balance. Project creation remains guarded lead conversion; team roster and files are not implemented. |
| **Calendar** | Review lead follow-ups, open task deadlines, and active project target dates; open their source records. | Month, week, day, and list views with URL-backed date/type filters. Existing dates only; standalone meetings/event creation and external calendar sync need a future event schema and workflow. |
| **Reports** | Help founders understand inquiry, delivery, and payment trends. | Implemented date-filtered snapshots for lead stages and sources, sent proposal versions, projects by status, overdue tasks, and recent project changes. Contracted project value and received cash are separate and grouped by currency. Aggregate-only CSV export uses the same founder/workspace access and RLS checks. Historical stage conversion and scheduled payments are not presented as known facts. |
| **Settings** | Manage each founder’s profile and review company/access context. | Implemented editable display name stored in that founder’s Auth metadata, with read-only sign-in email, workspace name, and membership role. Shows the current Asia/Manila display setting and links to the existing MFA/security screen. Company preference editing, notification controls, sessions, team, integrations, and billing remain unavailable because no working data model or flow exists for them. |
| **Global search, notifications, and account menu** | Let founders move quickly without losing context. | Permission-filtered results grouped by object, useful no-results state, notifications linked to records, profile, and sign-out. Search queries must never expose records a user cannot open. |

Each page needs loading, empty, error, stale-data, and permission-denied states. Forms preserve user input after a recoverable error. Destructive actions state the affected record and consequence before submission.

### Page-by-page dialogs and feedback

| Page | Dialogs or focused forms | Toast or persistent feedback |
| --- | --- | --- |
| Sign in | Password recovery and reset use dedicated, linkable screens; account invitations open an acceptance screen. First sign-in completes 2FA enrollment before CRM access. | Show errors beside the form. A generic sign-in error avoids revealing whether an email exists; a successful recovery request shows a neutral confirmation. |
| Dashboard | No dashboard-only modal; add actions open the underlying full record form. | Save feedback stays with the lead/task workflow; each dashboard panel shows its own empty or load-error state. |
| Tasks / Deals, Pipeline and Tasks | Overview has no modal; Add Lead and Add Task open the existing forms. Stage changes and task completion stay in their record workflows. | Overview errors remain visible; only the existing save workflows show success toasts after persistence. |
| Leads and Proposals | Add/edit lead; create or revise proposal; record acceptance; merge or resolve a possible duplicate; conversion flow; archive confirmation. | Confirm creation, proposal send, and conversion with a link to the record. If acceptance or deposit is missing, explain it in the conversion flow. Validation stays at the field; failed conversion keeps the entered data. |
| Clients | No modal; selected-client detail is an inline side panel. Client creation continues through guarded lead conversion. | Search/filter and related-record errors stay visible; no save toast appears because the directory is read-only. |
| Projects and Payments | Directory has no modal. Project status, task creation, payment schedules, payment recording, and completion confirmation stay on their existing full record forms. | Directory has visible load errors and no save toast. Existing mutations confirm after persistence and keep payment records in the ledger. |
| Calendar | No event modal; Add Task opens the existing task form. Follow-ups and project targets change on their source records. | Load errors stay visible; task saves confirm on the existing task workflow. Standalone event creation is not implemented. |
| Reports | Inline date range and quick presets; no modal because the CSV contains aggregate metrics only. | Export button announces progress, completion, and errors accessibly. Empty panels explain the missing records; report query failures are visible and disable export. Payments are labeled as cash received and separated from contracted value. |
| Settings | Edit the low-risk profile name inline; MFA enrollment/removal continues on Security. No dialog for profile changes. | Save success uses a toast after Auth confirms. Validation and save failures remain by the field. Existing MFA removal still has its own confirmation dialog. |
| Global search and notifications | Search is a command panel; notification actions open the linked record. | No toast for merely opening a result. Failed search or notification updates show a retryable state. |

## Toasts, modals, and feedback

- **Toasts:** one consistent placement, typography, icon treatment, and four meanings: success, error, warning, information. Use plain messages that name the completed or failed action. Success is short; actionable errors stay visible longer or require dismissal. Do not put sensitive client details in a toast that might be visible on a shared screen.
- **No false success:** show success only after the server confirms persistence. For network errors, explain that the change was not confirmed and offer retry where safe. Avoid duplicate submissions with a pending state.
- **Undo:** offer it only when reversal is real and reliable. Archive or delete may require confirmation instead; a disappearing toast must not be the sole way to recover a record.
- **Modals:** use focused dialogs for create/edit lead, client, task, event, invite founder, change password, and confirmation of destructive actions. Use a larger form page or full-screen mobile flow for complex project creation and lead conversion. Filters and sorting should be popovers or inline controls rather than modal dialogs.
- **Modal behavior:** title, brief context, explicit primary/cancel labels, validation beside fields, focus moved into the dialog and restored on close, Escape where safe, and an unsaved-changes prompt. A delete dialog names the record; it cannot be closed into an ambiguous partially completed state.
- **Notifications:** persistent, record-linked items for events that matter later (assignment, deadline, invite, security event). Toasts are momentary feedback, not the notification archive.

## Responsive and accessible behavior

| Width and device | Planned behavior |
| --- | --- |
| **Wide desktop** | Fixed or collapsible side navigation; dense but readable tables; detail panel can sit beside the list; charts and summary cards share space. |
| **Tablet / narrow laptop** | Compact navigation; fewer summary columns; detail panel becomes a drawer or separate route; table columns can be chosen by priority. |
| **Mobile** | Top bar and navigation drawer; one primary action per screen; lists become readable record cards or a deliberately scrollable table region; detail views use a full screen; forms use one column. |
| **Very small screens and zoom** | Essential content and actions work at 320 CSS px equivalent without whole-page horizontal scrolling. Long names wrap or truncate with a way to read the full value. |

The pipeline board may scroll within its own region, but it also needs a list view and non-drag controls. Calendar defaults to agenda on a phone. Charts stack and provide text summaries. Toasts fit inside the viewport and do not cover the primary action. Dialogs become full-screen sheets on small devices. Support keyboard navigation, visible focus, sufficient contrast, reduced motion, and comfortably sized touch controls. Use WCAG 2.2 AA as the accessibility target.

## Proposed system shape

Use a responsive web frontend backed by a server API, a relational database for linked CRM records, and private file storage for attachments. The server owns validation, permissions, status transitions, search filtering, and report queries. Background work can send reminders and process exports without blocking a page. Select an identity service that supports invited accounts, Google and email/password sign-in, and an enforceable 2FA policy across both methods. Select exact technologies after Phase 0 rather than locking the company into a stack based on the mockups.

Keep development, staging, and production data separate. Migrations must preserve relationships and be reversible where practical; backups need a documented restore test. For the co-founder launch, a single company workspace is sufficient, while the schema should avoid assumptions that would make later staff permissions difficult. Multi-company access should only be designed when it becomes a real requirement.

## UI direction to avoid generic-looking output

- Keep a restrained StrataForge palette: dark neutral navigation, orange as the primary accent, and semantic colors reserved for status or alerts. Do not make every card a different bright gradient.
- Create a small token system for type, spacing, radii, surfaces, focus, and status. Keep typography and icon style consistent across pages.
- Make the content credible: real field labels, useful empty states, realistic data density, and page-specific actions. Remove decorative charts and percentage arrows that cannot be explained.
- Use the logo and mascot intentionally. The mascot belongs in onboarding/help or branded empty states, not as a permanent distraction beside sensitive work.
- Review every screen with the founders before treating the reference design as final. Prefer a plain, clear workflow over visual effects that slow scanning.

## Security and data protection plan

This is a design requirement, not a claim that the future site is already secure. Use the current [OWASP ASVS](https://asvs.owasp.org/) as the verification checklist and the [OWASP API Security Top 10](https://api-security.owasp.org/editions/2023/en/0x11-t10/) for API access risks.

1. **Identity and access:** invite-only accounts for the two co-founders, both administrators. Google and email/password are alternative sign-in methods, and both must satisfy the CRM's 2FA requirement before a session is granted. Do not assume a Google login itself proves 2FA; the chosen identity setup must enforce it or require an application-level second factor. Link Google and password credentials to an invited account only through a verified, authenticated flow, never by matching an email string alone. Provide secure recovery, session expiry and revocation. Define future staff permissions before staff accounts are enabled. Enforce authorization on the server for every object and action, including search, export, files, and reports; UI hiding is only a convenience. See [OWASP's MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html) for consistent enforcement across authentication paths.
2. **Data boundaries:** validate ownership/workspace scope on every record lookup and update. Return only permitted fields. Do not accept client-controlled role, owner, price, payment amount, or status fields without authorization and validation. Payment entries and corrections require attribution and an audit trail.
3. **Browser and API:** TLS, secure HttpOnly SameSite session cookies where applicable, CSRF protection for cookie-authenticated mutations, input validation, output encoding, safe file handling, rate limits, and careful error responses. Choose these to match the eventual stack and deployment.
4. **Records and files:** encrypt in transit and at rest through the chosen platform, limit upload types and sizes, scan or quarantine uploads as appropriate, authorize downloads, avoid public object URLs, and define retention, deletion, and backup restore procedures.
5. **Operations:** secrets outside source control, least-privilege service credentials, dependency updates, separate development/staging/production, audit logs for sensitive changes, monitoring and alerts, and a tested restore path. Collect only customer information the founders need.
6. **Verification before launch:** test that both sign-in methods enforce 2FA, that unenrolled or recovering accounts cannot bypass it, and that account linking cannot take over another founder's account. Add permission tests for every role and record, failed-login and recovery tests, form and upload tests, accessibility checks, small-screen checks, and an independent security review of the implemented system. Test only an authorized staging environment.

## Implementation sequence and expected impact

| Phase | Deliverable and review point | System impact | Company impact |
| --- | --- | --- | --- |
| **0. Discovery** | Confirm workflow, field list, metric definitions, data retention, and hosting constraints. Record the confirmed founder access and sign-in requirements. Review wireframes and one visual direction. | Prevents schema and interface rework. | Founders agree on the process the CRM will support. |
| **1. Foundation** | Pick stack and hosting; create design tokens, navigation, database schema, invite-only auth, permissions, and audit events. | Establishes data and access boundaries that later pages rely on. | Protects company and client information from the first usable build. |
| **2. Core CRM** | Implement website leads, proposal versions and acceptance, clients, contacts, deposit recording, conversion, projects, tasks, search, and activity history. | Creates the central source of truth and core record relationships without a redundant Deal object. | Reduces lost inquiries and makes a confirmed project depend on acceptance and deposit. |
| **3. Coordination and payments** | Calendar, notifications, files, progress-payment schedule and ledger, and dashboard based on live records. | Adds scheduling, auditable payment records, and more background jobs or storage if needed. | Improves follow-up, delivery visibility, and payment tracking. |
| **4. Insight and administration** | Defined reports, exports, preferences, team controls, and operational settings. | Adds aggregation and stricter export controls. | Gives founders measurable pipeline and payment insight without misleading figures. |
| **5. Release** | Accessibility, responsive, schema migration, security, backup/restore, and founder acceptance checks. | Verifies reliability and production operations. | Makes the tool safe and practical for daily use. |

### Phase 1 implementation status — October 30, 2026

The local application now includes a restrained responsive design system; sign-in with Google or email/password; authenticator enrollment, challenge, backup-factor selection and setup; invitation and password-recovery screens; a founder-only empty dashboard and account page; and a Supabase migration for workspaces, membership, and a read-only audit-event schema. The app has no client records and displays no sample metrics. Future business changes must write audit events from a trusted transaction; no business actions exist yet to generate those entries.

The TypeScript check passed after the latest application changes on October 30, 2026; a production build and broad responsive visual review remain open. The user reports a successful local sign-in to the dashboard after accepting the invitation and completing the account flow. That does not verify Google sign-in, password recovery, account linking, all MFA recovery paths, RLS behavior, or deployment configuration. Phase 1 is **not accepted for real client data** until both sign-in methods, MFA, recovery, RLS, backups, and responsive behavior are checked against a running deployment. Custom email templates require custom SMTP or an eligible Supabase plan; the local invitation handoff now uses a dedicated callback route. The Supabase Site URL is still set to the local invite callback and must be changed to the production domain and same callback path before deployment. See [PHASE1_SETUP.md](PHASE1_SETUP.md) for the handoff and test checklist.

### Invitation redirect correction — October 30, 2026

The founder's Supabase account initially showed a confirmed email and successful invite verification, but the dashboard's default invitation email returned to ordinary verification/sign-in instead of the app's password setup screen. The callback now completes in the browser so it can handle both PKCE authorization codes and Supabase's default email-link session fragments; a same-origin server endpoint validates the session and active workspace membership before issuing a short-lived signed password-flow cookie. Supabase URL Configuration points its default Site URL at `http://localhost:3000/auth/invite-callback` and allows the local callback routes on `localhost` and `127.0.0.1`. The user later reported reaching the local dashboard with the replacement test account after completing invitation and MFA. Password recovery and the remaining auth paths still need a deliberate end-to-end check.

### Phase 2 groundwork — October 30, 2026

A local migration defines workspace-scoped clients and contacts, website leads, versioned proposals, projects, tasks, and manual deposit/progress payment entries. Its RLS policies require AAL2 workspace membership, restrict writes, and record audit events; database guards require proposal acceptance and a recorded deposit before project conversion. A focused review added protection against editing accepted proposals and project agreement terms, and made automatic deposit-to-project linking auditable. The accepted-proposal guard rejects all updates once accepted; create a new version for revised terms. The user ran the migration in Supabase; the Table Editor now confirms `clients`, `contacts`, `leads`, `payment_entries`, `projects`, `proposals`, and `tasks` are present alongside the Phase 1 tables. This verifies schema presence, not live application workflows or complete security validation.

The first Phase 2 application slice includes workspace-scoped Dashboard counts, a Leads list and create flow, a non-drag Pipeline view, Client and Project lists, and Task list/create/complete flows. Tasks can now link to one lead, client, or project, and those record pages show linked tasks with a shortcut to create another. Server actions derive the founder and workspace from the authenticated session, validate each linked record, and rely on RLS plus audit triggers for enforcement and history.

The Leads page now follows the reference with live stage KPI cards, stage filters, sanitized search, database sorting, pagination, and a selected-lead detail/activity panel. The full lead workflow remains separate; project conversion is linked from the panel only when the accepted proposal and deposit both exist, with existing server/database checks still authoritative. The selected panel and table stack on smaller screens and table rows become labeled cards. The CRM currently has no lead records, so the local browser preview shows truthful zero counts and the first-lead state. `npm run typecheck` passed and the local Leads page rendered successfully.

The dashboard follows the supplied chart layout with four workspace-scoped counts, a real leads-over-time chart and source mix chart with 1-month/30-day/90-day ranges, recent leads, next tasks, active project status/targets, and recent audit changes. The project schema does not store a completion percentage, so the status panel does not invent one. Notification delivery and global search remain outside this dashboard update. `npm run typecheck` is the implementation check; the repository still needs its live CRM workflow and cross-device browser verification.

### Phase 2 lead-to-project workflow — October 30, 2026

The live Supabase schema and guards were checked before implementation. The app now has a lead detail page with manually controlled sales stages, lost reasons, versioned proposal drafts, a record-as-sent step, acceptance note/evidence capture, deposit recording, and a dedicated project-conversion page. Conversion uses a deliberate client confirmation, reuses a client already linked to that lead when present (otherwise creates and links one), derives price and currency from the accepted proposal, and relies on the existing database trigger to recheck acceptance/deposit, link the deposit, and mark the lead Won. Client detail pages connect linked leads, contacts, and projects. Project detail pages show the accepted agreement, actual payments received, remaining/over-agreed amount, and delivery status; progress payments require a confirmation that the money was received. Project completion is also confirmed before saving.

All affected queries and writes are scoped to the authenticated founder’s workspace; actions use the existing AAL2 gate and the session user ID. Form validation stays beside fields, irreversible acceptance and payment records require explicit confirmation, and successful actions show dismissible status toasts. Conversion and details use full pages instead of narrow dialogs. Responsive styles stack lead/project/client sections at tablet and phone widths, use full-width controls on small screens, and keep payment rows readable without horizontal scrolling. The conversion check is a dedicated review page, not a pop-up modal.

The live database still records actual payments only. A follow-up migration, `202610300003_project_payment_schedules.sql`, now adds versioned fixed/percentage schedules, due dates, exact reconciliation to the unpaid balance, partial payment allocation, and database enforcement for milestone limits. It also adds database uniqueness for one accepted proposal and one deposit per proposal. The project UI is wired to this migration but will show “Schedule database update needed” until it is applied in Supabase. No migration has been applied remotely during this turn. The database still has no representation for payment correction/refund entries. The app also does not upload signed files, generate proposal documents, email proposals, collect client payments, create/edit contacts, reassign tasks between founders, or provide a full activity timeline. New tasks are assigned to the current founder because the existing membership policy does not expose the other founder’s identity for a safe assignment picker. A project cancellation reason is not represented in the schema, so the UI currently offers Planned, In progress, On hold, and Completed transitions only. See [PHASE2_PAYMENT_SCHEDULE_SETUP.md](PHASE2_PAYMENT_SCHEDULE_SETUP.md) for application steps and security effects.

Tasks now link to at most one lead, client, or project, and each record detail page lists its linked tasks. The task form validates that the target is active and belongs to the current founder’s workspace. `npm run typecheck` passed after this change; browser inspection confirmed the task creation form and its empty relationship selector render. Live task create/complete behavior and RLS enforcement have not been exercised.

### Tasks / Deals navigation page — October 30, 2026

Added `/tasks-deals` to the shared desktop and mobile navigation. The Deals view groups live leads into New Leads, Contacted, In Progress (Discovery), Review / Proposal, and Won. It uses no separate Deal table; each card opens its actual lead record. The Tasks view reads real workspace tasks, shows the linked record and due date, and routes full completion management to the existing Tasks page. Summary counts are workspace-scoped. Search and selected view are URL-backed. Add actions open the existing lead/task forms; this overview has no modal and adds no database mutation, migration, or permission.

The board’s five columns scroll inside their own keyboard-focusable region, summary cards reduce to two columns for tablet/mobile widths, toolbar controls wrap, and task rows stack on narrow phones. The empty deal state explains the accepted-proposal-plus-deposit rule; lost leads link back to the Leads list. Desktop browser inspection confirmed the truthful empty opportunity board, the existing open-task list, and the new navigation link. `npm run typecheck` and `git diff --check` passed. A dedicated small-device visual review and live lead/task workflow verification remain open.

### Projects directory — October 30, 2026

Updated `/projects` with live status counts and filters, searchable/sortable ten-row pagination, and a selected-project panel for Overview, Tasks, Payments, and CRM changes. Rows show client, dates, agreed amount, and delivery status. Overview uses accepted proposal scope, linked tasks, and payment ledger totals. The payment bar is explicitly labeled payment collection and is not treated as delivery completion. The page is read-only and adds no database object or migration; project creation remains behind accepted-proposal and deposit conversion checks, so the primary action reviews leads. No demo names, thumbnails, team members, files, tags, or completion percentages are generated. All queries are workspace-scoped and subject to RLS. The local browser confirms the current empty-project state and zero counts; `npm run typecheck` and `git diff --check` pass. Selected-project and small-device visual reviews remain open until real project data is available.

`npm run typecheck` passed after the schedule UI and server-action changes. The CRM starts empty, so no live lead/proposal/payment conversion was executed and no sample or production record was created. The existing migration tables and safeguards were verified earlier in the Supabase dashboard; the follow-up migration is local only. This does not replace workflow, RLS, SQL execution, or responsive browser checks. Phase 2 is not launch-ready until the follow-up SQL is applied successfully, the full workflow is exercised, and the remaining schema/product decisions are addressed.

### Calendar page — October 30, 2026

Added `/calendar` to the shared navigation and built Month, Week, Day, and List views from existing workspace data: lead follow-up timestamps, open task due dates, and active project target dates. Date and category filters are URL-backed; event links return to their CRM records. Times display in Asia/Manila, while project targets remain all-day dates. The List view follows its selected month and its period arrows move between months. The page is read-only: Add Task opens the existing task form, with its existing save feedback. No sample events, standalone meeting modal, new table, migration, or new permission were introduced.

The month grid turns into a phone agenda, week columns stack into day sections, and the side summaries move under the calendar at narrow widths. Browser inspection confirmed the calendar loads with the founder's real task deadline, the task filter count, and the List view; no fixture records were added. `npm run typecheck` and `git diff --check` pass. Tablet/phone visual review and adding a standalone event model with timezone, attendee, and location decisions remain future work.

### Reports page — October 30, 2026

Added `/reports` to the desktop and mobile navigation. Reports use a custom Manila date range and quick presets to show inquiry stage/source snapshots, sent proposal versions, new projects and clients, client additions over time, project status, received payments, contracted amount, project value grouped by client and currency, overdue open tasks, and recent project audit changes. Amounts remain grouped by currency; agreed project value and recorded cash are labeled separately. The stage panel explicitly describes current status for inquiries created in the range, not an inferred historical conversion rate. Project-type reporting was omitted because the project schema has no type field.

CSV export is generated on the server after the same AAL2 founder and active-workspace checks as other CRM pages. It contains aggregate counts and financial totals, no contact email or phone fields, uses formula-safe CSV cells, and is marked private/no-store. Export progress and errors appear accessibly; no confirmation modal is needed for this aggregate-only export. Report queries stay read-only, workspace-scoped, and subject to RLS. Loading, per-section error, invalid-range, and empty states are included. Tablet and phone layouts reflow charts/cards and keep tables inside their own scroll region. Browser inspection showed the live October inquiry and truthful empty proposal/project/payment states; `npm run typecheck` passed. The export button, populated financial scenarios, and small-device visual behavior still need a focused follow-up check.

### Settings and profile page — October 30, 2026

Added `/settings` to the desktop/mobile navigation and linked the top-bar avatar to it. The page reads the signed-in Supabase Auth user and workspace membership, allows the founder to update only their display name in their own Auth metadata, and shows email, workspace name, and role as read-only values. Asia/Manila is shown as the current fixed display timezone. The security card links to the existing MFA management and local sign-out controls. No migration, membership mutation, role control, notification preference, integration, billing control, or profile-image upload was added.

Profile photo editing now extends that screen. The founder can choose, preview, save, replace, or remove a personal photo; the account menu uses the same image. A new private Storage bucket migration restricts uploads to 2 MB JPG/PNG/WebP files and applies AAL2, active-admin, and owner checks. The object path is stored only in the signed-in user's Auth metadata. The migration must be applied to the Supabase project before uploads work; see `PROFILE_AVATAR_SETUP.md`.

The profile form validates the name, shows field-level errors, and gives a toast only after Auth confirms the saved change. MFA enrollment and authenticator removal remain on the existing Security page; the latter retains its confirmation dialog. Loading, error, workspace-query warning, and narrow-width layouts are included. The CRM pages remain behind the existing AAL2 founder check, and profile metadata is not used for authorization. TypeScript and local browser checks are the next verification items; phone/tablet visual review remains open.

The `/access-pending` screen now signs out the current browser session and navigates to `/sign-in` after Supabase confirms success. It disables the button while pending and shows an inline retry error if sign-out fails. This changes no workspace membership, AAL2 gate, or database policy.

### Record images — November 1, 2026

Leads, clients, projects, and project delivery tasks now share an image picker and saved-image gallery. New record forms accept images before submission and upload them after the record exists. Existing records can add and remove images from the lead edit/workflow, client detail, project detail, and task detail screens. The lead edit dialog uploads selected images with Save changes; the other saved-record galleries upload immediately. The newest saved lead image appears as the avatar in the lead list and selected-lead panel, with initials as a fallback. Optional lead Location and Timeline fields are disabled when absent from the loaded schema; if a schema mismatch is returned during save, the form retries without only the missing optional field and names the skipped value. This keeps other lead changes and images available without silently claiming that Location or Timeline was saved. The private `crm-record-images` Storage bucket allows JPG, PNG, and WebP up to 5 MB each. Object paths include the workspace, record type, and record ID; Storage policies verify AAL2, active workspace membership, role, and record ownership by that workspace. Images are loaded with authenticated downloads. A partial upload keeps failed files selected for retry without creating a duplicate record. Remove requires an in-page confirmation.

Client directory, selected-client panel, and full client detail title use the newest client image, then an image from an explicitly linked lead or project lead, then initials. The avatar reads the existing private images; it does not copy files or infer links from a matching company name. The detail title refreshes immediately after an image is uploaded or removed there.

The project detail title uses the newest project image, then the linked client's image, then the originating lead's image, and finally initials. Uploading or removing a project image refreshes that title image immediately. This display change adds no new record field, storage policy, or external integration.

Apply `supabase/migrations/202611010008_crm_record_images.sql` in the trusted Supabase SQL Editor before the feature can store images. See `RECORD_IMAGES_SETUP.md` for the verification sequence. Signed proposal documents, payment receipts, and arbitrary file uploads remain separate future work. `npm run check` passes locally; remote Storage policy and browser workflow checks remain open until the migration is applied.

Before each implementation phase, explain the proposed change, touched data and screens, permission implications, company benefit, risks, and how it will be verified. After the phase, report what actually changed and any remaining limits. Do not begin application code until the founders have reviewed this plan and selected a starting phase.

## Decisions to resolve with the founders

- Confirm exact lead-stage labels and the minimum required fields for leads, clients, contacts, projects, and tasks before broadening the UI. The implemented lead labels are New, Contacted, Discovery, Proposal sent, Accepted · awaiting deposit, Won, and Lost. The workflow rule is enforced both in the UI and by the project-conversion database guard: a lead becomes a project only after proposal acceptance and a recorded deposit. Acceptance evidence is stored as a note, type, and private file/message reference; file upload is deferred. Fixed-amount and percentage-based progress milestones are still required and need a schema migration.
- Decide how partial payments, corrections, refunds, and reversed payments should appear in the payment history. Payment rows are insert-only today, so a mistaken entry cannot be corrected or refunded in the app; design an append-only reversal/correction migration before operational use.
- Choose hosting, domain, budget, and the identity setup that will enforce 2FA for both confirmed sign-in methods. The founders' administrator access and the empty starting CRM are already confirmed.
- Decide which notifications and calendar/email integrations have immediate business value. Online payment collection remains later work and needs its own design and security review.
- Revisit staff roles only when there is a concrete plan to invite staff; the launch audience is the two co-founders, both administrators.

## Acceptance criteria for the first usable release

Both founders can sign in with either Google or email/password only after satisfying 2FA; record a website inquiry and its brief; assign a follow-up; track discovery and proposal; record proposal acceptance and deposit; convert the lead into a linked website project without losing history; track delivery tasks, dates, and progress payments; and see accurate dashboard counts. The empty starting CRM has helpful first-record states and no fabricated figures. An uninvited visitor cannot access CRM data, and a signed-in account cannot perform an operation beyond its permissions. Core flows work on phone, tablet, and desktop with keyboard and touch. Failure states explain what happened, and backups can be restored.
