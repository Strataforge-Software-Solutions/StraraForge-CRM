# StrataForge CRM: page and interaction blueprint

**Purpose:** a reviewable screen specification before application code. Read with [CRM_IMPLEMENTATION_PLAN.md](CRM_IMPLEMENTATION_PLAN.md). The ten supplied images show possible layouts; their numbers, dates, labels, and decorative elements are not approved product requirements.

## Shared navigation and design rules

The current navigation is **Dashboard**, **Tasks / Deals**, **Project tasks**, **Leads**, **Pipeline**, **Clients**, **Projects**, **Calendar**, **Reports**, **Settings**, and **Security**. Tasks / Deals combines lead opportunities with general follow-ups that are not linked to a project. Project tasks is a separate shared delivery queue for work attached to active projects; teammates can claim a task to avoid duplicate work. Proposals live in a lead record; payment milestones live in a project record.

The interface uses one type scale, spacing system, and icon style. Orange identifies the main action and StrataForge brand. Status colors are consistent across pages and always include text, so a colored badge is never the only clue. Charts and cards earn their place by helping a founder decide what to do next. Mascot art can support onboarding or empty states; it should not crowd working screens. No AI assistant is included until it has a defined capability and data-use policy.

Each screen needs a visible title, one clear primary action, an understandable empty state, a loading state without layout jumps, an error with a way to retry, and an access-denied state. Search and filter settings should be reflected in the URL where practical, so a founder can share or return to a view. Records show who last changed them and when.

## 1. Sign in, invite acceptance, and recovery (reference image 9)

**What founders do:** sign in with Google or email/password; complete 2FA; accept an invite; recover a password or lost second factor through a controlled process; sign out and revoke other sessions.

**Layout and content:** a compact form with the StrataForge identity, clear field labels, password visibility control, Google button, and recovery link. Promotional copy and art are secondary. The form explains that access is by invitation. The 2FA step is explicit and appears before any CRM data loads.

**Dialogs and feedback:** recovery and invite acceptance are dedicated pages with their own URLs; a small dialog may explain a session timeout. Invalid credentials and 2FA errors appear beside the form, not as a fleeting toast. After a recovery request, show a neutral confirmation that does not disclose whether an email is registered. A security change gets a persistent confirmation and activity entry.

**Small screens:** the form fills available width with comfortable margins; promotional imagery is hidden or reduced before the form becomes cramped. At 320 CSS px equivalent, both sign-in choices, labels, and recovery remain usable without sideways page scrolling.

**System and company impact:** this is the gate to every private record. Supporting two sign-in methods adds account-linking and recovery complexity, but gives the two founders a usable fallback. Both methods must enforce the same 2FA policy.

## 1a. Local setup (`/setup`)

**What founders do:** connect the local app to the private StrataForge Supabase project before using sign-in or CRM pages. The page explains that the workspace is unconfigured, lists the environment-variable names to set in `.env.local`, and points to `PHASE1_SETUP.md` for the database migration and provider configuration.

**Security and states:** never show or request credentials on this page. Remind the founder that `VITE_` environment values ship to the browser and may contain only the Supabase project URL and publishable key; never put a service-role key or other secret there or commit `.env.local`. Missing configuration stays a clear setup state; once configured, the page should redirect into the normal sign-in flow. A failed connection must not expose provider errors or project secrets.

**Small screens:** render the steps in one column, allow long variable names and commands to wrap, and preserve readable spacing at 320 CSS px without horizontal page scrolling.

**System and company impact:** this turns an otherwise ambiguous “workspace unavailable” screen into an actionable handoff for initial deployment. It does not create the Supabase project or provision founders; those steps remain controlled setup work.

## 2. Dashboard (reference image 1)

**What founders do:** see lead volume, accepted proposals awaiting a deposit, active projects, open tasks, recent leads, upcoming tasks, project target dates, and recent recorded changes. Summary counts link to the corresponding workspace records.

