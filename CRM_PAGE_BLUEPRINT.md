# StrataForge CRM: page and interaction blueprint

**Purpose:** a reviewable screen specification before application code. Read with [CRM_IMPLEMENTATION_PLAN.md](CRM_IMPLEMENTATION_PLAN.md). The ten supplied images show possible layouts; their numbers, dates, labels, and decorative elements are not approved product requirements.

## Shared navigation and design rules

The proposed navigation is **Dashboard**, **Leads**, **Pipeline**, **Clients**, **Projects**, **Tasks**, **Calendar**, **Reports**, and **Settings**. Proposals live in a lead record; payment milestones live in a project record. Search, notifications, and the account menu are available from the shared header. This keeps daily work easy to find without multiplying top-level pages.

The interface uses one type scale, spacing system, and icon style. Orange identifies the main action and StrataForge brand. Status colors are consistent across pages and always include text, so a colored badge is never the only clue. Charts and cards earn their place by helping a founder decide what to do next. Mascot art can support onboarding or empty states; it should not crowd working screens. No AI assistant is included until it has a defined capability and data-use policy.

Each screen needs a visible title, one clear primary action, an understandable empty state, a loading state without layout jumps, an error with a way to retry, and an access-denied state. Search and filter settings should be reflected in the URL where practical, so a founder can share or return to a view. Records show who last changed them and when.

## 1. Sign in, invite acceptance, and recovery (reference image 9)

**What founders do:** sign in with Google or email/password; complete 2FA; accept an invite; recover a password or lost second factor through a controlled process; sign out and revoke other sessions.

**Layout and content:** a compact form with the StrataForge identity, clear field labels, password visibility control, Google button, and recovery link. Promotional copy and art are secondary. The form explains that access is by invitation. The 2FA step is explicit and appears before any CRM data loads.

**Dialogs and feedback:** recovery and invite acceptance are dedicated pages with their own URLs; a small dialog may explain a session timeout. Invalid credentials and 2FA errors appear beside the form, not as a fleeting toast. After a recovery request, show a neutral confirmation that does not disclose whether an email is registered. A security change gets a persistent confirmation and activity entry.

**Small screens:** the form fills available width with comfortable margins; promotional imagery is hidden or reduced before the form becomes cramped. At 320 CSS px equivalent, both sign-in choices, labels, and recovery remain usable without sideways page scrolling.

**System and company impact:** this is the gate to every private record. Supporting two sign-in methods adds account-linking and recovery complexity, but gives the two founders a usable fallback. Both methods must enforce the same 2FA policy.

## 1a. Local setup (`/setup`)

**What founders do:** connect the local app to the private StrataForge Supabase project before using sign-in or CRM pages. The page explains that the workspace is unconfigured, lists the environment-variable names to set in `.env.local`, gives a command to generate the server-only `AUTH_FLOW_SECRET`, and points to `PHASE1_SETUP.md` for the database migration and provider configuration.

**Security and states:** never show or request credentials on this page. Remind the founder not to expose a Supabase service-role key through a `NEXT_PUBLIC_` variable or commit `.env.local`. Missing configuration stays a clear setup state; once credentials are configured, the page should redirect into the normal sign-in flow. A failed connection must not expose provider errors or project secrets.

**Small screens:** render the steps in one column, allow long variable names and commands to wrap, and preserve readable spacing at 320 CSS px without horizontal page scrolling.

**System and company impact:** this turns an otherwise ambiguous “workspace unavailable” screen into an actionable handoff for initial deployment. It does not create the Supabase project or provision founders; those steps remain controlled setup work.

## 2. Dashboard (reference image 1)

**What founders do:** see leads needing a reply, proposals awaiting acceptance or deposit, overdue tasks, upcoming events, active projects, and recent activity. Every count links to the filtered records behind it.

**Layout and content:** start with a concise attention list. Summary cards and small charts can follow when there is enough real data. The empty starting workspace shows actions such as “Add the first lead” and “Set up your profile,” not invented growth percentages or revenue.

