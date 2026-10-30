# StrataForge CRM: product goal and implementation plan

**Status:** Phase 1 local foundation implemented; live identity, database, and browser checks remain before use with client data. Phases 2–5 remain planned.  
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
| 5 | Projects | Keep status, owner, due date, progress, and detail view; calculate progress from explicit project rules. |
| 6 | Calendar | Bring together meetings, deadlines, and follow-ups, with an agenda view for smaller screens. |
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
| **Dashboard** | Answer: what needs attention today? | Real lead and project counts, overdue tasks, upcoming meetings, recent activity, and links to filtered records. Empty states explain the first action. Charts are secondary to actionable lists. |
| **Pipeline and Tasks** | Track website inquiries and assigned work without conflating them. | Pipeline board shows lead stages, including accepted proposals awaiting a deposit; a separate task view shows sales follow-ups and delivery actions. Both have accessible list views, owner/due-date filters, and non-drag controls. A move to Won checks proposal acceptance and deposit. |
| **Leads and Proposals** | Capture, discuss, propose, and convert website inquiries. | List with filters, sorting, saved URL state, pagination, and a lead detail page/panel with brief, proposal versions, notes, and activity. Required fields, duplicate warning, owner, source, budget range if known, follow-up date, and explicit conversion once both conditions are met. |
| **Clients** | Maintain the relationship after conversion. | Client list and detail with contacts, linked projects, notes, files, and a dated activity log. Edit contact details with validation; archive only through an explicit action. |
| **Projects and Payments** | Follow website delivery and progress payments from deposit to launch. | List and detail with client, accepted proposal, agreed scope, owner, milestones, tasks, target launch date, files, team, status, and an installment ledger. Progress is based on an agreed formula or manual value with clear ownership; overdue delivery and overdue payment states are distinct. |
| **Calendar** | View meetings, follow-ups, task due dates, and milestones. | Month, week, and agenda views; event create/edit; timezone shown; event links back to its record. Handle overlapping events, all-day items, and date changes deliberately. |
| **Reports** | Help founders understand inquiry, delivery, and payment trends. | Defined inquiry-to-proposal and proposal-to-won conversion, source mix, project status, overdue work, scheduled versus received payments, and date filters. Show numerator, denominator, currency, and time range; allow CSV export only for permitted data. Do not mix quoted, contracted, and paid amounts. |
| **Settings** | Manage each founder’s account and the company workspace. | Profile, company details, time zone/date format, notifications, password/MFA, active sessions, and audit activity. Team invites and role changes require a founder with admin permission. Integrations, API keys, and billing are hidden until implemented. |
| **Global search, notifications, and account menu** | Let founders move quickly without losing context. | Permission-filtered results grouped by object, useful no-results state, notifications linked to records, profile, and sign-out. Search queries must never expose records a user cannot open. |

Each page needs loading, empty, error, stale-data, and permission-denied states. Forms preserve user input after a recoverable error. Destructive actions state the affected record and consequence before submission.

### Page-by-page dialogs and feedback