**Layout and content:** match the reference composition with a greeting/date hero, four live metric cards, a leads-over-time line chart, a source-mix donut chart, recent activities, a recent-leads table, upcoming tasks, and active project status. Chart range links select this month, the last 30 days, or the last 90 days. Trend buckets and source shares are calculated from active leads created during the selected window. The project list shows status and target date because percentage progress is not stored. No sample names or counts are used.

**Dialogs and feedback:** dashboard has no modal. Add lead and add task open their full forms. Chart range controls are normal links that preserve a shareable range in the URL. Charts include text summaries and accessible labels; each panel has a readable error or empty state. Save confirmations stay on their respective forms/lists; no dashboard toast claims an action succeeded before its server save.

**Small screens:** tablet changes the three-column composition to two columns and groups the right-side panels. Phones stack charts and lists, keep the donut with its source legend, and allow the lead table to scroll inside its own panel. Summary cards become two columns, then one at very narrow widths. No whole-page horizontal scroll is required.

**System and company impact:** this adds workspace-scoped read queries only; it does not change CRM records, RLS, or security policy. The co-founders get a daily overview that points to actual next actions and real inquiry trends. Activity is limited to changes the database audit log currently records. The project data has no completion percentage, and the CRM has no notification/search service on this screen, so those reference elements are not presented as working features.

## 3. Pipeline (reference image 2)

**What founders do:** move an inquiry through New, Contacted, Discovery, Proposal sent, Accepted awaiting deposit, Won, or Lost; filter by founder, follow-up date, and status; open a lead to see why it is in a stage.

**Layout and content:** the board is for lead stage only. Cards show client/company, website brief, owner, next action, and proposal/deposit indicator. A list view provides the same actions and is the default when a board is hard to use. Task completion never moves a lead automatically.

**Dialogs and feedback:** changing to Won opens a confirmation flow that checks accepted proposal evidence and recorded deposit. If either is missing, show a specific checklist and keep the lead in its current stage. A successful move gives a short toast; a conflicting edit by the other founder gives a persistent message with Refresh. Marking Lost asks for a reason, with a way to reopen later.

**Small screens:** use a stage selector and list as the default; offer horizontal board scrolling only inside the board region. Stage changes work through buttons or menus, not drag alone. Cards preserve readable names and next-action dates at 320 CSS px equivalent.

**System and company impact:** server rules enforce stage transitions and retain activity history. The founders can see which inquiries need work and which accepted offers still need a deposit.

## 3a. Tasks / Deals (`/tasks-deals`, reference image 10)

**What founders do:** see website opportunities grouped by New Leads, Contacted, In Progress, Review / Proposal, and Won; switch to a real task list; search either view; and open the underlying lead or task workflow. “Deals” are lead records shown as opportunities. The CRM does not add a duplicate deal table. Lost leads remain available through the Leads list, outside the active board.

**Layout and content:** four summary counts use workspace records only: active opportunities, open non-project tasks, ongoing projects, and converted leads. The Deals view shows one horizontal, keyboard-scrollable board region with stage counts and cards containing only fields that exist in the selected lead (company, contact, source, follow-up date, and optional budget). Each card opens the full lead workflow. The Tasks view shows general follow-ups that are not linked to a project, including due date, status, and any related lead or client. Project-linked delivery tasks are shown in the separate Project tasks queue; completing a task cannot move a lead.

**Dialogs and feedback:** no modal is needed for this overview. Add Lead and Add Task open their existing full forms. Stage changes, proposal acceptance, deposit recording, and task completion continue through their existing record workflows, where persistence feedback is shown. Search and view are represented in the URL. Empty states explain the next valid action; data errors stay visible. No sample cards, comment counts, avatars, or priority labels are fabricated.

**Small screens:** summary counts become two columns, then retain readable labels at narrow widths. Toolbar actions wrap; the board scrolls within its own keyboard-focusable region so the page itself does not become horizontally scrollable. Task rows reduce to a stacked card. The app shell exposes the item through its mobile navigation drawer.

