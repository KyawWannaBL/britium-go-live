# Enterprise Accounting Rollout and UAT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the accounting subsystem safely in shadow mode, establish opening balances, reconcile operational sources, complete UAT/security validation, and activate the General Ledger without disrupting live logistics operations.

**Architecture:** Deployment is additive and feature-flagged. Accounting synchronization and posting can be independently disabled while existing Finance/logistics workflows remain live; the new ledger becomes authoritative only after reconciliation gates pass.

**Tech Stack:** Supabase migrations/RPCs, Vite feature configuration, Vercel deployment, SQL/TypeScript verification scripts, existing Britium workflows.

**Spec:** `docs/superpowers/specs/2026-09-25-enterprise-financial-ledger-design.md`

## Global Constraints

- No big-bang replacement of current operational Finance.
- Existing logistics workflows must continue if ERP sync/posting is disabled.
- Historical data is not blindly backfilled.
- Opening Balance Journal must balance before posting.
- At least one full weekly cycle and one month-end close simulation must pass before financial statements become authoritative.
- Production activation requires every acceptance gate in the spec to pass.
- Runtime flags are `ERP_UI_ENABLED`, `ACCOUNTING_SYNC_ENABLED`, `GL_POSTING_ENABLED`, `FINANCIAL_REPORTS_ENABLED`.

## Review Focus

1. All flags OFF while ERP tables exist must preserve current Finance/operations; tested in Task 1.
2. Pre-go-live historical source changes must not unexpectedly create current journals; tested in Task 2.
3. Unbalanced opening balances must be blocked with exact difference; tested in Task 3.
4. Shadow reconciliation mismatch must prevent activation; tested in Task 4.
5. Rollback after some journals are posted must preserve ERP history and never delete journals; tested in Task 6.

---

### Task 1: Add ERP runtime feature flags

**Files:**
- Create via CLI: migration named `enterprise_accounting_runtime_flags_v1`
- Create: `src/lib/accountingFlags.ts`
- Create: `src/lib/__tests__/accountingFlags.test.ts`
- Modify: accounting portal entry points only

**Interfaces:**
- Consumes: runtime config.
- Produces: four safely defaulted flags.

- [ ] **Step 1: Write failing disabled-mode UI test**

With all flags false:
- existing Finance tabs still render;
- no accounting sync/post RPC is called;
- existing COD/settlement functionality remains available.

- [ ] **Step 2: Implement runtime table/RPC and frontend helper**

```ts
type AccountingFlags = {
  erpUiEnabled: boolean;
  syncEnabled: boolean;
  postingEnabled: boolean;
  reportsEnabled: boolean;
};
```

Default all flags OFF until explicitly enabled by authorized Superadmin.

- [ ] **Step 3: Run regression and commit**

```bash
npm run test:unit -- accountingFlags
npm run build
npm run test:workflow
git add supabase/migrations src/lib src/pages
git commit -m "feat: gate enterprise accounting rollout with runtime flags"
```

### Task 2: Add accounting go-live cutoff and controlled backfill

**Files:**
- Create via CLI: migration named `enterprise_accounting_cutover_v1`
- Create: `tests/sql/enterprise_accounting_cutover_v1.sql`

**Interfaces:**
- Consumes: synchronization adapters.
- Produces: go-live date config and `be_accounting_backfill_v1(...)`.

- [ ] **Step 1: Write failing cutoff test**

Set go-live date to `2099-10-01`. Update a source economically dated `2099-09-30`; normal sync must not create a new event. Explicit authorized backfill may create REVIEW_PENDING.

- [ ] **Step 2: Implement cutoff rule**

Normal sync only includes source economic dates on/after go-live. Authorized backfill bypasses this only for the requested date range.

- [ ] **Step 3: Implement backfill summary**

Return:

```json
{
  "scanned": 0,
  "eligible": 0,
  "skipped": 0,
  "already_imported": 0,
  "needs_review": 0,
  "failed": 0,
  "posted": 0,
  "debit_total": 0,
  "credit_total": 0
}
```

- [ ] **Step 4: Run tests and commit**

```bash
git add supabase/migrations tests/sql/enterprise_accounting_cutover_v1.sql
git commit -m "feat: add accounting cutover and controlled backfill"
```

### Task 3: Add Opening Balance workflow

**Files:**
- Create via CLI: migration named `enterprise_opening_balance_v1`
- Create: `src/components/accounting/OpeningBalanceWizard.tsx`
- Create: `src/components/accounting/__tests__/OpeningBalanceWizard.test.tsx`
- Create: `tests/sql/enterprise_opening_balance_v1.sql`
- Modify: `src/pages/SuperAdminPortal.tsx`

**Interfaces:**
- Consumes: journal posting core.
- Produces: reviewed Opening Balance event/journal.

- [ ] **Step 1: Write failing unbalanced-opening test**

Enter Assets 2,000,000 and Liabilities+Equity 1,900,000. Final submit must be disabled and difference MMK 100,000 shown.

