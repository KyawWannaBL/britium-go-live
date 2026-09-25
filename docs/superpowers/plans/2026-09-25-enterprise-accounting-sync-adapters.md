# Enterprise Accounting Synchronization Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert existing Britium operational finance results into idempotent Finance Review Queue events without changing or blocking logistics workflows.

**Architecture:** Synchronization is pull/batch based and failure-isolated. Adapter functions read authoritative operational sources, normalize economic events into `be_accounting_events` plus proposed lines, record per-source fingerprints, and never directly change the General Ledger; posting remains a separate Finance-controlled operation.

**Tech Stack:** Supabase PostgreSQL/PLpgSQL, existing canonical finance projection, COD settlement V93, merchant settlement queue, rider wallet/commission tables, HR/branch finance tables, SQL contract tests.

**Spec:** `docs/superpowers/specs/2026-09-25-enterprise-financial-ledger-design.md`

## Global Constraints

- Canonical Britium financial outputs win over duplicated UI/register values.
- COD collection is not Britium revenue.
- Synchronization must be idempotent and safe to rerun.
- A sync failure must not abort or roll back the operational source transaction.
- Existing `HOLD_EXCEPTION` and operational exception states must block posting eligibility.
- Manual Finance entries must not duplicate synchronized operational events.
- Create new migrations with `supabase migration new <name>`.

## Review Focus

1. The same waybill represented in multiple source tables must create one economic event using canonical precedence; tested in Task 2.
2. COD remittance after revenue recognition must move assets only and create no second revenue; tested in Task 3.
3. Source changes after posting must create change-detection/adjustment review rather than silently replacing posted history; tested in Task 6.
4. `HOLD_EXCEPTION` COD rows must remain non-postable until resolved; tested in Task 3.
5. One malformed source row in a batch must be logged as failed while valid rows continue syncing; tested in Task 6.

---

### Task 1: Add synchronization infrastructure and accounting mappings

**Files:**
- Create via CLI: migration named `enterprise_accounting_sync_infrastructure_v1`
- Create: `tests/sql/enterprise_accounting_sync_infrastructure_v1.sql`

**Interfaces:**
- Consumes: ledger foundation tables.
- Produces: `be_accounting_sync_runs`, `be_accounting_sync_errors`, `be_accounting_mappings`, `be_accounting_upsert_event_v1(...)`.

- [ ] **Step 1: Create migration**

```bash
supabase migration new enterprise_accounting_sync_infrastructure_v1
```

- [ ] **Step 2: Write failing idempotency test**

Create one source identity twice with an identical fingerprint and assert the helper returns the same event ID and `created=false` on the second call.

- [ ] **Step 3: Implement mapping and sync-run tables**

`be_accounting_mappings` must include:
- `event_type`;
- debit account;
- credit account;
- optional provider/branch conditions;
- `mapping_version`;
- `effective_from`;
- `effective_to`;
- `is_active`.

Implement source upsert so identical fingerprint is a no-op while a changed fingerprint is detectable.

- [ ] **Step 4: Re-run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations tests/sql/enterprise_accounting_sync_infrastructure_v1.sql
git commit -m "feat: add accounting sync infrastructure"
```

### Task 2: Implement delivered-waybill revenue and merchant-liability adapter

**Files:**
- Create via CLI: migration named `enterprise_delivery_accounting_adapter_v1`
- Create: `tests/sql/enterprise_delivery_accounting_adapter_v1.sql`

**Interfaces:**
- Consumes: `be_finance_calculation_projection_v4`, canonical merchant settlement source.
- Produces: `be_accounting_sync_delivery_v1(p_from date,p_to date) returns jsonb`.

- [ ] **Step 1: Write failing canonical-precedence test**

Prepare data where the same delivery appears in a legacy parcel row and the canonical projection. Assert exactly one `DELIVERY_REVENUE_RECOGNIZED` event is produced and its source snapshot carries the canonical calculation version.

- [ ] **Step 2: Write the expected accounting-line test**

For MMK 14,000 collection with MMK 4,000 Britium entitlement and MMK 10,000 merchant liability:

```text
Dr COD Unallocated Clearing         14000
Cr Merchant COD Payable             10000
Cr Delivery Service Revenue          4000
```

Assert total debit equals total credit.

- [ ] **Step 3: Implement adapter**

Only validated delivered/financially eligible rows are eligible. Preserve `delivery_way_id`, merchant, branch, source snapshot, calculation version, and fingerprint.

- [ ] **Step 4: Re-run tests**

Expected: one event, canonical values, balanced proposal.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations tests/sql/enterprise_delivery_accounting_adapter_v1.sql
git commit -m "feat: sync delivery revenue into accounting review"
```

### Task 3: Implement COD collection and rider-remittance adapter

**Files:**
- Create via CLI: migration named `enterprise_cod_accounting_adapter_v1`
- Create: `tests/sql/enterprise_cod_accounting_adapter_v1.sql`

**Interfaces:**
- Consumes: `be_finance_cod_settlements_v48`, `be_wayplan_cod_settlements`, V93 state.
- Produces: `be_accounting_sync_cod_v1(p_from date,p_to date) returns jsonb`.

- [ ] **Step 1: Write failing COD lifecycle test**

Collection:

```text
Dr Rider COD Receivable        14000
Cr COD Unallocated Clearing    14000
```

Remittance:

```text
Dr Cash / Bank                 14000
Cr Rider COD Receivable        14000
```

Assert the remittance event contains no Revenue account.

- [ ] **Step 2: Write `HOLD_EXCEPTION` test**

Create a source row with `settlement_status='HOLD_EXCEPTION'`. Sync must create/retain a HELD event and not mark it posting-eligible.

- [ ] **Step 3: Implement adapter**

