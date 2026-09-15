# Data Entry Performance + Bulk Pending Clarification V40 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Data Entry page responsive for 300–500 row imports and add an audited `SKIP PENDING CLARIFICATION FOR ALL` bulk action that affects only unsaved rows that genuinely require clarification.

**Architecture:** Keep the existing paginated Data Entry UI and existing `be_data_entry_pending_drafts` persistence model. Replace per-row background location state churn with batch patching/yielding, and persist bulk pending-clarification skips through one Supabase upsert followed by one React state transition. Existing Calculate All / Save All semantics remain unchanged because skipped rows are already excluded.

**Tech Stack:** React 18, TypeScript, Supabase JS, Vite, Node contract scripts.

**Spec:** User request in current production incident: recurring Chrome `Page Unresponsive` on `#/data-entry` plus a `SKIP PENDING CLARIFICATION FOR ALL` action.

## Global Constraints

- Preserve current V39 production behavior and current Data Entry pagination.
- Do not skip saved rows, rows already skipped, or rows that are merely waiting for photo approval/location review but otherwise have complete customer data.
- Bulk skip must persist to `be_data_entry_pending_drafts` and remain resumable.
- Calculate All / Save All must continue excluding skipped rows.
- Location validation must continue using the current resolver and audit path; only UI update frequency changes.
- No schema migration is required for this hotfix.

---

### Task 1: Add a failing source contract for the hotfix

**Files:**
- Create: `britium-go-live/scripts/verify-data-entry-performance-v40.mjs`
- Modify: `britium-go-live/package.json`

**Interfaces:**
- Consumes: `src/pages/DataEntryFinancialV2Page.tsx`
- Produces: a deterministic contract check used by CI before Production promotion.

- [ ] **Step 1:** Add assertions for bulk skip persistence, one-shot state application, location-validation batching, and the exact button label.
- [ ] **Step 2:** Run `npm run verify:data-entry-performance-v40`; expected result is FAIL before implementation.
- [ ] **Step 3:** Keep this verification command in package.json for regression checks.

### Task 2: Reduce background location-validation render churn

**Files:**
- Modify: `britium-go-live/src/pages/DataEntryFinancialV2Page.tsx`

**Interfaces:**
- Consumes: existing `resolveDeliveryLocation`, `patchImportedLocation`, `ParcelRow`.
- Produces: batch result application with bounded concurrency and an explicit browser yield between batches.

- [ ] **Step 1:** Add a multi-row patch helper that updates bulk draft rows and active rows in one state transition.
- [ ] **Step 2:** Refactor imported-location validation to collect a small batch of results before applying React state.
- [ ] **Step 3:** Yield to the browser between validation batches so typing, scrolling, and button clicks remain responsive.
- [ ] **Step 4:** Preserve timeout/error messages and location statuses.

### Task 3: Add audited `SKIP PENDING CLARIFICATION FOR ALL`

**Files:**
- Modify: `britium-go-live/src/pages/DataEntryFinancialV2Page.tsx`

**Interfaces:**
- Consumes: `rows`, `rowSaveObstacle`, current authenticated user, `be_data_entry_pending_drafts`.
- Produces: one bulk upsert and one UI state update for eligible rows.

- [ ] **Step 1:** Define pending-clarification eligibility from missing recipient name, phone, delivery address, or unresolved/unknown destination.
- [ ] **Step 2:** Build all pending-draft snapshots and upsert them in one Supabase call.
- [ ] **Step 3:** Apply skipped state to rows and bulk drafts once after the database succeeds.
- [ ] **Step 4:** Add `SKIP PENDING CLARIFICATION FOR ALL (N)` near the existing bulk controls and disable it while busy or when N=0.
- [ ] **Step 5:** Keep individual Resume behavior unchanged.

### Task 4: Verify and promote

**Files:**
- Verify: `britium-go-live/package.json`, `britium-go-live/src/pages/DataEntryFinancialV2Page.tsx`

**Interfaces:**
- Produces: tested branch ready for fast-forward promotion.

- [ ] **Step 1:** Run `npm run verify:data-entry-performance-v40` and expect PASS.
- [ ] **Step 2:** Run `npm run build` and expect Vite build success.
- [ ] **Step 3:** Verify the preview deployment is READY.
- [ ] **Step 4:** Fast-forward `main` only after branch verification.
- [ ] **Step 5:** Verify Production deployment is READY and the production domain returns HTTP 200.
