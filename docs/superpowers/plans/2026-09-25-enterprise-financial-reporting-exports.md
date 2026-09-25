# Enterprise Financial Reporting and Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate ledger-grounded Trial Balance, weekly/monthly P&L, as-of-date Balance Sheet, reconciliation dashboard, executive KPIs, and controlled Excel/PDF exports.

**Architecture:** Reporting SQL reads POSTED journal lines only and exposes security-invoker views/RPCs. The frontend uses typed report models; Excel uses the existing `xlsx` dependency and PDF uses a pinned `jspdf` dependency. Closed periods export from immutable report snapshots.

**Tech Stack:** Supabase PostgreSQL reporting views/RPCs, React/TypeScript, Recharts, SheetJS `xlsx`, jsPDF, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-enterprise-financial-ledger-design.md`

## Global Constraints

- Reports use POSTED ledger data only.
- P&L is period-based; Balance Sheet is as-of-date.
- EBITDA excludes depreciation.
- Balance Sheet equation must equal zero for a closable period.
- Official weekly default is Monday–Sunday.
- Closed-period exports are generated from immutable snapshots.
- Every report total must support ledger/journal/source drill-down.

## Review Focus

1. Cross-year weekly/monthly boundaries must resolve correct dates; tested in Task 2.
2. Accumulated depreciation must reduce assets instead of appearing as a positive asset; tested in Task 3.
3. Revenue/expense normal balances must normalize signs consistently; tested in Tasks 2 and 3.
4. Closed-period export must remain unchanged after later postings in other periods; tested in Task 6.
5. Large MMK values must remain numeric and exact in Excel/PDF totals; tested in Tasks 5 and 6.

---

### Task 1: Add Trial Balance and reconciliation reporting SQL

**Files:**
- Create via CLI: migration named `enterprise_financial_reporting_v1`
- Create: `tests/sql/enterprise_financial_reporting_v1.sql`

**Interfaces:**
- Consumes: POSTED `be_journal_entries` and `be_journal_lines`.
- Produces: `be_v_trial_balance_v1`, `be_accounting_trial_balance_v1(date,date)`, reconciliation RPC.

- [ ] **Step 1: Write failing Trial Balance test**

Post balanced sample journals and assert:

```text
sum(period_debit) = sum(period_credit)
difference = 0
```

- [ ] **Step 2: Implement security-invoker reporting view/RPC**

Use `WITH (security_invoker = true)` for exposed views. Compute opening balance, period debit, period credit, closing balance using account normal balance.

- [ ] **Step 3: Implement reconciliation controls**

Return:
- COD control
- rider receivable/remittance control
- merchant payable control
- rider payable control
- duplicate-source count
- events-without-journal count
- journals-without-valid-source count
- overall debit/credit difference

- [ ] **Step 4: Re-run SQL tests and commit**

```bash
git add supabase/migrations tests/sql/enterprise_financial_reporting_v1.sql
git commit -m "feat: add trial balance and reconciliation reporting"
```

### Task 2: Add P&L report engine

**Files:**
- Create via CLI: migration named `enterprise_profit_loss_reporting_v1`
- Create: `tests/sql/enterprise_profit_loss_reporting_v1.sql`

**Interfaces:**
- Consumes: Chart of Accounts report groups and POSTED journal lines.
- Produces: `be_accounting_profit_loss_v1(p_from date,p_to date) returns jsonb`.

- [ ] **Step 1: Write failing P&L equation tests**

Seed Revenue, COGS, Payroll, Rent, Depreciation journals.

Assert:

```text
Gross Profit = Revenue - COGS
EBITDA = Gross Profit - non-depreciation OPEX
EBIT = EBITDA - Depreciation
Net Income = EBIT +/- configured non-operating items
```

Explicitly assert depreciation does not reduce EBITDA.

- [ ] **Step 2: Add cross-year week-boundary test**

For a week spanning December/January, assert Monday–Sunday resolves exactly seven dates and excludes adjacent dates.

- [ ] **Step 3: Implement P&L RPC**

Group through Chart of Accounts reporting classifications, not raw operational columns.

- [ ] **Step 4: Re-run tests and commit**

```bash
git add supabase/migrations tests/sql/enterprise_profit_loss_reporting_v1.sql
git commit -m "feat: add ledger-based profit and loss reporting"
```

### Task 3: Add Balance Sheet engine and equation control

**Files:**
- Create via CLI: migration named `enterprise_balance_sheet_reporting_v1`
- Create: `tests/sql/enterprise_balance_sheet_reporting_v1.sql`

**Interfaces:**
- Consumes: POSTED ledger balances through an as-of date.
- Produces: `be_accounting_balance_sheet_v1(p_as_of date) returns jsonb`.

- [ ] **Step 1: Write failing Balance Sheet test**

Seed:
- Cash 1,000,000
- AR 500,000
- Fixed Asset 1,200,000
- Accumulated Depreciation 200,000
- AP 400,000
- Merchant Payable 500,000
- Capital/Retained Earnings 1,600,000

Expected:
- Total Assets = 2,500,000
- Liabilities + Equity = 2,500,000

- [ ] **Step 2: Assert accumulated depreciation is subtractive**

Expected net fixed assets = 1,000,000.

- [ ] **Step 3: Implement Balance Sheet RPC**

Return sections and `balance_difference`; non-zero difference returns `balanced=false`.

- [ ] **Step 4: Re-run tests and commit**

```bash
git add supabase/migrations tests/sql/enterprise_balance_sheet_reporting_v1.sql
git commit -m "feat: add as-of-date balance sheet reporting"
```

### Task 4: Build financial-report dashboards and drill-down

**Files:**
- Create: `src/components/accounting/FinancialReports.tsx`
- Create: `src/components/accounting/ProfitLossReport.tsx`
- Create: `src/components/accounting/BalanceSheetReport.tsx`
- Create: `src/components/accounting/TrialBalanceReport.tsx`
- Create: `src/components/accounting/ReconciliationCenter.tsx`
- Create: `src/components/accounting/ExecutiveFinancialDashboard.tsx`
- Create: `src/components/accounting/__tests__/FinancialReports.test.tsx`
- Modify: `src/pages/FinancePortal.tsx`
- Modify: `src/pages/SuperAdminPortal.tsx`

**Interfaces:**
- Consumes: report hooks.
- Produces: Finance statements and Superadmin executive dashboard.

- [ ] **Step 1: Write failing report-mode tests**

Assert Today/Weekly/Monthly/Custom resolve correct dates; Balance Sheet exposes As-of Date only; out-of-balance result renders a critical warning.

- [ ] **Step 2: Implement P&L, Balance Sheet, and Trial Balance**

Every account/report row gets a drill-down action opening General Ledger filtered to the corresponding account and date range.

- [ ] **Step 3: Implement Reconciliation Center**

Columns:
- Control
- Operational Source
- Ledger/ERP Source
- Difference
- Status

Non-zero controls are clickable.

- [ ] **Step 4: Implement executive dashboard**

KPIs:
- Revenue
- Gross Profit
- EBITDA
- Net Income
- Gross Margin %
- EBITDA Margin %
- Cash
- AR/AP
- COD/Merchant/Rider liabilities
- Fixed Asset NBV
- Working Capital

- [ ] **Step 5: Run tests/build and commit**

```bash
npm run test:unit -- FinancialReports
npm run build
git add src/components/accounting src/pages/FinancePortal.tsx src/pages/SuperAdminPortal.tsx
git commit -m "feat: add enterprise financial reporting dashboards"
```

### Task 5: Add Excel financial statement exports

**Files:**
- Create: `src/lib/accountingExcel.ts`
- Create: `src/lib/__tests__/accountingExcel.test.ts`
- Modify: reporting components

**Interfaces:**
- Consumes: report models.
- Produces: `buildMonthlyFinancialWorkbook(data): XLSX.WorkBook` and download helpers.

- [ ] **Step 1: Write failing workbook test**

Assert workbook sheets:

```text
Executive Summary
Profit & Loss
Balance Sheet
Trial Balance
General Ledger
COD Reconciliation
Assets
Audit Summary
```

Assert MMK 9,999,999,999 remains numeric, not a formatted string.

- [ ] **Step 2: Implement workbook builder**

Include Britium Express, reporting period, generated timestamp, generated by, currency, statement status, and signature placeholders.

- [ ] **Step 3: Add Weekly Excel and Monthly Excel actions**

Disable export while report is loading or formal report validation fails.

- [ ] **Step 4: Run tests and commit**

```bash
npm run test:unit -- accountingExcel
git add src/lib/accountingExcel.ts src/lib/__tests__/accountingExcel.test.ts src/components/accounting
git commit -m "feat: add Excel financial statement exports"
```

### Task 6: Add PDF statements and immutable closed-period snapshots

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/accountingPdf.ts`
- Create: `src/lib/__tests__/accountingPdf.test.ts`
- Create via CLI: migration named `enterprise_financial_report_snapshots_v1`
- Create: `tests/sql/enterprise_financial_report_snapshots_v1.sql`