Preserve settlement reference, rider, wayplan, delivery Way ID, expected/reported/settled amount, hold code/note, source date and fingerprint.

- [ ] **Step 4: Re-run tests**

Expected: lifecycle balanced, no duplicate revenue, hold respected.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations tests/sql/enterprise_cod_accounting_adapter_v1.sql
git commit -m "feat: sync COD lifecycle into accounting review"
```

### Task 4: Implement merchant settlement adapter

**Files:**
- Create via CLI: migration named `enterprise_merchant_settlement_adapter_v1`
- Create: `tests/sql/enterprise_merchant_settlement_adapter_v1.sql`

**Interfaces:**
- Consumes: canonical merchant settlement queue/batch.
- Produces: `be_accounting_sync_merchant_settlements_v1(p_from date,p_to date) returns jsonb`.

- [ ] **Step 1: Write failing merchant-payment test**

Expected proposal:

```text
Dr Merchant COD Payable
Cr Bank / Cash
```

Assert no revenue/expense line is generated by the payment event.

- [ ] **Step 2: Write merchant-receivable direction test**

If canonical settlement direction indicates merchant owes Britium, assert the adapter uses Merchant Accounts Receivable rather than forcing a negative Merchant Payable.

- [ ] **Step 3: Implement adapter**

Read only the canonical settlement result and approved batch/payment state. Store settlement reference/batch/merchant in the event snapshot.

- [ ] **Step 4: Re-run tests and commit**

```bash
git add supabase/migrations tests/sql/enterprise_merchant_settlement_adapter_v1.sql
git commit -m "feat: sync merchant settlement into accounting review"
```

### Task 5: Implement rider commission, HR, branch finance, manual expense, and fixed-asset adapters

**Files:**
- Create via CLI: migration named `enterprise_internal_accounting_adapters_v1`
- Create: `tests/sql/enterprise_internal_accounting_adapters_v1.sql`

**Interfaces:**
- Consumes: `commission_runs`, `commission_items`, `wallet_transactions`, `finance_daily_logs`, `admin_assets_and_hr_logs`, `branch_office_finance_entries`, fixed asset register.
- Produces: `be_accounting_sync_rider_commissions_v1`, `be_accounting_sync_manual_finance_v1`, `be_accounting_sync_hr_assets_v1`, `be_accounting_sync_branch_finance_v1`.

- [ ] **Step 1: Write rider commission tests**

Accrual:

```text
Dr Rider Commission Expense
Cr Rider Commission Payable
```

Payment:

```text
Dr Rider Commission Payable
Cr Bank / Cash
```

Pending/unapproved wallet transactions produce no posting-eligible event.

- [ ] **Step 2: Write Finance expense tests**

Fuel paid from petty cash:

```text
Dr Fuel & Tolls Expense
Cr Petty Cash
```

AP-incurred expense:

```text
Dr configured expense account
Cr Accounts Payable
```

- [ ] **Step 3: Write payroll/overtime tests**

```text
Dr Payroll Expense
Cr Payroll Payable

Dr Warehouse Overtime Expense
Cr Payroll Payable
```

- [ ] **Step 4: Write fixed-asset acquisition test**

Cash acquisition:

```text
Dr selected Fixed Asset account
Cr Bank / Cash
```

Below the configured capitalization threshold, assert the configured expense account is used instead.

- [ ] **Step 5: Implement all internal adapters**

Manual expense requires explicit funding source. Manual AR/AP requires counterparty/reference and offset account/reason. Reject source documents that duplicate an existing synchronized economic event.

- [ ] **Step 6: Re-run tests and commit**

```bash
git add supabase/migrations tests/sql/enterprise_internal_accounting_adapters_v1.sql
git commit -m "feat: sync commissions HR assets and manual finance"
```

### Task 6: Implement source-change detection and batch orchestration

**Files:**
- Create via CLI: migration named `enterprise_accounting_sync_orchestration_v1`
- Create: `tests/sql/enterprise_accounting_sync_orchestration_v1.sql`

**Interfaces:**
- Consumes: Tasks 1–5 adapters.
- Produces: `be_accounting_sync_run_v1(p_from date,p_to date,p_sources text[] default null) returns jsonb`, source-change detection, per-row errors.

- [ ] **Step 1: Write failing fingerprint-drift test**

Sync and POST an event. Modify the operational source amount. Rerun sync and assert:
- original posted journal remains unchanged;
- a change-detection/adjustment-review event is created or flagged;
- source link retains old/new fingerprints.

- [ ] **Step 2: Write failing partial-batch test**

Create two valid source rows and one malformed row. Expected summary:

```json
{"scanned":3,"synced":2,"failed":1}
```

The two valid events must remain available.

- [ ] **Step 3: Implement orchestration**

Process each source row inside isolated exception handling so a bad source writes `be_accounting_sync_errors` and processing continues.

- [ ] **Step 4: Re-run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations tests/sql/enterprise_accounting_sync_orchestration_v1.sql
git commit -m "feat: orchestrate fault-isolated accounting synchronization"
```

### Task 7: Add repeatable synchronization verification

**Files:**
- Create: `scripts/verify-enterprise-accounting-sync.mjs`
- Modify: `package.json` only to add `test:accounting-sync`

**Interfaces:**
- Consumes: all adapter RPCs.
- Produces: repeatable anti-double-counting and reconciliation checks.

- [ ] **Step 1: Implement checks**

The script must fail if:
- duplicate source identity exists;
- any event proposal is unbalanced;
- a HELD event is posting-eligible;
- any COD remittance event includes a Revenue account.

- [ ] **Step 2: Run regression**

```bash
npm run build
npm run test:workflow
npm run test:accounting-sync
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts package.json
git commit -m "test: verify enterprise accounting synchronization"
```
