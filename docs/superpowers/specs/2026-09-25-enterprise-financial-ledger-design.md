# Britium Express Enterprise Financial Ledger Design

**Date:** 2026-09-25  
**System:** Britium Express Enterprise Portal — `www.britiumexpress.com`  
**Repository:** `KyawWannaBL/britium-go-live`  
**Status:** Approved architectural design awaiting implementation-plan review

## 1. Purpose

Britium Express requires an enterprise accounting subsystem inside the existing Enterprise Portal that:

- accepts controlled manual Finance and Admin/HR source entries;
- synchronizes accounting-relevant events from existing operational modules;
- posts balanced double-entry journals only after accounting validation;
- keeps normal-user submissions immutable after submission;
- preserves complete audit and reversal history;
- produces reliable weekly and monthly Profit & Loss, Trial Balance, Balance Sheet, reconciliation, and management reports;
- exports controlled Excel and PDF financial statements;
- does not disrupt the existing Data Entry, Warehouse, Rider, COD, Merchant Settlement, Finance, Admin/HR, or Superadmin workflows.

The General Ledger is the accounting source of truth. Existing operational modules remain the source of truth for logistics operations.

## 2. Current Production Context

The Enterprise Portal is currently a **Vite + React 18 + TypeScript + React Router + Supabase** application, not a Next.js application.

Existing production modules include:

- Finance Portal;
- Admin/HR Portal;
- Superadmin Portal;
- Data Entry and canonical parcel finance calculation;
- COD reconciliation and settlement;
- merchant settlement;
- rider wallet and commission infrastructure;
- HR attendance and leave;
- branch finance entries.

The ERP accounting subsystem will therefore extend the existing portal instead of rebuilding the live application in Next.js. This avoids unnecessary migration risk and preserves existing production contracts.

Existing financial calculation and settlement results are reused. The ERP must not independently recalculate parcel pricing, COD economics, merchant settlement, Royal commission, or rider commission rules where an authoritative operational source already exists.

## 3. Architectural Principles

### 3.1 Operational data versus accounting data

Operational modules answer:

> What happened in the logistics business?

The accounting subsystem answers:

> What is the accounting consequence, when is it recognized, which accounts are affected, and has it been reviewed and posted?

The processing chain is:

```text
Operational Systems
    ↓
Canonical Operational Financial Sources
    ↓
Accounting Synchronization Adapters
    ↓
Accounting Event Inbox
    ↓
Finance Review Queue
    ↓
Double-Entry Posting Engine
    ↓
General Ledger
    ↓
Trial Balance
    ↓
P&L / Balance Sheet / Management Reports
```

### 3.2 Review-before-posting

Operational transactions do not change the General Ledger immediately.

Normalized events first enter the Finance Review Queue. Finance can inspect the operational source, proposed debit/credit lines, amount, counterparty, exception state, and reconciliation result.

Default event lifecycle:

```text
DRAFT → REVIEW_PENDING → APPROVED → POSTED
```

Exception states:

```text
NEEDS_REVIEW
HELD
REJECTED
SYNC_FAILED
REVERSED
```

### 3.3 Double-entry invariant

Every posted journal must satisfy:

```text
Total Debit = Total Credit
```

Posting is atomic. If any account, period, source, authorization, balance, or duplicate check fails, no partial journal is created.

### 3.4 Immutable posted history

Posted journals and journal lines are never silently edited or deleted through normal application workflows, including by Superadmin.

Corrections use:

```text
Original Journal → Reversal Journal → Corrected Journal
```

This preserves accounting history and auditability.

### 3.5 Idempotency

Every synchronized operational accounting event has a unique source identity:

```text
source_system
+ source_table
+ source_record_id
+ event_type
+ accounting_version
```

The same economic event cannot post twice.

## 4. Roles and Accounting Permissions

The design preserves existing Enterprise Portal role naming.

### 4.1 Finance users

Existing roles such as `finance` and `accountant` receive controlled permissions to:

- submit Daily Finance entries;
- view locked historical Finance entries;
- review permitted synchronized accounting events;
- approve/post where explicitly granted;
- view General Ledger and financial reports;
- export permitted reports.

They cannot directly UPDATE or DELETE submitted source documents or posted journals.

### 4.2 Admin/HR users

Existing roles such as `admin` and `hr` can:

- submit HR overhead entries;
- submit fixed-asset acquisitions;
- view their historical locked submissions;
- view asset/depreciation information permitted to their role.

