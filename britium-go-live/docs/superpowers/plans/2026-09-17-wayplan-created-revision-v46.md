# CREATED Wayplan Revision V46 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an authenticated Wayplan operator to add/remove filtered READY ways from a generated `CREATED` Wayplan, re-optimize from Britium Ventures Head Office, review crew assignments, and save a replacement Wayplan before dispatch while preserving the original route/LIFO audit history.

**Architecture:** Never mutate immutable generated route history in place. The UI loads a selected `CREATED` Wayplan into revision mode, combines its current stops with operator-selected eligible READY ways, removes explicitly deselected stops, re-runs the existing Google road optimizer and crew planner, then calls a new transactional RPC. The RPC validates the original is still `CREATED`, releases the original parcel ledger/membership, creates a new Wayplan through existing generation paths, records an `OPERATOR_RECALCULATION` route version, links replacement/original metadata, cancels the original, and keeps dispatched/non-CREATED Wayplans locked.

**Tech Stack:** React + TypeScript, Supabase/Postgres PL/pgSQL, existing `MultiVanPlanner`, Google Routes endpoint, Vercel/Vite regression scripts.

**Spec:** User-approved workflow: Generated Wayplan → Edit Ways → Add/Remove → Re-optimize Route → Review Crew → Save Revised Wayplan → Dispatch.

## Global Constraints

- Editing is allowed only while the source Wayplan status is `CREATED` / equivalent undispatched draft status.
- Never modify or delete prior route-version or warehouse-loading snapshot history.
- Revised routing starts from configured Yangon Head Office / Britium Ventures origin (`16.8409, 96.1735`) and must use the existing authenticated road-routing endpoint.
- Preserve V37 overlap, V43 multi-trip/wave, V44 50–75 load controls, V45 filtered selection/crew assignment.
- No automatic dispatch. Revised Wayplans remain `CREATED` until operator dispatches separately.
- Added ways must be currently eligible in the regional dispatch-ready queue; removed ways return to READY/unassigned state.
- Revision must be transactional and auditable.

---

### Task 1: V46 regression contract

**Files:**
- Create: `scripts/verify-wayplan-created-revision-v46.mjs`
- Modify: `scripts/verify-wayplan-queue-filter-ui.mjs`

**Interfaces:**
- Consumes: `WayplanCommandCenterPage.tsx`, migration SQL file.
- Produces: build-time contract proving CREATED-only edit controls, add/remove selection, replacement RPC wiring, and dispatch lock copy.

- [ ] **Step 1: Write the failing V46 contract** checking for `Edit CREATED Wayplan`, `Add Selected`, `Remove Selected`, `Re-optimize & Save Revision`, `be_replace_created_wayplan_v46`, and explicit CREATED-only gating.
- [ ] **Step 2: Run build and verify RED** because those markers/functions do not exist yet.
- [ ] **Step 3: Keep V37/V43/V44/V45 imports in the same verification chain.**

### Task 2: Transactional replacement RPC

**Files:**
- Create: `supabase/migrations/20260917193000_wayplan_created_revision_v46.sql`

**Interfaces:**
- Produces: `public.be_replace_created_wayplan_v46(p_payload jsonb) returns jsonb`.
- Payload contains: `source_wayplan_id`, `request_id`, `region_code`, `plan` (one reviewed road plan with delivery IDs, vehicle/crew, route metadata), and optional below-minimum approval fields.

- [ ] **Step 1: Validate auth, stable request id, source status and no dispatch/warehouse handoff.**
- [ ] **Step 2: Lock the source Wayplan and selected parcel rows transactionally.**
- [ ] **Step 3: Validate every retained/added parcel is canonical, financially valid, location accepted, and belongs to the same active region.**
- [ ] **Step 4: Release source membership/ledger for all old stops, preserving route-version and loading-snapshot tables unchanged.**
- [ ] **Step 5: Generate replacement through existing `be_generate_wayplan` / crew validation path, restore reviewed stop order, update crew and totals, save `OPERATOR_RECALCULATION` route version and fresh active LIFO metadata.**
- [ ] **Step 6: Cancel source Wayplan and memberships only after replacement succeeds, link both records with `replaces_wayplan_id` / `replaced_by_wayplan_id`, audit actor/reason, and return replacement ID.**
- [ ] **Step 7: Ensure any exception rolls back all release/reassignment work.**

### Task 3: CREATED Wayplan editor UI

**Files:**
- Modify: `src/pages/WayplanCommandCenterPage.tsx`
- Modify: `src/components/MultiVanPlanner.tsx` only if revision save hook is required.

**Interfaces:**
- Consumes: existing filtered queue, generated Wayplan stops, `MultiVanPlanner`, V46 RPC.
- Produces: operator flow to edit only a selected CREATED Wayplan.

- [ ] **Step 1: Add `Edit CREATED Wayplan` action next to Generated Wayplans and hide/disable it for non-CREATED statuses.**
- [ ] **Step 2: Load current Wayplan stops into revision selection and show current/addable filtered rows with `Add Selected`, `Remove Selected`, `Select All Filtered`, and counts.**
- [ ] **Step 3: Feed revised selected rows into the existing planner so Google road optimization and Driver/Rider/Helper assignment are reused.**
- [ ] **Step 4: Add `Re-optimize & Save Revision` action that calls V46 only after road-reviewed route, crew, 50–75 rules and below-minimum approval pass.**
- [ ] **Step 5: On success refresh queue/Wayplans, select replacement, show source→replacement message, and keep both undispatched until operator dispatches the replacement separately.**

### Task 4: Verification and Production promotion

**Files:** no new production files beyond Tasks 1–3.

- [ ] **Step 1: Run full Vercel preview build and require V37/V43/V44/V45/V46 PASS.**
- [ ] **Step 2: Review branch diff for unrelated changes.**
- [ ] **Step 3: Apply V46 migration to Production Supabase.**
- [ ] **Step 4: Open/merge PR to `main`.**
- [ ] **Step 5: Wait for exact main commit Production deployment to become READY.**
- [ ] **Step 6: Verify live Google Routes probe and recent runtime errors.**
- [ ] **Step 7: Verify V46 function exists and no unintended Wayplans were created during deployment.**
