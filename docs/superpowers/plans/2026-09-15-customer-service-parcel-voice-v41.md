# Customer Service Parcel Voice Workflow V41 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a parcel-centric Customer Service workflow where CS can see live parcel status, attach permanent customer voices to each parcel, auto-route actions to the responsible department, track acknowledgement/resolution, escalate formally, and allow routing overrides only to Superadmin.

**Architecture:** Keep operational parcel lifecycle state in existing source tables and expose it to CS through a dedicated parcel-support read model. Store customer-originated requests in focused CS workflow tables, derive routing through one centralized contract, and project assigned work into destination queues/notifications without duplicating parcel state. The existing Customer Service Portal becomes the orchestration UI over this read model and workflow layer.

**Tech Stack:** React 18, TypeScript, Vite, Supabase Postgres, PL/pgSQL RPCs, Supabase Auth/RLS, existing Britium Express role/territory access helpers, existing Vite contract-test scripts.

**Spec:** `docs/superpowers/specs/2026-09-15-customer-service-parcel-voice-v41-design.md`

## Global Constraints

- Delivery Way ID / Waybill is the master Customer Service parcel reference.
- Customer Voice records must remain permanently attached to the correct parcel.
- Routing is automatic by default and must be centralized/testable.
- Only `SUPERADMIN` may override the auto-routed department.
- Non-Superadmin users may escalate but may not reroute directly.
- Existing branch/territory access rules must not be widened.
- Live parcel status must be projected from existing operational sources, not copied into an independent CS lifecycle table.
- Existing Pickup Request authority, V36.1 lifecycle projection, Data Entry, Warehouse, Rider, Finance, Wayplan, and Waybill flows must remain functional.
- Customer Voice creation and initial routing must be atomic.
- No customer voice may be silently dropped if downstream notification delivery fails.
- All important workflow state transitions and overrides must be audited.

---

## File Structure

Planned additions and modifications:

- Create `britium-go-live/supabase/migrations/20260915xxxxxx_customer_service_parcel_voice_v41.sql`
  - Owns new CS workflow tables, indexes, policies, helper functions, read-model RPCs, routing RPCs, transition RPCs, audit/notification persistence.
- Create `britium-go-live/src/customerService/customerVoiceTypes.ts`
  - Shared TypeScript types for parcel support rows, customer voices, actions, notifications, workflow states, and departments.
- Create `britium-go-live/src/customerService/customerVoiceRouting.ts`
  - Frontend mirror/display helpers for centralized routing labels and department presentation; backend remains source of truth.
- Create `britium-go-live/src/customerService/customerVoiceApi.ts`
  - Focused RPC client wrappers used by the portal.
- Modify `britium-go-live/src/pages/CustomerServicePortalPage.tsx`
  - Replace pickup/ticket-oriented queue with parcel-centric support table, parcel detail panel, Customer Voice composer, timeline, action history, escalation, and Superadmin override control.
- Create `britium-go-live/scripts/verify-customer-service-parcel-voice-v41.mjs`
  - Static/build contract covering required RPC/table/UI markers and authority rules.
- Modify `britium-go-live/package.json`
  - Add `verify:customer-service-parcel-voice-v41`; include it in production build after migration/code implementation is ready.

---

### Task 1: Add the failing V41 contract

**Files:**
- Create: `britium-go-live/scripts/verify-customer-service-parcel-voice-v41.mjs`
- Modify: `britium-go-live/package.json`

**Interfaces:**
- Consumes: current `CustomerServicePortalPage.tsx`, migration tree, package scripts.
- Produces: `npm run verify:customer-service-parcel-voice-v41`.

- [ ] **Step 1: Write the failing contract**

Create a script that loads the V41 migration and CS portal source and asserts all of these markers exist:

