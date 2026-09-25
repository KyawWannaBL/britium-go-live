# Enterprise Financial Ledger Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Britium Express's production double-entry accounting ERP in safe, independently testable increments without disrupting the existing Enterprise Portal or logistics workflows.

**Architecture:** The approved design is decomposed into four implementation streams with a fixed dependency order: ledger foundation → operational synchronization → portal UI → reporting/exports → rollout/UAT. Each stream has its own testable plan and commits; production activation is deliberately last.

**Tech Stack:** Existing Vite + React 18 + TypeScript Enterprise Portal, Supabase PostgreSQL/RLS/RPC, TanStack Query, React Hook Form, Zod, Recharts, SheetJS, jsPDF, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-25-enterprise-financial-ledger-design.md`

## Global Constraints

- Do not rebuild the live Enterprise Portal in Next.js.
- Do not alter existing logistics economics; consume canonical Britium financial outputs.
- General Ledger is true double-entry.
- Finance Review Queue is the default posting gate.
- Posted journals are immutable.
- Accounting failures are isolated from logistics operations.
- Production activation requires reconciliation and UAT gates.

## Review Focus

1. Cross-plan RPC/type names must remain identical from SQL through TypeScript hooks/UI.
2. No plan may introduce a second parcel/COD pricing engine.
3. Reporting must read POSTED ledger data, never raw operational amounts.
4. All-flags-OFF mode must preserve current production behavior.
5. Production authority is granted only after opening balances, shadow reconciliation, security UAT, and period-close simulation pass.

---

### Task 1: Implement and review the ledger foundation

**Files:**
- Execute: `docs/superpowers/plans/2026-09-25-enterprise-financial-ledger-foundation.md`

**Interfaces:**
- Produces: accounting schema, RLS, posting/reversal/period/asset controls required by every later plan.

- [ ] **Step 1: Execute all tasks in the foundation plan using TDD and its commit boundaries**
- [ ] **Step 2: Run the foundation plan's complete verification suite**
- [ ] **Step 3: Stop for a reviewer gate before starting synchronization**

### Task 2: Implement and review operational synchronization

**Files:**
- Execute: `docs/superpowers/plans/2026-09-25-enterprise-accounting-sync-adapters.md`

**Interfaces:**
- Consumes: Task 1.
- Produces: idempotent REVIEW_PENDING events from delivery/COD/merchant/rider/HR/asset/manual sources.

- [ ] **Step 1: Execute all synchronization-plan tasks**
- [ ] **Step 2: Reconcile canonical sources against generated accounting proposals**
- [ ] **Step 3: Stop for a reviewer gate before UI integration**

### Task 3: Implement and review portal workflows

**Files:**
- Execute: `docs/superpowers/plans/2026-09-25-enterprise-accounting-portal-ui.md`

**Interfaces:**
- Consumes: Tasks 1–2 RPCs and event models.
- Produces: Finance, Admin/HR, Superadmin accounting screens.

- [ ] **Step 1: Execute all UI-plan tasks**
- [ ] **Step 2: Run unit/build/existing workflow regression**
- [ ] **Step 3: Stop for a reviewer gate before financial-report activation**

### Task 4: Implement and review financial reports/exports

**Files:**
- Execute: `docs/superpowers/plans/2026-09-25-enterprise-financial-reporting-exports.md`

**Interfaces:**
- Consumes: posted ledger and portal hooks.
- Produces: Trial Balance, P&L, Balance Sheet, executive dashboard, Excel/PDF.

- [ ] **Step 1: Execute all reporting-plan tasks**
- [ ] **Step 2: Prove report equations and export totals match ledger**
- [ ] **Step 3: Stop for a reviewer gate before rollout**

### Task 5: Execute controlled rollout and UAT

**Files:**
- Execute: `docs/superpowers/plans/2026-09-25-enterprise-accounting-rollout-uat.md`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: feature-flagged rollout, opening balances, shadow reconciliation, UAT evidence, production readiness.

- [ ] **Step 1: Execute rollout plan through shadow mode**
- [ ] **Step 2: Complete one full weekly cycle and one month-end close simulation**
- [ ] **Step 3: Require all production acceptance gates to pass**
- [ ] **Step 4: Enable production authority only after explicit go/no-go review**
