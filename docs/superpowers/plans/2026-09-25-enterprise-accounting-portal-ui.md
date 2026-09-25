# Enterprise Accounting Portal UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production Finance, Admin/HR, and Superadmin accounting workflows to the existing Britium Enterprise Portal while preserving current portal behavior.

**Architecture:** New accounting UI is split into focused components under `src/components/accounting/`, backed by a dedicated Supabase RPC client and TanStack Query hooks. Existing `FinancePortal.tsx`, `AdminHRPortal.tsx`, and `SuperAdminPortal.tsx` become navigation shells that compose the new modules instead of absorbing more business logic.

**Tech Stack:** React 18, TypeScript, Vite, existing Tailwind/Shadcn components, React Hook Form, Zod, TanStack Query, Supabase JS, Recharts, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-25-enterprise-financial-ledger-design.md`

## Global Constraints

- Keep existing `/finance/*`, `/admin-hr/*`, and `/admin/*` role guards intact.
- Finance users cannot edit/delete submitted locked entries directly.
- Admin/HR users cannot post journals directly.
- Superadmin corrections require a reason and invoke reversal/correction RPCs.
- Synchronized and manual amounts must be visibly distinguished.
- MMK formatting is used for accounting values.
- Critical accounting failures must show human-readable business messages.
- Backend RLS/RPC authorization remains authoritative even if UI controls are hidden.

## Review Focus

1. Double-click/retry on Submit or Approve must not create duplicate mutations; tested in Tasks 2 and 3.
2. Large, zero, and decimal MMK values must validate/format without NaN or silent coercion; tested in Task 2.
3. A Review Queue event already posted by another user must refresh to the existing journal rather than produce an ambiguous error; tested in Task 3.
4. Locked historical source documents must render read-only with the vault banner and no edit controls; tested in Task 2.
5. Unauthorized role deep-linking into Superadmin accounting controls must render access denied while backend calls remain uninvoked; tested in Task 6.

---

### Task 1: Add accounting domain types, client, hooks, and unit-test infrastructure

**Files:**
- Create: `src/types/accounting.ts`
- Create: `src/lib/accountingApi.ts`
- Create: `src/hooks/useAccounting.ts`
- Create: `src/test/setup.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: database RPCs from the foundation/synchronization plans.
- Produces: typed models and functions `listAccountingEvents`, `submitFinanceDailyLog`, `submitAdminHrLog`, `approveAndPostEvent`, `getGeneralLedger`, `getProfitLoss`, `getBalanceSheet`, `reverseJournal`, and corresponding hooks.

- [ ] **Step 1: Install exact unit-test dependencies**

```bash
npm install -D --save-exact vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add scripts:

```json
{
  "test:unit": "vitest run",
  "test:unit:watch": "vitest"
}
```

- [ ] **Step 2: Write a failing accounting-error normalization test**

```ts
it("maps JOURNAL_NOT_BALANCED to a business message", () => {
  expect(
    accountingErrorMessage({
      code: "JOURNAL_NOT_BALANCED",
      debit: 1200000,
      credit: 1180000,
    })
  ).toContain("20,000");
});
```

- [ ] **Step 3: Implement `src/types/accounting.ts`**

Define exact types for:
- AccountingEvent
- AccountingEventLine
- JournalEntry
- JournalLine
- GeneralLedgerRow
- TrialBalanceRow
- ProfitLossReport
- BalanceSheetReport
- FinanceDailyLog
- AdminHrLog
- FixedAsset
- AccountingPeriod
- AccountingFlags

- [ ] **Step 4: Implement `accountingApi.ts`**

Use `supabase.rpc` for privileged mutations and read/report RPCs. Provide `accountingErrorMessage` mappings for:
- `ALREADY_POSTED`
- `PERIOD_CLOSED`
- `JOURNAL_NOT_BALANCED`
- `SOURCE_DUPLICATE`
- `UNAUTHORIZED`
- `HOLD_EXCEPTION`

- [ ] **Step 5: Implement TanStack Query hooks**

Use stable keys:

```ts
["accounting","events",filters]
["accounting","general-ledger",filters]
["accounting","profit-loss",period]
["accounting","balance-sheet",asOf]
```

Invalidate event/ledger/report queries after post/reversal/correction.

- [ ] **Step 6: Run tests/build and commit**

```bash
npm run test:unit
npm run build
git add package.json package-lock.json vitest.config.ts src/test src/types/accounting.ts src/lib/accountingApi.ts src/hooks/useAccounting.ts
git commit -m "feat: add typed accounting client and hooks"
```

### Task 2: Build Daily Finance Entry and locked-history UX

**Files:**
- Create: `src/components/accounting/FinanceDailyEntry.tsx`
- Create: `src/components/accounting/AccountingPreview.tsx`
- Create: `src/components/accounting/LockedSubmissionBanner.tsx`
- Create: `src/components/accounting/__tests__/FinanceDailyEntry.test.tsx`
- Modify: `src/pages/FinancePortal.tsx`

**Interfaces:**
- Consumes: synchronized daily totals and Finance source submission hooks.
- Produces: validated Finance source documents and accounting preview.

- [ ] **Step 1: Write failing validation tests**

Cover:
- negative amount rejected;
- blank optional amount normalized to zero;
- funding source required when fuel/petty-cash expense > 0;
- AR/AP require counterparty/reference and offset reason;
- submit disabled while mutation pending;
- zero is accepted where business-valid.

- [ ] **Step 2: Implement Zod schema and form**

Use `z.coerce.number().min(0)` for MMK values, explicit date validation, read-only synchronized values, and separate manual adjustment inputs.

- [ ] **Step 3: Implement Accounting Preview**

Render debit/credit lines plus:

```text
Total Debit
Total Credit
Difference
```

Final confirmation remains disabled unless difference is zero.

- [ ] **Step 4: Implement locked history**

When opening a submitted record, show:

> Entry Locked & Submitted to Vault. Contact Superadmin for corrections.

All fields are read-only and Save/Edit/Delete are absent.

- [ ] **Step 5: Add Finance navigation tab**

Add `daily-entry` while preserving existing `overview`, `cod`, `settlements`, `wallets`, and `vouchers`.

- [ ] **Step 6: Run tests/build and commit**

```bash
npm run test:unit -- FinanceDailyEntry
npm run build
git add src/components/accounting src/pages/FinancePortal.tsx
git commit -m "feat: add locked daily finance entry workflow"
```

### Task 3: Build Finance Review Queue and accounting-event detail

**Files:**
- Create: `src/components/accounting/FinanceReviewQueue.tsx`
- Create: `src/components/accounting/AccountingEventDrawer.tsx`
- Create: `src/components/accounting/__tests__/FinanceReviewQueue.test.tsx`
- Modify: `src/pages/FinancePortal.tsx`

**Interfaces:**
- Consumes: accounting event list/detail/post/hold/reject hooks.
- Produces: Finance review and posting workflow.

- [ ] **Step 1: Write failing queue tests**

Cover:
- filters propagate to query;
- Approve/Post disabled while pending;
- `ALREADY_POSTED` refreshes queue and surfaces journal number;
- HELD/BLOCKED event cannot post;
- bulk approval selects only Clean eligible events.

- [ ] **Step 2: Implement horizontal filter toolbar**

Filters:
- Date From/To
- Event Type
- Source Module
- Merchant
- Rider
- Branch
- Status
- Amount Range
- Way ID/reference

- [ ] **Step 3: Implement row classifications**

Badges:
- Clean
- Warning
- Blocked
- Held
- Posted

- [ ] **Step 4: Implement event drawer**

Sections:
- Operational Source
- Source Values
- Proposed Debit/Credit
- Reconciliation
- Audit History

Actions:
- Approve & Post
- Hold
- Reject
- Send for Investigation
- View Original Operational Record

- [ ] **Step 5: Add Review Queue tab; test/build/commit**

```bash
npm run test:unit -- FinanceReviewQueue
npm run build
git add src/components/accounting src/pages/FinancePortal.tsx
git commit -m "feat: add finance accounting review queue"
```

### Task 4: Build General Ledger Explorer and journal drill-down

**Files:**
- Create: `src/components/accounting/GeneralLedgerExplorer.tsx`
- Create: `src/components/accounting/JournalDetailDialog.tsx`
- Create: `src/components/accounting/__tests__/GeneralLedgerExplorer.test.tsx`
- Modify: `src/pages/FinancePortal.tsx`

**Interfaces:**
- Consumes: General Ledger and journal-detail hooks.
- Produces: filterable ledger with journal/source drill-down.

- [ ] **Step 1: Write failing tests**

Assert account/date filters are sent, MMK formatting is correct, and clicking a journal opens all balanced lines and the source reference.

- [ ] **Step 2: Implement ledger table**

Columns:

```text
Date | Journal | Account | Description | Debit | Credit | Running Balance
```

- [ ] **Step 3: Implement journal detail dialog**

Show journal metadata, lines, event/source link, posting actor/time, reversal/replacement links.

- [ ] **Step 4: Run tests/build and commit**

```bash
npm run test:unit -- GeneralLedgerExplorer
npm run build
git add src/components/accounting src/pages/FinancePortal.tsx
git commit -m "feat: add general ledger explorer"
```

### Task 5: Build Admin/HR overhead and fixed-asset screens

**Files:**
- Create: `src/components/accounting/AdminHrAccountingEntry.tsx`
- Create: `src/components/accounting/AssetRegister.tsx`
- Create: `src/components/accounting/AssetForm.tsx`
- Create: `src/components/accounting/DepreciationView.tsx`
- Create: `src/components/accounting/__tests__/AdminHrAccountingEntry.test.tsx`
- Modify: `src/pages/AdminHRPortal.tsx`

**Interfaces:**
- Consumes: HR source submission and asset/depreciation hooks.
- Produces: locked HR submissions and fixed-asset source events.

- [ ] **Step 1: Write failing tests**

Validate:
- asset acquisition cost > 0;
- useful life > 0;
- residual value <= acquisition cost;
- category required;
- locked submitted forms read-only.

- [ ] **Step 2: Implement HR overhead form**

Fields:
- Entry Date
- Warehouse Overtime
- Base Payroll Accrual
- Facility Rent
- Utilities/Admin Cost
- Reference/Notes

- [ ] **Step 3: Implement asset acquisition form**

Preview:
- monthly depreciation;
- estimated daily depreciation;
- end-of-life date;
- proposed accounting lines.

- [ ] **Step 4: Implement Asset Register and Depreciation views**

Columns:
- Asset Code
- Asset
- Category
- Purchase Cost
- Accumulated Depreciation
- Net Book Value
- Status

- [ ] **Step 5: Run tests/build and commit**

```bash
npm run test:unit -- AdminHrAccountingEntry
npm run build
git add src/components/accounting src/pages/AdminHRPortal.tsx
git commit -m "feat: add HR overhead and fixed asset accounting UI"
```

### Task 6: Build Superadmin Accounting Control and Audit Ledger

**Files:**
- Create: `src/components/accounting/SuperadminAccountingControl.tsx`
- Create: `src/components/accounting/AuditLedger.tsx`
- Create: `src/components/accounting/CorrectionDialog.tsx`
- Create: `src/components/accounting/AccountingPeriods.tsx`
- Create: `src/components/accounting/SyncMonitor.tsx`
- Create: `src/components/accounting/__tests__/SuperadminAccountingControl.test.tsx`
- Modify: `src/pages/SuperAdminPortal.tsx`

**Interfaces:**
- Consumes: reversal/correction/period/sync/audit hooks.
- Produces: privileged accounting control workflows.

- [ ] **Step 1: Write failing authorization test**

Render with non-superadmin auth context. Assert controls are unavailable, access denied is rendered, and no privileged mutation is called.

- [ ] **Step 2: Write failing correction-reason test**

Whitespace-only reason cannot submit.

- [ ] **Step 3: Implement Accounting Control navigation**

Sections:
- Journals
- Overrides/Reversals
- Audit Ledger
- Chart of Accounts
- Accounting Periods
- Synchronization Monitor

- [ ] **Step 4: Implement structured before/after audit diff**

Show changed fields and values with optional raw JSON expansion.

- [ ] **Step 5: Implement period-close checklist**

Render reconciliation blockers and enable Close Period only when backend readiness says eligible.

- [ ] **Step 6: Run tests/build and commit**

```bash
npm run test:unit -- SuperadminAccountingControl
npm run build
git add src/components/accounting src/pages/SuperAdminPortal.tsx
git commit -m "feat: add superadmin accounting control center"
```

### Task 7: Protect existing portal behavior

**Files:**
- Create: `scripts/verify-accounting-portal-contract.mjs`

**Interfaces:**
- Consumes: portal navigation source.
- Produces: regression contract ensuring existing tabs/routes remain.

- [ ] **Step 1: Implement static contract checks**

Assert existing Finance tabs `overview`, `cod`, `settlements`, `wallets`, `vouchers` still exist. Assert existing Admin/HR tabs remain.

- [ ] **Step 2: Run full regression**

```bash
npm run test:unit
npm run build
npm run test:pricing
npm run test:workflow
node scripts/verify-accounting-portal-contract.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts
git commit -m "test: protect accounting portal integration"
```