| Page | Dialogs or focused forms | Toast or persistent feedback |
| --- | --- | --- |
| Sign in | Password recovery and reset use dedicated, linkable screens; account invitations open an acceptance screen. First sign-in completes 2FA enrollment before CRM access. | Show errors beside the form. A generic sign-in error avoids revealing whether an email exists; a successful recovery request shows a neutral confirmation. |
| Dashboard | No dashboard-only modal; actions open the underlying record or its create form. | A completed quick action can show a short success toast; failed loading stays visible in the affected card with Retry. |
| Pipeline and Tasks | Add/edit task; change owner or due date; confirm a stage change if it has business consequences. | Confirm saved task or stage; show a specific error if another founder changed the record first. |
| Leads and Proposals | Add/edit lead; create or revise proposal; record acceptance; merge or resolve a possible duplicate; conversion flow; archive confirmation. | Confirm creation, proposal send, and conversion with a link to the record. If acceptance or deposit is missing, explain it in the conversion flow. Validation stays at the field; failed conversion keeps the entered data. |
| Clients | Add/edit client or contact; archive confirmation; message composer only when an actual email integration exists. | Confirm changes. Show a blocking, explanatory error if archiving would violate a required project rule. |
| Projects and Payments | Project creation as a full form; edit project; add milestone/member; record installment payment; confirm payment correction, completion, or cancellation. | Confirm state changes with a link. A payment entry stays visible in the project ledger; upload and payment errors are durable and retryable. File upload uses visible progress. |
| Calendar | Add/edit event; confirm deletion or a scheduling change that affects attendees. | Confirm event save; warn in the form about conflicts or invalid times rather than relying on a brief toast. |
| Reports | Date-range picker; export scope confirmation when data is sensitive or large. | Export progress and completion link; an empty report explains the selected date range. Payment charts identify whether they show scheduled or received amounts. |
| Settings | Change password, configure MFA, revoke session, invite founder, change role, or discard unsaved changes. | Confirm saved preferences; security actions get persistent confirmation and audit records. Do not use a toast as the sole confirmation of an account change. |
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

The production build and TypeScript check passed before the latest account-security and setup-screen edits; they have not been rerun since those changes. The local preview has rendered the setup page, but responsive visual review is still open. Phase 1 is **not accepted for real client data** until StrataForge configures its own Supabase project, founder identities, Google provider, email templates, SMTP, and environment variables, then verifies both sign-in methods, MFA, account linking, recovery, RLS, and responsive behavior against a running deployment. See [PHASE1_SETUP.md](PHASE1_SETUP.md) for the handoff and test checklist.

### Phase 2 groundwork — October 30, 2026

A local migration draft now defines workspace-scoped clients and contacts, website leads, versioned proposals, projects, tasks, and manual deposit/progress payment entries. It adds RLS policies for AAL2 workspace members, insert/update restrictions, audit-event triggers, immutable payment entries, and a database guard that only converts a lead after an accepted proposal and recorded deposit. This is schema groundwork only: no CRM CRUD screens or server mutations are implemented yet, the migration has not been applied or validated against Supabase, and the payment schedule, reversals, files, search, and activity UI remain later work. Do not treat Phase 2 as launch-ready.

Before each implementation phase, explain the proposed change, touched data and screens, permission implications, company benefit, risks, and how it will be verified. After the phase, report what actually changed and any remaining limits. Do not begin application code until the founders have reviewed this plan and selected a starting phase.

## Decisions to resolve with the founders

- Confirm exact lead-stage labels and the minimum required fields for leads, clients, contacts, projects, and tasks before Phase 2 schema work. The workflow rule is already set: a lead becomes a project only after proposal acceptance and a recorded deposit. Acceptance can be evidenced by a signed file or approval message with a note. Fixed-amount and percentage-based progress milestones are both required.
- Decide how partial payments, corrections, refunds, and reversed payments should appear in the payment history; the plan currently assumes corrections preserve the original record and remain auditable.
- Choose hosting, domain, budget, and the identity setup that will enforce 2FA for both confirmed sign-in methods. The founders' administrator access and the empty starting CRM are already confirmed.
- Decide which notifications and calendar/email integrations have immediate business value. Online payment collection remains later work and needs its own design and security review.
- Revisit staff roles only when there is a concrete plan to invite staff; the launch audience is the two co-founders, both administrators.

## Acceptance criteria for the first usable release

Both founders can sign in with either Google or email/password only after satisfying 2FA; record a website inquiry and its brief; assign a follow-up; track discovery and proposal; record proposal acceptance and deposit; convert the lead into a linked website project without losing history; track delivery tasks, dates, and progress payments; and see accurate dashboard counts. The empty starting CRM has helpful first-record states and no fabricated figures. An uninvited visitor cannot access CRM data, and a signed-in account cannot perform an operation beyond its permissions. Core flows work on phone, tablet, and desktop with keyboard and touch. Failure states explain what happened, and backups can be restored.