```js
const migrationChecks = [
  'be_customer_voices',
  'be_customer_voice_actions',
  'be_customer_voice_escalations',
  'be_customer_voice_notifications',
  'be_cs_parcel_support_queue',
  'be_cs_create_customer_voice',
  'be_cs_acknowledge_customer_voice',
  'be_cs_resolve_customer_voice',
  'be_cs_escalate_customer_voice',
  'be_cs_superadmin_override_route',
  'SUPERADMIN_OVERRIDE_REQUIRED',
];

const pageChecks = [
  'Open Voices',
  'Customer Voices',
  'Status Timeline',
  'Escalate',
  'Superadmin Override',
];
```

The script must exit non-zero and print each missing contract item.

- [ ] **Step 2: Add the package script without wiring it into `build` yet**

Add:

```json
"verify:customer-service-parcel-voice-v41": "node scripts/verify-customer-service-parcel-voice-v41.mjs"
```

Do not change the production `build` script at this stage.

- [ ] **Step 3: Run the contract and confirm RED**

Run:

```bash
npm run verify:customer-service-parcel-voice-v41
```

Expected: FAIL listing missing migration/RPC/UI markers.

- [ ] **Step 4: Commit**

```bash
git add britium-go-live/scripts/verify-customer-service-parcel-voice-v41.mjs britium-go-live/package.json
git commit -m "test: add failing V41 customer service parcel voice contract"
```

---

### Task 2: Create the parcel-centric Customer Service schema and read model

**Files:**
- Create: `britium-go-live/supabase/migrations/20260915xxxxxx_customer_service_parcel_voice_v41.sql`

**Interfaces:**
- Consumes: existing role helpers such as `be_current_user_role`, branch/territory access helpers, parcel detail/lifecycle tables, warehouse/operations/waybill/finance/rider sources.
- Produces:
  - tables `be_customer_voices`, `be_customer_voice_actions`, `be_customer_voice_escalations`, `be_customer_voice_notifications`;
  - RPC `be_cs_parcel_support_queue(p_limit integer default 300, p_search text default null) returns jsonb`.

- [ ] **Step 1: Add failing SQL-shape assertions to the V41 contract**

Require exact table names, key columns, and `be_cs_parcel_support_queue`.

- [ ] **Step 2: Define the four workflow tables**

Use UUID primary keys and foreign-key references by Customer Voice id. `be_customer_voices` must include at minimum:

```sql
id uuid primary key default gen_random_uuid(),
delivery_way_id text not null,
pickup_id text,
customer_name text,
customer_phone text,
source_channel text not null,
issue_type text not null,
priority text not null default 'medium',
customer_voice_text text not null,
auto_routed_department text not null,
current_department text not null,
workflow_status text not null default 'OPEN',
resolution_status text,
due_at timestamptz,
created_by uuid not null default auth.uid(),
created_at timestamptz not null default now(),
closed_at timestamptz,
idempotency_key text
```

Add unique protection for a non-null `idempotency_key` scoped to creator where appropriate.

- [ ] **Step 3: Add indexes for operational lookups**

At minimum:

```sql
create index ... on be_customer_voices(delivery_way_id, created_at desc);
create index ... on be_customer_voices(current_department, workflow_status, created_at desc);
create index ... on be_customer_voice_actions(customer_voice_id, created_at);
create index ... on be_customer_voice_notifications(customer_voice_id, status, created_at);
```

- [ ] **Step 4: Add RLS/policies or guarded SECURITY DEFINER access**

Rules must enforce:

- authenticated user required;
- CS reads only parcels allowed by existing territory/branch access;
- receiving departments read/update only routed cases they are entitled to process;
- Superadmin alone can perform route override;
- no anonymous access.

- [ ] **Step 5: Implement `be_cs_parcel_support_queue`**

The RPC must start from parcel-level operational records, not pickup requests, and left-join/project the latest relevant warehouse, operations, waybill, rider, finance, and open Customer Voice state.

Return JSON shape:

```json
{
  "ok": true,
  "summary": {
    "total_records": 0,
    "open_voices": 0,
    "escalated": 0,
    "urgent": 0
  },
  "rows": []
}
```