- [ ] **Step 2: Implement wizard**

Rows require:
- account;
- debit or credit amount;
- source/reference;
- reconciliation note.

Header requires:
- balance date;
- preparer;
- reviewer/approval state.

- [ ] **Step 3: Implement backend rule**

Event type `OPENING_BALANCE`; exactly one approved opening journal per cutover/version.

- [ ] **Step 4: Run tests/build and commit**

```bash
npm run test:unit -- OpeningBalanceWizard
npm run build
git add src/components/accounting src/pages/SuperAdminPortal.tsx tests/sql supabase/migrations
git commit -m "feat: add controlled accounting opening balances"
```

### Task 4: Build shadow reconciliation and activation gate

**Files:**
- Create: `scripts/verify-accounting-shadow-reconciliation.mjs`
- Create via CLI: migration named `enterprise_accounting_activation_gate_v1`
- Create: `tests/sql/enterprise_accounting_activation_gate_v1.sql`

**Interfaces:**
- Consumes: reconciliation controls and runtime flags.
- Produces: `be_accounting_activation_readiness_v1()` and guarded activation.

- [ ] **Step 1: Write failing mismatch test**

Create a non-zero Merchant Payable reconciliation difference. Assert:
- readiness returns `ready=false`;
- `GL_POSTING_ENABLED` cannot be enabled.

- [ ] **Step 2: Implement readiness function**

Check:
- journal balance;
- Trial Balance;
- Balance Sheet;
- duplicate sources;
- orphan events/journals;
- COD;
- Merchant Payable;
- rider balances;
- opening-balance approval;
- fixed-asset reconciliation;
- RLS/security-UAT signoff marker.

- [ ] **Step 3: Implement activation RPC**

Only Superadmin may promote flags, and only when readiness passes for the requested level.

- [ ] **Step 4: Implement shadow verification script**

Print every control; exit non-zero on unexplained differences.

- [ ] **Step 5: Commit**

```bash
git add scripts tests/sql supabase/migrations
git commit -m "feat: gate accounting activation on reconciliation"
```

### Task 5: Execute formal functional and security UAT

**Files:**
- Create: `docs/accounting/enterprise-accounting-uat.md`
- Create: `scripts/verify-accounting-security-uat.mjs`

**Interfaces:**
- Consumes: completed ERP.
- Produces: UAT evidence and security verification.

- [ ] **Step 1: Document functional scenarios with expected journals**

Include:
- delivery revenue;
- COD collection/remittance;
- merchant settlement;
- rider commission accrual/payment;
- fuel/petty cash;
- payroll accrual/payment;
- asset acquisition/depreciation;
- failed delivery/RTO;
- correction/reversal;
- duplicate sync.

- [ ] **Step 2: Implement security UAT automation**

Verify:
- Finance cannot update locked Finance source;
- Admin/HR cannot mutate journals;
- ordinary authenticated user cannot insert journals;
- POSTED journal cannot be directly updated/deleted;
- browser metadata role spoofing does not grant authority.

- [ ] **Step 3: Run full regression**

```bash
npm run test:unit
npm run build
npm run test:pricing
npm run test:workflow
node scripts/verify-accounting-security-uat.mjs
```

Expected: PASS.

- [ ] **Step 4: Record evidence and commit**

```bash
git add docs/accounting scripts
git commit -m "test: document enterprise accounting UAT"
```

### Task 6: Add production runbook, rollback, and go/no-go verification

**Files:**
- Create: `docs/accounting/enterprise-accounting-runbook.md`
- Create: `scripts/verify-accounting-production-readiness.mjs`

**Interfaces:**
- Consumes: activation readiness and deployment state.
- Produces: operator runbook and final go/no-go check.

- [ ] **Step 1: Write rollout sequence**

1. deploy foundation with all flags OFF;
2. verify existing portals;
3. enable `ERP_UI_ENABLED`;
4. enable `ACCOUNTING_SYNC_ENABLED` in review-only mode;
5. complete one weekly shadow cycle;
6. complete month-end close simulation;
7. approve opening balances;
8. require readiness PASS;
9. enable `GL_POSTING_ENABLED`;
10. validate posted journals;
11. enable `FINANCIAL_REPORTS_ENABLED`;
12. mark ledger production-authoritative.

- [ ] **Step 2: Write rollback sequence**

1. disable posting;
2. disable sync if required;
3. leave existing operational Finance active;
4. preserve all posted ERP history;
5. repair/reconcile;
6. rerun readiness;
7. re-enable.

Never delete posted journals as rollback.

- [ ] **Step 3: Implement production-readiness script**

Exit non-zero unless all 15 acceptance gates from the approved design pass.

- [ ] **Step 4: Run readiness in non-production/staging first**

Expected: PASS before production promotion.

- [ ] **Step 5: Commit**

```bash
git add docs/accounting scripts
git commit -m "docs: add enterprise accounting rollout runbook"
```