They cannot directly post General Ledger journals.

### 4.3 Superadmin

`super_admin` receives controlled access to:

- Chart of Accounts configuration;
- accounting period controls;
- correction/reversal workflows;
- source override workflows;
- audit and synchronization controls;
- report snapshots;
- reconciliation administration.

Superadmin correction actions require a non-empty reason and create audit records. Posted accounting history remains immutable and is corrected by reversal/replacement.

### 4.4 Authorization source

Accounting authorization must not trust browser-editable `user_metadata`.

The existing Britium account registry and server-side role helpers remain authoritative. New accounting permissions may be represented as capabilities such as:

- `finance_entry`;
- `finance_review`;
- `journal_post`;
- `asset_entry`;
- `period_close`;
- `ledger_admin`.

## 5. Core Database Model

### 5.1 Chart of Accounts

Table: `be_chart_of_accounts`

Core fields:

- `id uuid primary key`
- `account_code text unique not null`
- `account_name text not null`
- `account_type` — ASSET, LIABILITY, EQUITY, REVENUE, COGS, EXPENSE
- `normal_balance` — DEBIT or CREDIT
- `parent_account_id uuid null`
- `report_group text`
- `is_postable boolean`
- `is_active boolean`
- `created_at timestamptz`
- `updated_at timestamptz`

Initial numbering convention:

- 1000–1999 Assets
- 2000–2999 Liabilities
- 3000–3999 Equity
- 4000–4999 Revenue
- 5000–5999 Direct Costs / COGS
- 6000–6999 Operating Expenses

Representative accounts include:

- Cash on Hand
- Bank Accounts
- COD Cash Clearing
- Rider COD Receivable
- Accounts Receivable
- Fleet Vehicles
- Warehouse Machinery
- IT Infrastructure
- Office Equipment
- Accumulated Depreciation
- Merchant COD Payable
- Rider Commission Payable
- Accounts Payable
- Payroll Payable
- Expense Accruals
- Capital
- Retained Earnings
- Delivery Service Revenue
- COD Handling Revenue
- Surcharge Revenue
- Partner Commission Revenue
- Rider Commission Expense
- Fuel & Tolls Expense
- Packaging Expense
- Payroll Expense
- Warehouse Overtime
- Rent
- Utilities
- Administrative Expense
- Depreciation Expense
- Petty Cash Expense

### 5.2 Accounting Events

Table: `be_accounting_events`

Purpose: normalized accounting-relevant source events before posting.

Core fields:

- `id uuid primary key`
- `event_date date not null`
- `source_system text not null`
- `source_table text not null`
- `source_record_id text not null`
- `source_reference text null`
- `event_type text not null`
- `accounting_version text not null`
- `description text`
- `currency_code text default 'MMK'`
- `total_amount numeric(18,2)`
- `review_status text not null`
- `source_snapshot jsonb not null`
- `input_fingerprint text not null`
- `created_by uuid null`
- `reviewed_by uuid null`
- `reviewed_at timestamptz null`
- `posted_journal_id uuid null`
- `metadata jsonb not null default '{}'`
- timestamps

A unique constraint prevents duplicate source/event/version combinations.

### 5.3 Proposed Accounting Lines

Table: `be_accounting_event_lines`

These lines represent proposed debit/credit effects before posting.

Fields include:

- event ID;
- account ID;
- debit amount;
- credit amount;
- branch;
- merchant/counterparty;
- rider/employee;
- cost center;
- description;
- sequence.

These are mutable only while the event remains pre-posting.

### 5.4 Posted Journal Headers

Table: `be_journal_entries`

Fields include:

- journal number;
- accounting date;
- description;
- source event;
- posting status;
- accounting period;
- posted by;
- posted at;
- reversal-of journal ID;
- replacement-for journal ID;
- metadata.

### 5.5 Journal Lines

Table: `be_journal_lines`

Fields include:

- journal ID;
- account ID;
- debit;
- credit;
- branch;
- merchant;
- rider/employee;
- source reference;
- cost center;
- description;
- sequence.

Posted lines are immutable.

### 5.6 Source Links

Table: `be_accounting_source_links`

Purpose: idempotent source-to-event/journal linkage and source-change detection.

Fields include source identity, fingerprint, event ID, journal ID, mapping version, and timestamps.

### 5.7 Accounting Periods

Table: `be_accounting_periods`