**Dialogs and feedback:** quick-add can open a focused lead or task form; complex edits open the full record. A successful quick action gives one short toast and a record link. A failed card stays in place with Retry. Notifications about overdue work remain in the notification list.

**Small screens:** stack attention items before charts; use one or two summary columns depending on space. Hide nonessential chart decoration, provide text summaries, and avoid a tall hero image that pushes work below the fold.

**System and company impact:** dashboard queries aggregate live records and must respect permissions and time ranges. For the founders, this becomes the daily follow-up list rather than a decorative scorecard.

## 3. Pipeline (reference image 2)

**What founders do:** move an inquiry through New, Contacted, Discovery, Proposal sent, Accepted awaiting deposit, Won, or Lost; filter by founder, follow-up date, and status; open a lead to see why it is in a stage.

**Layout and content:** the board is for lead stage only. Cards show client/company, website brief, owner, next action, and proposal/deposit indicator. A list view provides the same actions and is the default when a board is hard to use. Task completion never moves a lead automatically.

**Dialogs and feedback:** changing to Won opens a confirmation flow that checks accepted proposal evidence and recorded deposit. If either is missing, show a specific checklist and keep the lead in its current stage. A successful move gives a short toast; a conflicting edit by the other founder gives a persistent message with Refresh. Marking Lost asks for a reason, with a way to reopen later.

**Small screens:** use a stage selector and list as the default; offer horizontal board scrolling only inside the board region. Stage changes work through buttons or menus, not drag alone. Cards preserve readable names and next-action dates at 320 CSS px equivalent.

**System and company impact:** server rules enforce stage transitions and retain activity history. The founders can see which inquiries need work and which accepted offers still need a deposit.

## 4. Tasks (task content in images 1 and 2)

**What founders do:** assign follow-ups and website delivery actions, set due dates, mark work complete, and filter by owner, project, and overdue status.

**Layout and content:** list view first, with optional compact board by task state. Each task shows title, assignee, linked lead/client/project, due time, priority if used, and completion state. A task has its own status independent of lead and project status.

**Dialogs and feedback:** add/edit task is a focused dialog; deleting or removing an assigned task requires confirmation. Completion gets a short toast with an Undo action only if undo is reliably supported. Validation or save failures stay on the form and preserve input.

**Small screens:** task cards show title, due date, and assignee first; secondary fields move into the detail view. The completion target is comfortably touchable and can be operated by keyboard.

**System and company impact:** tasks create an accountable owner and date for each next step, reducing missed replies and unclear delivery work.

## 5. Leads and proposals (reference image 3)

**What founders do:** add a website inquiry; record the brief, source, contact, owner, and next follow-up; document discovery; create and revise a proposal; mark acceptance with a note and either a signed file or approval message; record the deposit; then convert to a client-linked project.

**Layout and content:** list view has search, stage tabs, owner filter, and useful columns. The detail view has Overview, Notes, Activity, Proposals, and Files. Proposal versions show quoted amount and currency, scope, sent date, status, and acceptance evidence. An earlier version stays readable after a revision. A lead can be linked to an existing client.

**Dialogs and feedback:** add/edit lead is a focused form; a duplicate warning lets the founder inspect an existing record before saving. Proposal drafting and revision use a substantial form; “mark accepted” requests the acceptance note and evidence. Conversion uses a dedicated flow showing accepted proposal, deposit, client link, and proposed project details. Success toasts link to the lead or project; failed acceptance or conversion keeps the form open with a specific reason. Archive asks for confirmation.

**Small screens:** lead list becomes cards with name, stage, owner, and next follow-up. The detail panel becomes a full page; tabs can scroll within their own bar while all content remains accessible. Proposal editing is a full-screen form rather than a narrow modal.

**System and company impact:** this is the sales source of truth. Versioned proposals and explicit acceptance prevent the team from confusing an initial budget range with agreed scope or price.

## 6. Clients (reference image 4)

**What founders do:** view the company or person, contacts, active and past website projects, notes, files, and communication activity; update contact details; create another inquiry or project for an existing client.