**System and company impact:** the page adds workspace-scoped reads and links to existing forms; it adds no database table, mutation, migration, or new permissions. This lets the co-founders scan follow-ups and opportunity stages together while preserving the proposal-acceptance-plus-deposit requirement for a won project.

## 4. Tasks (task content in images 1 and 2)

**What founders do:** create follow-ups and website delivery actions, link each task to one lead, client, or project, set due dates, and mark work complete. New tasks are assigned to the signed-in founder; reassignment is deferred until the app has a safe workspace-member directory.

**Layout and content:** list view first, with an optional compact board by task state later. Each task shows title, assignee, linked lead/client/project, due time, and completion state. Task creation uses one relationship selector so a task cannot be linked to multiple record types. Lead, client, and project pages show their linked tasks and open the task form with that relationship preselected. Project delivery tasks on the team board accept images during creation and from their detail dialog. A task has its own status independent of lead and project status.

**Dialogs and feedback:** task creation is a dedicated responsive page rather than a narrow dialog. Successful creation and completion show short toasts; validation and save failures stay on the form. Task completion never advances a lead or project. A teammate may unassign their own unfinished task, which returns it to the shared queue as open; completed tasks cannot be unassigned. Reassignment and deletion are not available in this slice.

**Small screens:** task cards show title, related record, status, due date, and assignee with secondary details below. The relationship selector uses the platform-native control, and completion remains a button that works with touch and keyboard.

**System and company impact:** tasks create an accountable owner and date for each next step, reducing missed replies and unclear delivery work.

## 5. Leads and proposals (reference image 3)

**What founders do:** add a website inquiry; record the brief, source, contact, owner, and next follow-up; attach images to new or existing leads; document discovery; create and revise a proposal; mark acceptance with a note and either a signed file or approval message reference; record a deposit; then convert to a client-linked project. Actual signed-file upload is deferred.

**Layout and content:** the lead list follows the reference with four workspace-scoped KPI cards, URL-backed stage chips, searchable and sortable rows, ten-row pagination, and a selected-lead side panel. The panel shows real contact details, source, stage, estimated budget if recorded, follow-up date, creation date, and website brief. Its Activity tab reads lead-specific audit events. The full lead workflow remains on its own page with stage controls, proposal history, payment ledger, linked tasks, image gallery, and conversion checkpoints. Proposal versions show quoted amount and currency, scope, sent date, status, and acceptance evidence. Conversion reuses a client already linked to the lead. Bulk actions and non-existent demo fields are not shown.

**Dialogs and feedback:** list search, stage, sort, selected record, tab, and page are reflected in the URL. Selecting a lead opens the side panel; “Open full lead workflow” navigates to the dedicated workflow page. Only a lead with accepted proposal evidence and recorded deposit gets the direct project-conversion action; the conversion page and database still recheck both conditions. Lead creation and proposal drafting use dedicated forms. Acceptance and deposit confirmations remain in the full workflow. No list modal or bulk-action toolbar is shown while those operations are unsupported. A successful lead creation shows one dismissible toast; list and panel errors stay visible and do not pretend to save.

**Small screens:** the split view becomes a stacked panel and lead list; rows transform into labeled cards rather than forcing horizontal scrolling. Stage chips scroll horizontally within their own strip. KPI cards use two columns and then one at very narrow widths. The full workflow stays single-column and long brief/evidence text wraps. All actions remain keyboard and touch accessible.

**System and company impact:** list counts, rows, selected lead details, and activity queries are scoped to the authenticated founder’s workspace and remain subject to RLS. URL filters make handoff between co-founders clearer. Versioned proposals and explicit acceptance prevent the team from confusing an initial budget range with agreed scope or price.

## 6. Clients (reference image 4)