Each row must include `delivery_way_id`, `pickup_id`, recipient/contact/location fields, live lifecycle fields, assignment fields, finance/COD fields, `open_voice_count`, `current_owner_department`, `latest_customer_voice`, `latest_internal_action`, `escalation_flag`, and `sla_due_at` when available.

- [ ] **Step 6: Run SQL lint/contract checks available in the repo**

Run the V41 verifier and any existing migration consistency checks used by the project.

Expected: table/read-model checks PASS; later workflow/UI checks still FAIL.

- [ ] **Step 7: Commit**

```bash
git add britium-go-live/supabase/migrations/20260915xxxxxx_customer_service_parcel_voice_v41.sql britium-go-live/scripts/verify-customer-service-parcel-voice-v41.mjs
git commit -m "feat: add V41 parcel-centric customer service read model"
```

---

### Task 3: Implement centralized routing and atomic Customer Voice creation

**Files:**
- Modify: `britium-go-live/supabase/migrations/20260915xxxxxx_customer_service_parcel_voice_v41.sql`
- Create: `britium-go-live/src/customerService/customerVoiceTypes.ts`
- Create: `britium-go-live/src/customerService/customerVoiceRouting.ts`

**Interfaces:**
- Produces backend helper/RPCs:
  - `be_cs_route_department(p_issue_type text, p_parcel_status text, p_context jsonb default '{}'::jsonb) returns text`;
  - `be_cs_create_customer_voice(p_payload jsonb) returns jsonb`.
- Produces TypeScript enums/unions matching backend values.

- [ ] **Step 1: Extend the contract with routing assertions**

The verifier must require the configured issue types and destination departments.

- [ ] **Step 2: Implement backend routing helper**

Map:

```text
REDELIVERY -> operations
RIDER_ISSUE -> operations
ADDRESS_CORRECTION -> data_entry
LOCATION_CORRECTION -> data_entry
PARCEL_MISSING -> warehouse
WAREHOUSE_ISSUE -> warehouse
COD_ISSUE -> finance
PAYMENT_ISSUE -> finance
PICKUP_ISSUE -> pickup_supervisor
OTHER -> operations
```

`INQUIRY`, `REQUEST`, and `COMPLAINT` should use context where available, otherwise fall back to `operations`.

- [ ] **Step 3: Implement `be_cs_create_customer_voice` atomically**

The RPC must:

1. authenticate caller;
2. validate the parcel exists and caller may read it;
3. reject empty customer text;
4. derive route through `be_cs_route_department`;
5. insert `be_customer_voices`;
6. insert initial action event `CREATED`;
7. insert initial notification row `QUEUED`;
8. insert audit event;
9. return voice id, route, workflow status, and notification status;
10. rollback all inserts if core creation fails.

If notification transport later fails, preserve the voice and mark notification state as failed/recoverable rather than deleting the voice.

- [ ] **Step 4: Add TypeScript domain types**

Define exact unions:

```ts
export type CustomerVoiceIssueType =
  | 'INQUIRY' | 'REQUEST' | 'COMPLAINT' | 'REDELIVERY'
  | 'ADDRESS_CORRECTION' | 'LOCATION_CORRECTION' | 'COD_ISSUE'
  | 'PAYMENT_ISSUE' | 'PARCEL_MISSING' | 'WAREHOUSE_ISSUE'
  | 'RIDER_ISSUE' | 'PICKUP_ISSUE' | 'OTHER';

export type CustomerVoiceWorkflowStatus =
  | 'OPEN' | 'ROUTED' | 'SEEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS'
  | 'ACTION_TAKEN' | 'RESOLVED' | 'CS_CONFIRMED' | 'CLOSED'
  | 'ESCALATED' | 'REOPENED';
```

Add matching department/source-channel/priority types and support-row interfaces.

- [ ] **Step 5: Add frontend routing label helpers**