**Layout and content:** list shows client name, primary contact, active project count, last meaningful activity, and owner if applicable. Detail sections show contact information, linked leads and projects, and chronology. A client is created or linked during conversion; founders can also add one deliberately when needed.

**Dialogs and feedback:** add/edit client or contact uses a focused form with duplicate checks. Archive is confirmed and blocked or explained if active projects depend on the record. A saved change gets a short toast; a failed save leaves the entered data intact. “Send message” appears only after a real email integration exists.

**Small screens:** client list becomes cards; contact methods are tap-friendly without hiding the full value. Detail sections stack, and project history stays searchable.

**System and company impact:** one client record ties multiple jobs and contacts together, improving continuity when either founder handles a conversation.

## 7. Projects and progress payments (reference image 5)

**What founders do:** deliver a website from a confirmed proposal, assign work, track milestones and files, record deposit and progress payments, and see due and outstanding amounts. Project creation follows accepted proposal plus recorded deposit.

**Layout and content:** project list prioritizes name, client, owner, status, next milestone, and target date. Detail sections are Overview, Tasks, Milestones, Payments, Files, and Activity. The Payments section shows accepted price, scheduled installments, received amounts, and remaining balance as distinct values. Installments can be fixed amounts or percentages; the schedule must reconcile to the accepted price, with a visible rounding rule. A manual payment entry shows date, amount, reference, and recorder. The UI does not imply that a manually recorded payment was independently verified by a bank.

**Dialogs and feedback:** project creation and scope changes use full forms; add milestone and record payment use focused forms. Payment correction or reversal requires a reason and confirmation, retaining the old entry in the audit history. A save toast is short, but the resulting payment entry remains visible in the ledger. Upload progress and upload failure are shown near the file, not only in a toast. Completion and cancellation name the project and consequences.

**Small screens:** project list uses cards; the detail view is full-screen with a clear section switcher. Payment rows become stacked entries that keep amount, currency, due date, paid status, and reference legible. No financial value is clipped without a way to read it.

**System and company impact:** proposal, delivery, and payment records become linked. This helps founders spot overdue installments and scope changes, while adding a need for careful corrections and auditability. Client payment through the CRM is a later integration and is outside this first release.

## 8. Calendar (reference image 6)

**What founders do:** see discovery calls, follow-ups, project milestones, task deadlines, and meetings; create or change events; open the related CRM record.

**Layout and content:** month and week views support planning; agenda view supports scanning. Event type, owner, time, timezone, and related record are shown clearly. Overlaps and all-day items remain readable. The calendar does not silently claim a meeting was added to Google Calendar unless integration is active and confirmed.

**Dialogs and feedback:** event create/edit form; delete confirmation; conflict warning in the form; success toast after save. Failed external sync, if introduced later, needs a persistent status and retry path.

**Small screens:** agenda is the default, with date navigation and event cards. A dense month grid may be available for overview but cannot be the only way to access an event.

**System and company impact:** the calendar gives the team a shared view of sales and delivery commitments, with timezone-safe dates and linked records.

## 9. Reports (reference image 7)

**What founders do:** inspect inquiry sources, proposal and win rates, active work, overdue tasks, scheduled installments, and payments recorded as received; choose a date range and export permitted data.

**Layout and content:** every chart names its time range, units, numerator, and denominator. Quoted, agreed, scheduled, invoiced, and received amounts are separate and appear only when those records exist. An empty chart explains that there is no data yet. The mockup's sample revenue is never shown as fact.

**Dialogs and feedback:** date-range control is inline or a popover; export may ask for scope confirmation and then show progress and a completion link. Export failure gives a durable retry message. There is no toast for merely changing a filter.

**Small screens:** charts stack with text summaries and accessible data tables. Filters remain reachable without occupying the entire viewport. Tables scroll within their own region or transform into readable summaries.

**System and company impact:** aggregation and exports need consistent metric definitions and permission checks. In return, founders can make decisions from actual pipeline and payment data.

## 10. Settings (reference image 8)

**What founders do:** manage profile, company details, timezone, notification preferences, 2FA, sessions, and founder invitations. Both co-founders are administrators. Future staff roles are designed only when needed.