States:

```text
OPEN → SOFT_CLOSED → CLOSED
```

Normal posting into a CLOSED period is rejected. Reopening requires Superadmin authority and an audit reason.

### 5.8 Manual Finance Logs

Table: `finance_daily_logs`

Required business fields:

- `id uuid primary key`
- `entry_date date`
- `department_code text`
- `delivery_fees_collected numeric`
- `cod_handling_fees numeric`
- `surcharges numeric`
- `rider_commissions_accrued numeric`
- `fuel_and_tolls_spent numeric`
- `packaging_supplies_spent numeric`
- `petty_cash_expenses numeric`
- `cod_cash_collected_in_hand numeric`
- `accounts_receivable_invoiced numeric`
- `accounts_payable_incurred numeric`
- `is_locked boolean default true`
- `created_by uuid`
- `created_at timestamptz`

Governance fields:

- `submission_no`
- `source_mode`
- `accounting_event_id`
- `submitted_at`
- `soft_deleted_at`
- `soft_deleted_by`
- `override_reason`
- `version_no`

A composite date/department/version rule is used instead of a global one-row-per-date restriction so controlled branch or replacement versions remain possible.

### 5.9 Admin Assets and HR Logs

Table: `admin_assets_and_hr_logs`

Includes:

- entry date;
- asset name;
- asset category;
- acquisition cost;
- useful life;
- calculated depreciation reference;
- warehouse overtime;
- base payroll accrual;
- rent allocation;
- utilities/admin costs;
- lock status;
- creator and timestamps.

The daily HR/asset log is a source document, not the permanent asset master.

### 5.10 Fixed Asset Register

Table: `be_fixed_asset_register`

Fields include:

- asset code;
- asset name;
- category;
- acquisition date;
- acquisition cost;
- residual value;
- useful life months;
- depreciation method;
- department;
- branch;
- supplier/reference;
- status;
- disposal fields.

Straight-line depreciation:

```text
Depreciable Base = Acquisition Cost − Residual Value
Monthly Depreciation = Depreciable Base ÷ Useful Life Months
```

Official depreciation journals are normally monthly. Daily depreciation may be calculated for management reporting without generating unnecessary daily journal volume.

### 5.11 Audit Log

Table: `audit_logs`

Required fields:

- `id uuid primary key`
- `table_name text`
- `record_id uuid`
- `action text`
- `old_data jsonb`
- `new_data jsonb`
- `performed_by uuid`
- `timestamp timestamptz`

Additional recommended fields:

- reason;
- request ID;
- source IP;
- user agent;
- related journal;
- metadata.

Accounting audit actions include INSERT, UPDATE, DELETE, POST, REVERSE, APPROVE, REJECT, UNLOCK, CLOSE_PERIOD, and REOPEN_PERIOD.

## 6. Database Security and Immutability

RLS is enabled on every newly exposed `public` table.

### 6.1 Standard users

Finance and Admin/HR users receive only the row access appropriate to their business functions.

Submitted source documents are read-only after submission.

Direct UPDATE/DELETE access to posted journals and journal lines is denied.

### 6.2 Lock trigger

A `BEFORE INSERT` trigger forces:

```text
is_locked = true
```

for submitted Finance and Admin/HR source documents regardless of the browser payload.

### 6.3 Posting API

Journal posting occurs through a narrowly scoped database function that:

1. validates authenticated authority;
2. locks the event;
3. validates event state;
4. validates open accounting period;
5. validates all referenced GL accounts;
6. validates unique source identity;
7. validates debit equals credit;
8. creates journal header;
9. creates all journal lines;
10. updates event state;
11. writes audit history;
12. commits atomically.

Failure at any step rolls back the whole transaction.

## 7. Operational-to-Ledger Mapping

### 7.1 Revenue Recognition

A waybill is not recognized as delivery revenue merely because it is created.

The default delivery-service recognition point is **validated delivery completion**, unless a specific approved commercial rule defines another billable event.

The canonical Finance projection supplies the financial entitlement. The ERP does not independently recompute the tariff.

### 7.2 COD Collection

Example customer collection: MMK 14,000.

At rider collection:

```text
Dr Rider COD Receivable / Cash in Transit    14,000
    Cr COD Unallocated Clearing                      14,000
```

If validated economics are:

- Britium revenue: MMK 4,000
- Merchant liability: MMK 10,000

then:

```text
Dr COD Unallocated Clearing                  14,000
    Cr Merchant COD Payable                         10,000
    Cr Delivery Service Revenue                      4,000
```

At rider remittance to Finance:

```text
Dr Cash / Bank                               14,000
    Cr Rider COD Receivable                         14,000
```

COD remittance is not revenue.

### 7.3 Merchant Settlement

When Britium pays the merchant:

```text
Dr Merchant COD Payable
    Cr Bank / Cash
```

No additional revenue or expense is recognized at settlement.

Where the canonical settlement direction indicates the merchant owes Britium, the accounting adapter uses Merchant Accounts Receivable instead of Merchant Payable.

### 7.4 Delivery Fees and Surcharges

The adapter consumes canonical Britium financial outputs such as net delivery entitlement and approved surcharge results.

Only Britium-entitled amounts become revenue. Provider/pass-through amounts become provider liabilities or clearing balances.

### 7.5 Royal / Outsourced Providers

Existing provider-specific commercial logic remains authoritative.

Where Britium acts as agent, the ledger recognizes Britium's commission/net entitlement and the provider portion as payable rather than grossing up both revenue and expense.

Where a provider arrangement legally/economically makes Britium principal, gross revenue plus outsourced-delivery expense may be configured through provider accounting mapping.

This classification is configuration-driven and is not hard-coded into the reporting UI.

### 7.6 Rider Commission

Approved rider commission accrual:

```text
Dr Rider Commission Expense
    Cr Rider Commission Payable
```

Payment:

```text
Dr Rider Commission Payable
    Cr Bank / Cash
```

Pending wallet estimates do not post to the GL.

### 7.7 Rider Bonus and Deductions

Bonus:

```text
Dr Rider Bonus Expense
    Cr Rider Payable
```

A deduction normally reduces Rider Payable and offsets the appropriate expense/recovery account according to configured reason.

### 7.8 Fuel and Tolls

Paid immediately:

```text
Dr Fuel & Tolls Expense
    Cr Cash / Petty Cash
```

On supplier credit:

```text
Dr Fuel & Tolls Expense
    Cr Accounts Payable
```

The manual Finance form therefore includes payment/funding source information.

### 7.9 Packaging

Version 1 treats normal packaging purchases as direct expense unless Britium later enables packaging inventory accounting.

### 7.10 Petty Cash

Petty cash transactions require amount, category, description, and supporting reference.

A daily summary may be displayed, but the GL retains categorized entries.

### 7.11 Accounts Receivable and Accounts Payable

A true ledger cannot post AR or AP from a number alone.

Manual AR/AP entries require:

- counterparty;
- amount;
- offset account/reason;
- invoice or supporting reference.

Operationally generated merchant/rider receivables or payables are synchronized automatically and must not be re-entered manually.

### 7.12 Payroll and HR

Attendance is supporting evidence only.

Payroll accrual:

```text
Dr Payroll Expense
    Cr Payroll Payable
```

Overtime accrual:

```text
Dr Warehouse Overtime Expense
    Cr Payroll Payable
```

Payment:

```text
Dr Payroll Payable
    Cr Bank
```

### 7.13 Rent and Utilities

Formal accounting uses invoice/accrual entries.

Management reporting may allocate monthly amounts across days without creating unnecessary daily formal journals.

### 7.14 Fixed Assets

Cash acquisition:

```text
Dr Fixed Asset
    Cr Cash / Bank
```

Credit purchase:

```text
Dr Fixed Asset
    Cr Accounts Payable
```

Depreciation:

```text
Dr Depreciation Expense
    Cr Accumulated Depreciation
```

Asset disposal calculates gain/loss from acquisition cost less accumulated depreciation.

A configurable capitalization threshold determines whether qualifying purchases become fixed assets or period expense.

### 7.15 Failed Delivery and RTO

Failed delivery does not automatically recognize successful-delivery revenue.

If an approved commercial rule provides a failed-attempt or RTO fee, the canonical operational pricing output supplies that amount.

If a previously posted successful delivery is later proven incorrect, the accounting engine generates reversal and corrected events.

### 7.16 Postponed and Cancelled Delivery

Postponed delivery creates no delivery revenue until a recognized billable event occurs.

Cancelled unrecognized waybills create no delivery-revenue journal.

If cancellation corrects an already-posted event, the system generates a reversal.

### 7.17 Branch Transfers