Frontend helpers may format department labels/icons only; they must not make authoritative routing decisions.

- [ ] **Step 6: Run the V41 verifier**

Expected: schema/routing/create-voice checks PASS; transition/UI checks still FAIL.

- [ ] **Step 7: Commit**

```bash
git add britium-go-live/supabase/migrations/20260915xxxxxx_customer_service_parcel_voice_v41.sql britium-go-live/src/customerService/customerVoiceTypes.ts britium-go-live/src/customerService/customerVoiceRouting.ts britium-go-live/scripts/verify-customer-service-parcel-voice-v41.mjs
git commit -m "feat: add automatic Customer Voice routing and creation"
```

---

### Task 4: Add acknowledgement, action, resolution, escalation, reopen, and Superadmin override transitions

**Files:**
- Modify: `britium-go-live/supabase/migrations/20260915xxxxxx_customer_service_parcel_voice_v41.sql`

**Interfaces:**
- Produces:
  - `be_cs_mark_customer_voice_seen(p_voice_id uuid)`;
  - `be_cs_acknowledge_customer_voice(p_voice_id uuid, p_note text default null)`;
  - `be_cs_update_customer_voice_action(p_voice_id uuid, p_action_note text, p_status text)`;
  - `be_cs_resolve_customer_voice(p_voice_id uuid, p_resolution_note text)`;
  - `be_cs_confirm_customer_voice(p_voice_id uuid, p_note text default null)`;
  - `be_cs_close_customer_voice(p_voice_id uuid, p_note text default null)`;
  - `be_cs_escalate_customer_voice(p_voice_id uuid, p_reason text, p_requested_department text default null)`;
  - `be_cs_reopen_customer_voice(p_voice_id uuid, p_reason text)`;
  - `be_cs_superadmin_override_route(p_voice_id uuid, p_new_department text, p_reason text)`.

- [ ] **Step 1: Extend contract with state-transition and authority markers**

Require all RPC names and explicit Superadmin enforcement marker.

- [ ] **Step 2: Implement receiving-channel transitions**

Every transition must:

- verify current actor is authorized for the case/department;
- validate allowed prior state;
- append an action row;
- update `be_customer_voices.workflow_status`;
- advance relevant notification state;
- append audit event.

- [ ] **Step 3: Implement escalation without ownership change**

`be_cs_escalate_customer_voice` inserts an escalation and sets workflow state `ESCALATED`, but must not change `current_department`.

- [ ] **Step 4: Implement Superadmin-only override**

The override RPC must:

- normalize current role;
- reject non-Superadmin callers with `SUPERADMIN_OVERRIDE_REQUIRED`;
- require non-empty reason;
- persist old department and new department;
- update `current_department`;
- append override action/audit;
- create a new destination notification;
- preserve previous route history.

- [ ] **Step 5: Implement reopen**

Reopen must preserve old resolution history, append a `REOPENED` action, and create a new notification for the existing current department unless Superadmin later overrides.

- [ ] **Step 6: Run V41 verifier**

Expected: backend workflow contract PASS; UI markers remain failing.

- [ ] **Step 7: Commit**

```bash
git add britium-go-live/supabase/migrations/20260915xxxxxx_customer_service_parcel_voice_v41.sql britium-go-live/scripts/verify-customer-service-parcel-voice-v41.mjs
git commit -m "feat: add V41 Customer Voice workflow transitions"
```

---

### Task 5: Add focused frontend API wrappers

**Files:**
- Create: `britium-go-live/src/customerService/customerVoiceApi.ts`
- Modify: `britium-go-live/src/customerService/customerVoiceTypes.ts`

