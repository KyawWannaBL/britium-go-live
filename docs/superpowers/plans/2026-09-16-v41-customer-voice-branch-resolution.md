# V41 Customer Voice Branch Resolution Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore real-parcel Customer Voice creation and the parcel support queue without weakening Customer Service territorial access controls.

**Architecture:** Add one V41-specific parcel-to-branch resolver that prefers the parcel's normalized `delivery_region`, falls back to existing location parsing, and keeps `OUTSIDE_CORE` under YGN/head-office scope. Reuse that resolver in both `be_cs_create_customer_voice` and `be_cs_parcel_support_queue` so queue visibility and write authorization use identical territory logic.

**Tech Stack:** PostgreSQL / PL/pgSQL, Supabase migrations, Node.js static verification scripts.

**Spec:** `britium-go-live/supabase/migrations/20260915171600_customer_service_parcel_voice_v41.sql` and `britium-go-live/supabase/migrations/20260915173000_customer_service_parcel_voice_v41_routing.sql`

## Global Constraints

- Do not add or backfill a `branch_code` column to parcel data for this hotfix.
- Preserve existing RLS and `be_employee_can_access_territory` / `be_customer_service_can_manage_pickup_request` checks.
- Map `YANGON -> YGN`, `MANDALAY -> MDY`, `NAYPYITAW -> NPT`, and `OUTSIDE_CORE -> YGN` for Customer Service territory ownership.
- Fall back to `be_resolve_branch_from_location` for older rows where `delivery_region` is absent.
- Keep the change additive through a new migration; do not rewrite already-applied V41 migration history.
- All Production UAT writes must run inside explicit rollback transactions until the migration is formally applied.

---

### Task 1: Add a regression contract for parcel branch resolution

**Files:**
- Modify: `britium-go-live/scripts/verify-customer-service-parcel-voice-v41.mjs`

**Interfaces:**
- Consumes: V41 migration SQL files.
- Produces: build-time assertions that the migration set contains `be_cs_resolve_parcel_branch`, normalized `delivery_region` mappings, and both queue/create RPC usages.

- [ ] **Step 1: Add migration markers**

Require these strings in the V41 migration source: `be_cs_resolve_parcel_branch`, `delivery_region`, `YANGON`, `MANDALAY`, `NAYPYITAW`, `OUTSIDE_CORE`, and at least two uses of `be_cs_resolve_parcel_branch`.

- [ ] **Step 2: Verify RED against current Production behavior**

Run a rollback-only authenticated call to `be_cs_create_customer_voice` for a YGN-scoped Customer Service account and real parcel `D0822-GGS-111`.

Expected before hotfix: `PARCEL_ACCESS_DENIED`.

---

### Task 2: Implement one canonical V41 parcel branch resolver

**Files:**
- Create: `britium-go-live/supabase/migrations/20260916163000_customer_service_parcel_voice_v41_branch_resolution_hotfix.sql`

**Interfaces:**
- Produces: `public.be_cs_resolve_parcel_branch(jsonb) returns text`.
- Consumed by: `be_cs_parcel_support_queue`, `be_cs_create_customer_voice`.

- [ ] **Step 1: Implement normalized-region-first resolution**

Use `branch_code` if present and valid; otherwise map normalized `delivery_region`: `YANGON -> YGN`, `MANDALAY -> MDY`, `NAYPYITAW -> NPT`, `OUTSIDE_CORE -> YGN`.

- [ ] **Step 2: Implement location fallback**

For rows without `delivery_region`, call `be_resolve_branch_from_location` with `city`, township, and a combined address containing `recipient_address`, `region_state`, and `destination`; default to `YGN` to retain current head-office handling for non-core rows.

- [ ] **Step 3: Recreate the parcel support queue RPC**

Replace direct reads of `parcel_json->>'branch_code'` in both territory helper calls with `be_cs_resolve_parcel_branch(parcel_json)`. Return the resolved branch in the row JSON as `branch_code` so the UI sees the same authorization branch.

- [ ] **Step 4: Recreate the Customer Voice creation RPC**

Set `v_branch := be_cs_resolve_parcel_branch(v_parcel)` before existing territory checks. Do not change role lists, issue routing, transition rules, or audit behavior.

---

### Task 3: Verify and publish

**Files:**
- Test: Production Supabase via rollback transaction before apply.
- Publish: the migration and verification-script update.

**Interfaces:**
- Consumes: YGN/MDY/NPT Customer Service identities and real parcels.
- Produces: verified V41 Production sign-off evidence.

- [ ] **Step 1: GREEN-test in one rollback transaction**

Temporarily install the new function definitions inside `BEGIN`; verify YGN, MDY, and NPT Customer Service accounts can see/create against parcels in their own resolved branch; verify the full lifecycle `Create -> Acknowledge -> In Progress -> Resolve -> Confirm -> Close`, escalation ownership preservation, and Super Admin override; then `ROLLBACK`.

- [ ] **Step 2: Apply the migration to Production**

Apply `customer_service_parcel_voice_v41_branch_resolution_hotfix` through the Supabase migration API.

- [ ] **Step 3: Publish source to main and verify deployment**

Merge/publish the tested hotfix, then verify the exact commit is on `main`, Vercel Production is READY, and the V41 static build verification passes.

- [ ] **Step 4: Fresh Production verification**

Rerun real-parcel creation and queue checks after migration application, plus a rollback-only lifecycle test. Sign off only when all requested checks pass.