Transfers between branches/HQ are asset transfers or intercompany/internal-clearing movements, not revenue.

### 7.18 Legacy Finance Tables

Existing generic Finance tables remain operational sources where current application screens depend on them.

They do not become a parallel ledger.

Accounting truth after ERP activation is:

```text
be_journal_entries + be_journal_lines
```

## 8. Source Priority and Anti-Double-Counting

Where the same business fact exists in several tables, precedence is:

1. canonical Finance projection for parcel economics;
2. Finance COD settlement records for COD settlement state;
3. approved commission run/wallet transaction for rider commission;
4. canonical merchant settlement queue/batch for merchant settlement;
5. manual Finance entry only for economic events not already represented by synchronized sources.

The Daily Finance screen visibly separates:

- **System Synchronized**
- **Manual / Adjustment**

Users do not re-enter synchronized totals.

Manual adjustments are incremental only and require a reason.

## 9. Reconciliation Controls

Critical period controls include:

- Customer COD collected versus COD accounting events;
- Rider remittance versus Rider COD Receivable;
- merchant settlement queue versus Merchant Payable;
- approved rider commissions versus Rider Payable;
- journal debit versus credit;
- Balance Sheet equation;
- duplicate source events;
- posted events without journals;
- journals without valid source/manual authorization.

Expected unexplained difference for critical controls: **0**.

Operational exception states such as COD `HOLD_EXCEPTION` are respected. An unresolved source exception cannot post to the GL.

## 10. Finance Portal UX

Existing Finance navigation is extended to:

- Overview
- Daily Finance Entry
- Review Queue
- General Ledger
- Financial Reports
- COD Reconciliation
- Settlements
- Rider Wallets
- Vouchers
- Exports

### 10.1 Daily Finance Entry

Sections:

- Revenue;
- Direct Operating Costs;
- Working Capital;
- Expenses.

The user enters business values, not debit/credit lines.

Before submission, an **Accounting Preview** displays proposed journals, total debit, total credit, and difference.

Submission is disabled if the journal is not balanced.

After submission, the source document displays:

> Entry Locked & Submitted to Vault. Contact Superadmin for corrections.

### 10.2 Finance Review Queue

Filters include:

- date range;
- event type;
- source module;
- merchant;
- rider;
- branch;
- status;
- amount range;
- Way ID/reference search.

Queue classes:

- Clean
- Warning
- Blocked

Actions:

- Approve & Post
- Hold
- Reject
- Send for Investigation
- View Operational Source

Bulk approval is permitted only for fully validated low-risk entries.

## 11. Admin/HR UX

Existing Admin/HR navigation gains:

- Assets & HR Costs
- Asset Register
- Depreciation

Daily HR/overhead submissions lock after submission and enter Finance Review rather than posting directly.

The asset acquisition form includes:

- asset name/code;
- category;
- purchase date;
- acquisition cost;
- residual value;
- useful life;
- department;
- branch;
- supplier/reference;
- notes.

The UI previews monthly depreciation and proposed accounting.

## 12. General Ledger Explorer

Filters include:

- period/date;
- account;
- journal number;
- merchant;
- rider;
- branch;
- source module;
- Way ID/reference;
- status.

Each financial amount supports drill-down:

```text
Financial Statement
→ GL Account
→ Journal
→ Accounting Event
→ Operational Source
```

## 13. Financial Reports

### 13.1 Profit & Loss

Period views:

- Today
- Weekly
- Monthly
- Custom

Official weekly default: **Monday through Sunday**.

P&L:

```text
Revenue
− Direct Operating Costs
= Gross Profit

Gross Profit
− Non-depreciation Operating Expenses
= EBITDA

EBITDA
− Depreciation & Amortization
= EBIT / Operating Profit

± Non-operating items
= Net Income
```

Depreciation is not deducted in EBITDA.

### 13.2 Balance Sheet

Balance Sheet is an **as-of-date** report.

Assets include:

- Cash/Bank;
- COD and rider receivables;
- Accounts Receivable;
- Prepayments;
- fixed assets less accumulated depreciation.

Liabilities include:

- Merchant Payable;
- Rider Payable;
- Accounts Payable;
- Payroll/expense accruals;
- COD liabilities.

Equity includes:

- Capital;
- Retained Earnings;
- current-period earnings.

Hard control:

```text
Assets − Liabilities − Equity = 0
```

A non-zero difference blocks formal period close.

### 13.3 Trial Balance