**Interfaces:**
- Consumes: report data and `be_financial_report_snapshots`.
- Produces: `createMonthlyFinancialPdf(snapshot)` and immutable snapshot RPC.

- [ ] **Step 1: Install PDF library exactly**

```bash
npm install --save-exact jspdf
```

- [ ] **Step 2: Write failing PDF content test**

Assert document model contains:
- Britium Express
- reporting period
- Executive Summary
- Profit & Loss
- Balance Sheet
- Key Ratios
- Notes/Exceptions
- Prepared By / Reviewed By / Approved By

Also assert MMK 9,999,999,999 is represented without precision loss in source totals.

- [ ] **Step 3: Implement snapshot RPC**

On period close store report JSON, ledger cutoff, report version, approver, timestamp, and content hash. Re-requesting the same CLOSED period returns the stored snapshot instead of recalculating.

- [ ] **Step 4: Implement jsPDF generator**

Use snapshot data for CLOSED periods. Label OPEN-period PDFs as provisional.

- [ ] **Step 5: Add snapshot-stability test**

After snapshot, post a journal in a different OPEN period. Assert closed snapshot payload/hash is unchanged.

- [ ] **Step 6: Run tests/build and commit**

```bash
npm run test:unit -- accountingPdf
npm run build
git add package.json package-lock.json src/lib tests/sql supabase/migrations
git commit -m "feat: add PDF financial statements and report snapshots"
```

### Task 7: Add full financial-report verification

**Files:**
- Create: `scripts/verify-enterprise-financial-reports.mjs`

**Interfaces:**
- Consumes: all reporting/export features.
- Produces: repeatable consistency verification.

- [ ] **Step 1: Implement assertions**

Fail unless:
- Trial Balance debit = credit;
- Balance Sheet difference = 0;
- P&L Net Income equals report-derived period earnings;
- workbook totals match report JSON;
- CLOSED snapshot is immutable.

- [ ] **Step 2: Run full verification**

```bash
npm run test:unit
npm run build
node scripts/verify-enterprise-financial-reports.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts
git commit -m "test: verify enterprise financial reports"
```