**Interfaces:**
- Consumes: Supabase client and RPCs from Tasks 2–4.
- Produces functions:
  - `loadCustomerServiceParcels(search?: string): Promise<CustomerServiceParcelQueue>`;
  - `createCustomerVoice(input: CreateCustomerVoiceInput)`;
  - `acknowledgeCustomerVoice(voiceId: string, note?: string)`;
  - `updateCustomerVoiceAction(voiceId: string, note: string, status: CustomerVoiceWorkflowStatus)`;
  - `resolveCustomerVoice(voiceId: string, note: string)`;
  - `confirmCustomerVoice(voiceId: string, note?: string)`;
  - `closeCustomerVoice(voiceId: string, note?: string)`;
  - `escalateCustomerVoice(voiceId: string, reason: string, requestedDepartment?: CustomerVoiceDepartment)`;
  - `reopenCustomerVoice(voiceId: string, reason: string)`;
  - `superadminOverrideCustomerVoiceRoute(voiceId: string, department: CustomerVoiceDepartment, reason: string)`.

- [ ] **Step 1: Add wrapper signatures to static contract**

The verifier must require the exported wrapper names.

- [ ] **Step 2: Implement `loadCustomerServiceParcels`**

Call `be_cs_parcel_support_queue` and validate `ok === true`; normalize missing arrays/summary fields.

- [ ] **Step 3: Implement mutation wrappers**

Each wrapper must throw the backend error/message rather than returning ambiguous false values.

- [ ] **Step 4: Add shared input/result types**

Ensure UI code does not use `any` for Customer Voice workflow payloads.

- [ ] **Step 5: Run TypeScript/Vite build**

Run:

```bash
npm run build
```

Expected: PASS with existing chunk-size warnings only.

- [ ] **Step 6: Commit**

```bash
git add britium-go-live/src/customerService/customerVoiceApi.ts britium-go-live/src/customerService/customerVoiceTypes.ts britium-go-live/scripts/verify-customer-service-parcel-voice-v41.mjs
git commit -m "feat: add Customer Voice API client"
```

---

### Task 6: Convert Customer Service Portal to the parcel-centric support board

**Files:**
- Modify: `britium-go-live/src/pages/CustomerServicePortalPage.tsx`

**Interfaces:**
- Consumes: `customerVoiceApi.ts`, `customerVoiceTypes.ts`, existing authenticated role/profile context if available.
- Produces: parcel table + parcel detail panel + Customer Voice composer.

- [ ] **Step 1: Extend the contract with portal markers**

Require visible labels:

```text
Open Voices
Current Owner
Latest Customer Voice
Status Timeline
Customer Voices
Internal Action History
Add Customer Voice
```

- [ ] **Step 2: Replace data load with `loadCustomerServiceParcels`**

Remove dependency on `be_enterprise_control_tower` for the main parcel queue.

- [ ] **Step 3: Update summary cards**

Use:

- Total Parcels;
- Open Voices;
- Escalated;
- Urgent.

- [ ] **Step 4: Update the main table columns**

Show parcel-centric fields from the spec, including open voices and current owner department.

- [ ] **Step 5: Add parcel detail panel**

Sections:

1. Parcel Summary;
2. Status Timeline;
3. Customer Voices;
4. Internal Action History;
5. Add Customer Voice.

Opening a row must never lose the currently loaded queue state.

- [ ] **Step 6: Add Customer Voice composer**

Fields:

- source channel;
- issue type;
- priority;
- customer voice text;
- optional due/callback datetime.

Submit through `createCustomerVoice`. Display the backend-selected department after success and refresh only affected queue/detail state where practical.

- [ ] **Step 7: Run V41 verifier and Vite build**

Expected: main portal UI contract PASS; escalation/override controls may remain pending until Task 7.

- [ ] **Step 8: Commit**

```bash
git add britium-go-live/src/pages/CustomerServicePortalPage.tsx britium-go-live/scripts/verify-customer-service-parcel-voice-v41.mjs
git commit -m "feat: make Customer Service parcel-centric"
```

---

### Task 7: Add formal action, escalation, and Superadmin override controls

**Files:**
- Modify: `britium-go-live/src/pages/CustomerServicePortalPage.tsx`