For each GL account:

- opening balance;
- debit movement;
- credit movement;
- closing balance.

Total debit and credit difference must be zero.

## 14. Executive Dashboard

Superadmin reporting includes:

- Revenue
- Gross Profit
- EBITDA
- Net Income
- Gross Margin %
- EBITDA Margin %
- Cash Position
- Accounts Receivable
- Accounts Payable
- COD Liability
- Merchant Liability
- Rider Liability
- Fixed Asset Net Book Value
- Working Capital
- revenue trends
- expense composition
- branch/merchant analysis
- rider/delivery cost ratio

## 15. Audit and Corrections

Superadmin Accounting Control includes:

- Journals
- Overrides
- Reversals
- Audit Ledger
- Chart of Accounts
- Accounting Periods
- Synchronization Monitor

The user-facing correction action is **Correct Entry**.

Internally it:

1. requires an override reason;
2. preserves the original source/journal;
3. posts a reversal where necessary;
4. creates the corrected replacement;
5. writes audit records;
6. links all versions.

## 16. Exports

### 16.1 Excel

The repository already includes `xlsx`.

Supported exports include:

- Weekly Financial Report
- Monthly Financial Statement
- General Ledger
- Trial Balance
- Journal Register
- Accounts Receivable
- Accounts Payable
- Asset Register
- Audit Ledger

A monthly workbook may include:

- Executive Summary
- Profit & Loss
- Balance Sheet
- Trial Balance
- General Ledger
- COD Reconciliation
- Assets
- Audit Summary

### 16.2 PDF

Formal monthly PDF structure:

1. Britium Express cover/header
2. Executive Summary
3. Profit & Loss
4. Balance Sheet
5. Key ratios
6. Notes/exceptions
7. Authorization signatures

Signature blocks:

- Prepared By
- Reviewed By
- Approved By

Closed-period exports derive from immutable period snapshots so historical downloads do not change later.

## 17. Period Close

Month-close checks include:

- Finance Review Queue resolved or justified;
- no unbalanced journals;
- COD reconciliation complete;
- merchant liabilities reconciled;
- rider liabilities reconciled;
- depreciation posted;
- payroll accrued;
- cash/bank checks complete;
- Trial Balance balanced;
- Balance Sheet balanced.

Only after those controls pass can an authorized user close the period.

## 18. Rollout Strategy

The ERP is introduced additively and does not replace existing operational workflows in one release.

### Phase 0 — Accounting Foundation

Deploy:

- Chart of Accounts;
- periods;
- events;
- journal tables;
- source links;
- audit controls;
- posting/reversal functions;
- RLS;
- reconciliation views.

No automatic posting.

### Phase 1 — Manual Source Forms

Enable:

- Daily Finance Entry;
- Assets & HR Costs.

Submissions enter Finance Review.

### Phase 2 — Read-Only Operational Synchronization

Connect adapters to:

- canonical parcel Finance projection;
- COD settlement;
- merchant settlement;
- rider commission/wallet;
- branch finance;
- HR/payroll;
- asset sources.

Events enter REVIEW_PENDING.

### Phase 3 — Shadow General Ledger

Approved events create journals, but financial statements are labeled **SHADOW / UAT**.

Run at least one complete weekly cycle and one month-end close simulation.

### Phase 4 — Financial Statement Activation

After reconciliation:

- P&L;
- Balance Sheet;
- Trial Balance;
- General Ledger

become production reporting sources.

### Phase 5 — Controlled Auto-Approval

Only low-risk, fully validated event types may later auto-post according to explicitly configured policy.

Exception/high-risk events remain Finance-reviewed.

### Phase 6 — Formal Close and Executive Reporting

Enable formal period close, retained earnings roll-forward, depreciation posting, financial snapshots, PDF/Excel reports, and executive dashboard.

## 19. Opening Balances and Historical Data

An ERP cutover requires an approved Opening Balance Journal as of the selected go-live date.

Opening evidence covers:

- cash/bank;
- receivables;
- COD/rider balances;
- merchant/rider/AP/payroll liabilities;
- fixed assets and accumulated depreciation;
- capital and retained earnings.

The opening journal must balance before posting.

Historical operational data is classified as:

- opening-balance evidence;
- intentionally backfilled verified transactions;
- operational history only.

The system does not blindly journalize all historical rows.

## 20. Cutover and Backfill Controls