**Layout and content:** separate Personal, Company, Security, Notifications, and Team sections. Show a clear save state and the last saved time. Subscription billing, API keys, and integrations are not displayed as working features until they exist. Client progress payments stay with projects.

**Dialogs and feedback:** change password, enroll or replace 2FA, revoke session, invite founder, and discard unsaved changes. Sensitive actions require reauthentication where appropriate, persist a confirmation, and write an audit event. A successful preference change may use a short toast; security changes also need a durable record.

**Small screens:** settings sections become a simple list with dedicated detail pages, not a crowded multi-column form. Save and Cancel remain visible while editing.

**System and company impact:** founders can keep access and company information current. Security settings have higher risk than ordinary preferences, so their flows need stronger checks and recovery planning.

## Shared search, notifications, and account menu

Search groups permitted leads, clients, projects, and tasks and offers a useful no-results state. Results are filtered on the server before reaching the browser. Notifications are persistent, record-linked items for assignments, deadlines, proposal acceptance, deposit recording, and security events; each has an understandable read state. The account menu provides profile, session management, and sign-out.

On tablet and mobile, search opens a full-width command panel and notifications use a separate page or drawer. Neither overlays a primary action. Keyboard focus is managed when opening and closing either surface.

## Toast and dialog rules across pages (reference image 10)

Use one default toast style with four meanings: success, error, warning, and information. A toast names what happened without exposing private client details. Show success only after server confirmation. Actionable errors remain until dismissed or are also visible in the affected form or record. Multiple toasts queue rather than covering each other. An Undo action appears only when reversal is real. Progress belongs in the related record or form, so a dismissed toast does not hide a long-running task.

Dialogs have a descriptive title, explicit actions, validation near fields, focus moved in and restored on close, and a safe way to handle unsaved changes. Complex work such as proposal editing, lead conversion, and project creation uses a full page or full-screen mobile flow. Confirmation dialogs name the record and consequence; they do not use vague “Are you sure?” copy.

## Responsive review matrix

| Review width | Navigation | Lists and boards | Forms and dialogs | Charts, calendar, and feedback |
| --- | --- | --- | --- | --- |
| 1440 CSS px | Sidebar and full header | Table with optional side detail | Dialog for short forms; full page for complex forms | Multi-column charts; month calendar; toasts away from actions |
| 1024 CSS px | Compact sidebar | Fewer columns, detail drawer | Short dialog sized to content | Charts reflow; calendar remains usable |
| 768 CSS px | Collapsible navigation | Priority columns or cards; list alternative to board | Large dialog or dedicated page | Two or one chart columns; week/agenda options |
| 375 CSS px | Top bar and drawer | Record cards; full-screen detail; stage selector | Single-column full-screen forms | Text summaries; agenda default; viewport-contained toasts |
| 320 CSS px equivalent and 200% zoom | Same controls remain discoverable | No whole-page horizontal scrolling; long values readable | Fields and actions fit without clipping | No covered actions, hidden errors, or inaccessible events |

These are review sizes, not a promise to hard-code breakpoints at each number. Components should change when their content no longer fits. Check keyboard-only use, visible focus, reduced motion, touch targets, contrast, and screen reader names across the same flows.

## First-release walkthrough to validate with the founders

1. A founder signs in with either method and completes 2FA.
2. They add a website inquiry, assign the other founder a follow-up, and record a discovery call.
3. They create a proposal and record that it was sent through their existing communication channel. The CRM does not claim to send email before an email integration exists.
4. They record acceptance with a note and private signed file or approval-message reference. The lead moves to “Accepted, awaiting deposit.”
5. A founder records the deposit with an amount, date, and reference. Conversion then creates or links the client and creates the website project without losing the earlier history.
6. The founders add fixed or percentage-based progress milestones that reconcile to the accepted price, then track work, due dates, and later payments.
7. Dashboard and reports show only the data created in those steps; search and exports return only authorized records.
8. The same path works on desktop, tablet, and a small phone, including form errors and recovery from a failed save.