**What founders do:** review the companies and people created through lead conversion, find their primary contact, inspect agreed website project work, and review client notes or logged CRM record changes.

**Layout and content:** the directory follows the reference with four real summaries (total clients, clients with ongoing work, completed projects, and ongoing projects), URL-backed work filters, searchable/sortable rows, ten-row pagination, and a selected-client side panel. Rows show client type, primary contact when recorded, project status/count, agreed project value grouped by currency, and client-record updated date. The side panel has Overview, Projects, Notes, and CRM changes. CRM changes come from the audit log and are labeled as record changes, not client communications. Contact and project details stay scoped to the selected client. A new client can be created directly from the directory or during conversion when the lead does not already have a client link.

**Dialogs and feedback:** the directory offers a direct Add Client form with optional images. Existing clients have an image gallery on the full record page where images can be added or removed. The directory, selected-client panel, and full client title use the newest client image as the avatar, then a linked lead image, then initials. Search, filters, sorting, selected client, panel tab, and pagination are represented in the URL. Project and inquiry links open their existing records. Errors remain visible and name which related data could not be loaded. Direct client/contact field editing, duplicate review, archive, document files, and email actions require later implementation.

**Small screens:** the detail panel stacks above the directory at tablet widths; summary cards become two columns, then one on very narrow screens. Search and sort controls wrap, the filter strip scrolls within itself, and directory rows become labeled cards without whole-page horizontal scrolling.

**System and company impact:** one client record ties multiple jobs and contacts together, improving continuity when either founder handles a conversation.

## 7. Projects and progress payments (reference image 5)

**What founders do:** scan confirmed client projects, see their delivery status and target dates, review accepted scope and linked tasks, attach project images, and inspect payments recorded against the agreement. Project creation follows accepted proposal plus recorded deposit. Project cancellation reasons and signed documents are deferred.

**Layout and content:** the project directory follows the reference with real counts for total, in-progress, completed, and on-hold projects; URL-backed status filters; searchable/sortable rows; ten-row pagination; and a selected-project side panel. Rows show client, start/target dates, agreed amount, and delivery status. The panel has Overview, Tasks, Payments, and CRM changes. The project detail title shows its newest project image, falling back to the linked client image, originating lead image, or initials. Overview shows accepted proposal scope and separates actual payment collection from delivery status; payment progress must never be described as project completion. Payment entries show received date, amount, and reference. Versioned fixed/percentage schedules and due dates require the follow-up migration; the project detail page identifies when that schema is unavailable.

**Dialogs and feedback:** the directory has no modal or mutation. Review leads opens the existing conversion workflow; status changes, task creation, schedule changes, image management, and payment recording stay on the full project/task forms. Completion requires explicit confirmation and is terminal in the UI. Schedule creation/revision preserves earlier versions and requires exact balance reconciliation; the database only permits schedule writes through a workspace-checked transaction. When a schedule is active, a progress payment must be assigned to one of its milestones and stay within its unpaid amount. Payment recording asks for a receipt reference and explicit confirmation, then keeps the entry visible in the ledger and shows a short toast. Corrections/refunds, cancellation reasons, and signed-document uploads need more schema and UI work; payment entries remain insert-only.

**Small screens:** the selected-project panel stacks above the directory at tablet widths; summary cards become two columns, then one on very narrow screens. Filters scroll within their own strip, toolbar controls wrap, and list rows become labeled cards. Project details and payment forms remain single-column; no page-wide horizontal scrolling is required.

**System and company impact:** proposal, delivery, and payment records become linked. This helps founders spot overdue installments and scope changes, while adding a need for careful corrections and auditability. Client payment through the CRM is a later integration and is outside this first release.

## 8. Calendar (reference image 6)

**What founders do:** review lead follow-ups, open task deadlines, and active project target dates in Month, Week, Day, or List views; filter by date type; and open the source lead, task list, or project record.