An explicit **ERP Accounting Go-Live Date** prevents old operational edits from unexpectedly generating current accounting events.

Backfill jobs are idempotent and report:

- scanned;
- eligible;
- skipped;
- already imported;
- needs review;
- failed;
- posted;
- debit total;
- credit total.

Accounting mapping rules are versioned so later commercial changes do not reinterpret historical journals.

## 21. Failure Isolation and Feature Flags

Initial migrations are additive.

They do not rename or remove existing operational tables or RPC contracts.

Accounting synchronization failures must not block parcel operations.

Recommended feature flags:

- `ERP_UI_ENABLED`
- `ACCOUNTING_SYNC_ENABLED`
- `GL_POSTING_ENABLED`
- `FINANCIAL_REPORTS_ENABLED`

If a critical accounting issue occurs:

1. disable GL posting;
2. disable synchronization if required;
3. leave operational Finance workflows running;
4. preserve generated ERP data;
5. repair and reconcile;
6. re-enable.

## 22. UAT and Security Acceptance

Required functional tests include:

- delivery revenue recognition;
- COD collection/remittance;
- merchant settlement;
- rider commission accrual/payment;
- fuel/petty-cash expense;
- payroll accrual/payment;
- asset acquisition/depreciation;
- failed delivery/RTO;
- reversal/correction;
- duplicate synchronization prevention.

Required authorization tests include direct database/API attempts to:

- update locked Finance entries as Finance;
- update locked HR entries as Admin/HR;
- insert journals as an unauthorized user;
- mutate posted journals;
- gain accounting rights by modifying browser-visible metadata.

Security must be enforced by RLS/database authorization, not by hidden UI controls.

## 23. Production Acceptance Gates

The ERP Financial Ledger becomes authoritative only when:

1. every posted journal balances;
2. Trial Balance difference is zero;
3. Balance Sheet equation difference is zero;
4. duplicate source events are zero;
5. posted events without journals are zero;
6. journals without authorized sources/manual documents are zero;
7. COD reconciliation passes;
8. Merchant Payable reconciliation passes;
9. Rider balance reconciliation passes;
10. opening balances are approved;
11. fixed assets are reconciled;
12. Finance/Admin/Superadmin RLS tests pass;
13. correction/reversal workflow passes;
14. Excel/PDF outputs match ledger balances;
15. existing operations show no regression.

## 24. Explicit Design Decisions

The following decisions are fixed for this implementation:

1. **Existing Vite Enterprise Portal is extended; no portal-wide Next.js migration is part of this project.**
2. **General Ledger uses true double-entry accounting.**
3. **Finance Review Queue is the default gate between synchronized operations and posting.**
4. **Posted journals are immutable and corrected by reversal/replacement.**
5. **Canonical existing Britium Finance outputs remain authoritative for parcel/COD/settlement economics.**
6. **COD collected is not treated as Britium revenue.**
7. **Manual Finance entry cannot duplicate synchronized operational amounts.**
8. **P&L is period-based; Balance Sheet is as-of-date.**
9. **EBITDA excludes depreciation.**
10. **Official weekly reporting defaults to Monday–Sunday.**
11. **Historical data is not blindly backfilled; opening balances and verified backfill are controlled.**
12. **Accounting failures are isolated from logistics operations.**
13. **Formal financial reports rely on posted ledger data only.**
14. **RLS and database controls, not frontend visibility, enforce accounting permissions.**
15. **Production activation requires reconciliation and UAT gates to pass.**

## 25. Out of Scope for Initial ERP Release

The first release does not include:

- migration of the whole Enterprise Portal to Next.js;
- full inventory accounting for packaging stock;
- budgeting/forecasting;
- tax engine automation;
- bank API integrations;
- external auditor portal;
- multi-currency revaluation;
- statutory consolidation across separate legal entities;
- automated provider principal-versus-agent legal classification.

These can be added after the core ledger is stable.

## 26. Completion Definition

The design is implemented successfully when Britium Express can trace a financial statement amount through:

```text
P&L / Balance Sheet
→ Trial Balance / GL Account
→ Journal
→ Accounting Event
→ Operational Source
```

and management can reliably determine:

- what Britium earned;
- what operations cost;
- how much cash Britium controls;
- how much is owed by or to merchants, riders, employees, and suppliers;
- whether the enterprise is profitable for a selected period;
- whether the Balance Sheet is balanced;
- what changed, who approved it, and why.
