---
name: strataforge-crm-plan-first
description: Plan or change the StrataForge CRM website with a clear explanation of proposed work, system and company impact, page behavior, security, and responsive UX before implementation. Use for StrataForge CRM feature and design requests.
---

# StrataForge CRM: plan before implementation

The CRM is being built for StrataForge's two co-founders, who are both administrators at launch. StrataForge develops websites for clients and companies. A lead becomes a confirmed project only after proposal acceptance and a recorded deposit. Acceptance can use a signed file or approval message plus a note; payment milestones may be fixed amounts or percentages. The first release tracks progress payments; online payment collection comes later. The CRM starts without imported records. Google and email/password sign-in are both required, with 2FA enforced for either path. Design images are provisional references and may change. The current product plan is at `CRM_IMPLEMENTATION_PLAN.md` and the screen specification is at `CRM_PAGE_BLUEPRINT.md` in the StrataForge CRM workspace; read the relevant sections before planning a feature.

## Working approach

For a requested feature or change, first inspect the current implementation and relevant references. Explain, in plain language:

- what the user will be able to do on each affected page, including loading, empty, validation, error, and permission states;
- which toasts, dialogs, confirmation flows, and notification behavior are needed;
- how the flow works on desktop, tablet, mobile, very small screens, keyboard, and touch;
- what data, roles, permissions, integrations, or operations will change;
- the expected effect on the system and on the co-founders' work, plus risks and how the result will be checked.

Make product assumptions visible, especially when a reference image contains sample numbers, inconsistent states, or UI with no defined behavior. Recommend a restrained visual direction with coherent typography, spacing, semantics, and real content. Do not introduce a decorative AI assistant, fake metrics, or integrations that do not work.

If the user asks for planning only, stop after the concrete, reviewable plan and do not write application code. When implementation is later authorized, use the accepted plan as a guide, explain material changes before making them, and report actual changes and verification afterward. Routine implementation choices may be made without repeated approval unless the user has requested a review point.

Treat client and company data as sensitive. Plan server-enforced access to every object and action, secure sign-in and recovery, safe uploads and exports, auditability, backups, and tests for unauthorized access. Do not claim security from visual design alone. Use current authoritative security and accessibility guidance when those details matter.

For authenticator management, account for lost or compromised devices. Require confirmation before removing a factor, prevent removal of the last verified factor through the application flow, and rely on the identity provider to enforce its own assurance and reauthentication rules. Keep an explicit recovery process for losing every factor; email recovery alone must not bypass 2FA.