**Layout and content:** the calendar derives events from existing workspace records. Follow-ups and timed task dates display in Asia/Manila; project target dates are all-day. The month grid includes a selected-day agenda, mini month, and upcoming items. There is no standalone meeting/event table, Google Calendar integration, or stored timezone preference yet, so the page does not invent meeting cards or claim an event was created. Standalone event creation, attendees, and locations need a later schema and workflow design.

**Dialogs and feedback:** the page has no event modal. Add Task opens the existing task form and its save toast; lead follow-ups and project targets are updated through their existing records. Data load errors stay visible. Event create/edit, deletion confirmation, conflict handling, and external calendar sync are future work.

**Small screens:** the calendar grid uses compact date markers and opens a readable agenda; week columns stack as day sections; sidebar summaries stack under the calendar; filters scroll in their own strip and controls wrap. No whole-page horizontal scrolling is required.

**System and company impact:** workspace-scoped queries surface dates already recorded without adding a new data model. Founders can catch overdue follow-ups and approaching delivery dates; standalone meeting scheduling remains outside this first calendar slice.

## 9. Reports (reference image 7)

**What founders do:** inspect inquiry source and current stage mix, sent proposal versions, project status, overdue tasks, agreed project amounts, recorded payments received, and project changes. Choose a custom date range or quick preset and export a CSV.

**Layout and content:** each section defines its date scope. Lead stages are labeled as a current snapshot of inquiries created in the selected period, not a historical conversion rate. Client additions use real client creation dates and are not described as growth in the total active client base. Contracted project value and received cash are separate and grouped by currency; no foreign-exchange assumptions are applied. Scheduled-payment and project-type reporting remain deferred until their fields are available and verified. Empty panels explain when records have not been added; sample revenue and client growth are never shown as fact.

**Dialogs and feedback:** the date range is inline with quick presets. The current aggregate-only CSV export needs no confirmation modal; its button announces progress, completion, or a retryable error. There is no toast for merely changing a filter. Section query errors stay visible and disable export.

**Small screens:** charts stack with text summaries and accessible data tables. Filters remain reachable without occupying the entire viewport. Tables scroll within their own region or transform into readable summaries.

**System and company impact:** aggregation and exports need consistent metric definitions and permission checks. In return, founders can make decisions from actual pipeline and payment data.

## 10. Settings (reference image 8)

**What founders do:** update their profile name and photo, review the current workspace name and administrator role, see the timezone currently used by reports/calendar, and open the existing MFA/security controls. Both co-founders are administrators.

**Layout and content:** account profile uses the signed-in Supabase Auth user name, email, and private profile photo; name and photo are editable, while email and role are read-only. The avatar and account menu show the saved photo or an initial when none is available. Workspace name is read-only because the schema has no company-settings fields. Timezone is displayed as fixed Asia/Manila. The screen links to the existing authenticator and sign-out page. Phone numbers, company-logo uploads, notification preferences, session lists, team management, billing, API keys, and integrations are not displayed as working controls until their data and flows exist.

**Dialogs and feedback:** name and photo changes use one inline Save changes action and a success toast; validation, upload, or save errors remain beside the form. Photo selection previews before saving and can be canceled; removal is staged until Save changes. JPG, PNG, and WebP files up to 2 MB are supported. No confirmation dialog is needed for these reversible profile fields. MFA enrollment and authenticator removal continue in the existing Security screen, including its own confirmation dialog. Password reset remains on the recovery flow.

**Small screens:** profile and access cards reflow from three desktop columns to two tablet columns and one phone column. Profile fields and the save action expand to the available width; no whole-page horizontal scrolling is needed.

**System and company impact:** founders can keep their display name and photo current and see their workspace/security context in one place. The photo is stored in a private, size/type-restricted Supabase Storage bucket; its object path is saved in their own Auth user metadata. Storage policies require AAL2, active administrator membership, and account ownership. Workspace membership and role remain unchanged. MFA controls remain in the existing dedicated security flow.

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