**Interfaces:**
- Consumes: workflow mutation wrappers and signed-in role/profile.
- Produces: authorized action controls with role-aware visibility.

- [ ] **Step 1: Add receiving-workflow controls**

For authorized destination users show:

- Mark Seen;
- Acknowledge;
- Start/In Progress;
- Action Taken;
- Resolve.

Require action note for state-changing operations where the backend expects one.

- [ ] **Step 2: Add CS confirmation/closure controls**

CS can confirm customer communication after operational resolution and close the voice.

- [ ] **Step 3: Add escalation control for ordinary authorized users**

Escalation form fields:

- reason (required);
- optional requested department.

After submission, show that ownership is unchanged until Superadmin acts.

- [ ] **Step 4: Add Superadmin-only override UI**

Display only when normalized role is Superadmin. Require:

- new department;
- override reason;
- explicit confirmation.

Do not render an enabled reroute control for ordinary users.

- [ ] **Step 5: Add reopen control for closed/resolved voices**

Require reopen reason.

- [ ] **Step 6: Run V41 contract**

Expected: all static workflow/authority/UI markers PASS.

- [ ] **Step 7: Run Vite build**

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add britium-go-live/src/pages/CustomerServicePortalPage.tsx britium-go-live/scripts/verify-customer-service-parcel-voice-v41.mjs
git commit -m "feat: add Customer Voice workflow controls"
```

---

### Task 8: Add explicit backend regression contract for authority and routing

**Files:**
- Create: `britium-go-live/scripts/verify-customer-service-routing-v41.mjs`
- Modify: `britium-go-live/package.json`

**Interfaces:**
- Consumes: final V41 migration.
- Produces: static regression check for role/routing invariants.

- [ ] **Step 1: Add routing matrix assertions**

Verify every configured issue type appears in the migration and maps to the required destination/fallback.

- [ ] **Step 2: Add authority assertions**

Require evidence that:

- escalation does not update `current_department`;
- Superadmin override checks normalized role;
- override requires reason;
- prior route is preserved;
- new notification is created.

- [ ] **Step 3: Add package script**

```json
"verify:customer-service-routing-v41": "node scripts/verify-customer-service-routing-v41.mjs"
```

- [ ] **Step 4: Run both V41 contract scripts**

Run:

```bash
npm run verify:customer-service-parcel-voice-v41
npm run verify:customer-service-routing-v41
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add britium-go-live/scripts/verify-customer-service-routing-v41.mjs britium-go-live/package.json
git commit -m "test: lock V41 routing and authority contract"
```

---

### Task 9: Wire V41 verification into production build

**Files:**
- Modify: `britium-go-live/package.json`

**Interfaces:**
- Consumes: both V41 verifier scripts.
- Produces: production build cannot succeed if V41 contract regresses.

- [ ] **Step 1: Update build script**

Prepend both V41 verification scripts before `vite build`, preserving all existing build-time checks/transforms.

Example shape:

```json
"build": "...existing checks... && npm run verify:customer-service-parcel-voice-v41 && npm run verify:customer-service-routing-v41 && vite build"
```

Do not remove existing V40 verification or source-transform steps.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: both V41 verifiers PASS and Vite build PASS.

- [ ] **Step 3: Commit**

```bash
git add britium-go-live/package.json
git commit -m "build: enforce V41 customer service contracts"
```

---

### Task 10: Apply migration to a non-production environment and run workflow UAT

**Files:**
- No new source files required unless test fixes are discovered.

**Interfaces:**
- Consumes: V41 migration and branch build.
- Produces: verified preview/UAT evidence before Production.

- [ ] **Step 1: Apply V41 migration to preview/staging Supabase**

Confirm migration completes without altering unrelated parcel/business data.

- [ ] **Step 2: Run parcel visibility UAT**

Verify CS can see parcels in multiple statuses and cannot read unauthorized territory data.

- [ ] **Step 3: Run Customer Voice creation UAT**

Create one test case for each main route family:

- delivery/rider -> Operations;
- address/location -> Data Entry;
- parcel missing -> Warehouse;
- COD -> Finance;
- pickup -> Pickup/Supervisor.

- [ ] **Step 4: Run receiving-channel transition UAT**

Confirm Seen -> Acknowledged -> In Progress -> Resolved is reflected back in CS.

- [ ] **Step 5: Run escalation authority UAT**

Confirm ordinary user can escalate but cannot reroute.

- [ ] **Step 6: Run Superadmin override UAT**

Confirm Superadmin can override only with reason and prior route remains in audit history.

- [ ] **Step 7: Run repeat/reopen UAT**

Confirm multiple voices coexist on one parcel and closed voice can be reopened without losing old history.

- [ ] **Step 8: Verify preview deployment**

Require:

- V41 contract PASS;
- Vite build PASS;
- preview deployment READY;
- authenticated portal loads successfully;
- no new runtime error cluster.

- [ ] **Step 9: Commit any UAT-only contract fixes if needed**

Commit only if source changes were required; otherwise leave source untouched.

---

### Task 11: Production migration and deployment

**Files:**
- Uses the already-reviewed migration/code.

**Interfaces:**
- Produces: V41 live in Production.

- [ ] **Step 1: Rebase/compare branch against current `main`**

Expected: no unrelated divergence; resolve before merge if main advanced.

- [ ] **Step 2: Open production PR**

PR body must state:

- parcel-centric CS read model;
- new Customer Voice workflow tables;
- auto-routing rules;
- Superadmin-only override;
- escalation behavior;
- migration filename;
- verifier results;
- preview deployment evidence.

- [ ] **Step 3: Verify PR status/checks**

Require Vercel success and mergeability true.

- [ ] **Step 4: Merge to `main`**

Record merged commit SHA.

- [ ] **Step 5: Apply the reviewed V41 migration to Production Supabase**

Apply exactly the migration reviewed in the PR; do not edit it live.

- [ ] **Step 6: Verify Production Vercel deployment**

Require exact merged SHA, V41 verifiers PASS, Vite build PASS, deployment READY.

- [ ] **Step 7: Verify live domain**

Confirm `www.britiumexpress.com` returns HTTP 200 and serves the new production asset set.

- [ ] **Step 8: Run targeted production smoke test**

Using a controlled parcel/test account, verify:

- parcel queue visible;
- Customer Voice creation succeeds;
- expected department route created;
- non-Superadmin reroute blocked;
- acknowledgement/resolution visible back in CS.

- [ ] **Step 9: Check runtime errors**

Confirm no new fatal/error cluster on the production deployment.

---

## Self-Review

### Spec coverage

- Parcel-centric read model: Tasks 2 and 6.
- Permanent parcel-linked Customer Voices: Tasks 2 and 3.
- Automatic routing: Task 3.
- Receiving department acknowledgement/action/resolution: Task 4 and Task 7.
- Formal escalation: Task 4 and Task 7.
- Superadmin-only override: Task 4 and Task 7.
- Notifications: Tasks 2–4.
- Audit trail: Tasks 2–4.
- Customer Service follow-up/closure/reopen: Tasks 4 and 7.
- RLS/territory controls: Task 2 and Task 10.
- Regression protection: Tasks 1, 8, 9, 10, 11.
- SLA/analytics: schema/read-model fields are prepared in Tasks 2/6; advanced analytics remain a later Phase 3 enhancement and do not block operational V41 core.

### Placeholder scan

No `TBD`, `TODO`, or unspecified implementation steps are intentionally left in the plan. The migration timestamp uses `20260915xxxxxx` only because the executor must choose the next unused chronological migration timestamp at implementation time; the file responsibility and exact content contract are otherwise fixed.

### Type consistency

The issue-type, workflow-status, department, API-wrapper, and RPC names are consistent throughout the plan and should be treated as stable interfaces during implementation.
