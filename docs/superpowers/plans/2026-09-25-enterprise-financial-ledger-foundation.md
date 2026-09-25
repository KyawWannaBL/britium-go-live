# Enterprise Financial Ledger Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the secure double-entry accounting core, immutable Finance/Admin source documents, accounting periods, assets, audit history, and atomic posting/reversal controls without changing existing logistics workflows.

**Architecture:** The existing Vite/Supabase application remains intact. New additive Supabase objects provide the accounting source of truth; posted journals are immutable, submitted source documents are locked, and privileged mutations go through narrowly scoped RPCs that authorize against Britium's server-side account registry rather than browser-editable metadata.

**Tech Stack:** Supabase PostgreSQL, PL/pgSQL, RLS, existing Vite/TypeScript repository conventions, SQL contract tests.

**Spec:** `docs/superpowers/specs/2026-09-25-enterprise-financial-ledger-design.md`

## Global Constraints

- Extend the existing Vite Enterprise Portal; do not migrate the portal to Next.js.
- All newly exposed `public` tables must have RLS enabled.
- Never authorize accounting access from browser-editable `user_metadata`.
- Posted journals are immutable; corrections use reversal plus replacement.
- Every posted journal must have total debit equal total credit.
- Accounting failures must not block existing logistics operations.
- MMK is the initial ledger currency.
- Existing Britium canonical finance calculations remain authoritative for operational economics.
- Create migrations with `supabase migration new <name>`; do not hand-invent timestamps.

## Review Focus

1. Duplicate posting attempts must return the existing journal or `ALREADY_POSTED`, never create a second financial effect; tested in Task 3.
2. Posting into a CLOSED period must fail atomically; tested in Task 3.
3. Finance/Admin direct writes to locked source documents or posted journals must be denied even if UI controls are bypassed; tested in Task 4.
4. Zero-sided, both-sided, negative, and unbalanced journal lines must be rejected; tested in Task 3.
5. A Superadmin correction must preserve the original journal and create linked reversal/replacement history; tested in Task 5.

---

### Task 1: Create the accounting schema and Chart of Accounts seed

**Files:**
- Create via CLI: migration named `enterprise_financial_ledger_foundation_v1` under `supabase/migrations/`
- Create: `tests/sql/enterprise_financial_ledger_foundation_v1.sql`

**Interfaces:**
- Consumes: existing `auth.uid()`, Britium role helpers and account registry.
- Produces: `be_chart_of_accounts`, `be_accounting_periods`, `be_accounting_events`, `be_accounting_event_lines`, `be_journal_entries`, `be_journal_lines`, `be_accounting_source_links`, `audit_logs`, `be_fixed_asset_register`, `be_asset_depreciation_schedule`, `be_financial_report_snapshots`.

- [ ] **Step 1: Create the migration file**

```bash
supabase --help
supabase migration new enterprise_financial_ledger_foundation_v1
```

Expected: a migration path under `supabase/migrations/`.

- [ ] **Step 2: Write the failing SQL contract**

```sql
do $$
begin
  if to_regclass('public.be_chart_of_accounts') is null then
    raise exception 'be_chart_of_accounts missing';
  end if;
  if to_regclass('public.be_journal_entries') is null then
    raise exception 'be_journal_entries missing';
  end if;
  if to_regclass('public.be_journal_lines') is null then
    raise exception 'be_journal_lines missing';
  end if;
  if to_regclass('public.be_accounting_events') is null then
    raise exception 'be_accounting_events missing';
  end if;
end $$;

select account_code, account_name
from public.be_chart_of_accounts
where account_code in ('1000','1100','1200','2000','2100','2200','3000','4000','4100','5000','6000')
order by account_code;
```

- [ ] **Step 3: Run the SQL contract and verify failure**

Discover current local DB syntax first:

```bash
supabase db --help
```

Run the contract against the disposable/local database using the supported query mechanism.

Expected: FAIL because the accounting tables do not yet exist.

- [ ] **Step 4: Implement schema and integrity checks**

Journal-line integrity must enforce one positive side only:

```sql
check (
  (debit_amount > 0 and credit_amount = 0)
  or
  (credit_amount > 0 and debit_amount = 0)
)
```

Add unique source identity:

```sql
create unique index be_accounting_source_links_identity_uq
on public.be_accounting_source_links (
  source_system,
  source_table,
  source_record_id,
  event_type,
  accounting_version
);
```

Seed a minimal Chart of Accounts for cash/bank, COD clearing, rider receivable, AR, fixed assets, accumulated depreciation, merchant/rider/AP/payroll liabilities, capital/retained earnings, delivery/COD/surcharge revenue, rider/fuel/packaging COGS, payroll/rent/utilities/admin/depreciation expenses.

- [ ] **Step 5: Enable RLS before granting authenticated access**

```sql
alter table public.be_chart_of_accounts enable row level security;
alter table public.be_accounting_periods enable row level security;
alter table public.be_accounting_events enable row level security;
alter table public.be_accounting_event_lines enable row level security;
alter table public.be_journal_entries enable row level security;
alter table public.be_journal_lines enable row level security;
alter table public.be_accounting_source_links enable row level security;
alter table public.audit_logs enable row level security;
alter table public.be_fixed_asset_register enable row level security;
alter table public.be_asset_depreciation_schedule enable row level security;
alter table public.be_financial_report_snapshots enable row level security;
```

Do not add permissive `using (true)` write policies.

- [ ] **Step 6: Re-run the SQL contract**

Expected: PASS and the seed query returns required account groups.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations tests/sql/enterprise_financial_ledger_foundation_v1.sql
git commit -m "feat: add enterprise accounting ledger foundation"
```

### Task 2: Add immutable Finance and Admin/HR source documents

**Files:**
- Create via CLI: migration named `enterprise_finance_source_documents_v1`
- Create: `tests/sql/enterprise_finance_source_documents_v1.sql`

**Interfaces:**
- Consumes: Task 1 accounting-event and asset tables.
- Produces: `finance_daily_logs`, `admin_assets_and_hr_logs`, `be_force_locked_submission_v1()`, `be_guard_locked_source_v1()`.

- [ ] **Step 1: Create migration**

```bash
supabase migration new enterprise_finance_source_documents_v1
```

- [ ] **Step 2: Write the failing lock contract**

```sql
insert into public.finance_daily_logs (
  entry_date, department_code, fuel_and_tolls_spent, is_locked
) values (date '2099-01-02', 'FINANCE', 1000, false);

do $$
declare v_locked boolean;
begin
  select is_locked into v_locked
  from public.finance_daily_logs
  where entry_date=date '2099-01-02' and department_code='FINANCE'
  order by created_at desc limit 1;
  if v_locked is distinct from true then
    raise exception 'submission was not forced locked';
  end if;
end $$;
```

Also assert the Admin/HR table exposes fixed-asset and overhead fields and ordinary mutation of a locked row fails.

- [ ] **Step 3: Run and verify failure**

Expected: missing relation/function errors.

- [ ] **Step 4: Implement source tables and triggers**

Use non-negative numeric checks. Add `submission_no`, `source_mode`, `accounting_event_id`, `submitted_at`, `soft_deleted_at`, `soft_deleted_by`, `override_reason`, and `version_no`.

Force lock:

```sql
new.is_locked := true;
new.submitted_at := coalesce(new.submitted_at, now());
```

The locked-row guard rejects ordinary UPDATE/DELETE; privileged correction must use the audited correction RPC added later.

- [ ] **Step 5: Re-run contract**

Expected: PASS; sending `is_locked=false` still persists as locked.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations tests/sql/enterprise_finance_source_documents_v1.sql
git commit -m "feat: add immutable finance and HR source documents"
```

### Task 3: Implement atomic journal posting and period enforcement

**Files:**
- Create via CLI: migration named `enterprise_journal_posting_v1`
- Create: `tests/sql/enterprise_journal_posting_v1.sql`

**Interfaces:**
- Consumes: events, event lines, periods, Chart of Accounts.
- Produces: `be_accounting_post_event_v1(p_event_id uuid) returns jsonb`.

- [ ] **Step 1: Write failing balanced-post test**

Use:

```text
Dr 1100 Cash/Bank                    14000
Cr 2100 Merchant COD Payable        10000
Cr 4000 Delivery Service Revenue     4000
```

Assert one posted journal and equal debit/credit totals.

- [ ] **Step 2: Add duplicate, closed-period, and malformed-line tests**

Second call for the same event must return the existing journal or `ALREADY_POSTED`.

Posting into a CLOSED period must return `PERIOD_CLOSED`.

Both-side-positive, negative, zero-sided, and unequal totals must fail before journal creation.

- [ ] **Step 3: Implement `be_accounting_post_event_v1`**

Validate authority, lock the event, require `review_status='APPROVED'`, require OPEN period and active/postable accounts, then calculate totals:

```sql
select
  coalesce(sum(debit_amount),0),
  coalesce(sum(credit_amount),0)
into v_debit, v_credit
from public.be_accounting_event_lines
where event_id=p_event_id;

if v_debit <= 0 or v_debit <> v_credit then
  return jsonb_build_object('ok',false,'code','JOURNAL_NOT_BALANCED');
end if;
```

Insert header/lines, mark event POSTED, write audit row, return journal ID/number.

- [ ] **Step 4: Re-run tests**

Expected: all scenarios PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations tests/sql/enterprise_journal_posting_v1.sql
git commit -m "feat: add atomic double-entry journal posting"
```

### Task 4: Add strict accounting RLS and role/capability helpers

**Files:**
- Create via CLI: migration named `enterprise_accounting_rls_v1`
- Create: `tests/sql/enterprise_accounting_rls_v1.sql`

**Interfaces:**
- Consumes: existing Britium server-side role registry/helpers.
- Produces: `be_accounting_can_v1(p_capability text) returns boolean` and restrictive RLS policies.

- [ ] **Step 1: Write failing authorization tests**

Test Finance, Admin/HR, ordinary authenticated, and Superadmin personas. Attempt to spoof browser/user metadata and verify authority does not change.

- [ ] **Step 2: Implement capability helper**

```sql
case p_capability
  when 'finance_entry' then v_role in ('finance','accountant','super_admin')
  when 'finance_review' then v_role in ('finance','accountant','super_admin')
  when 'journal_post' then v_role in ('finance','accountant','super_admin')
  when 'asset_entry' then v_role in ('admin','hr','super_admin')
  when 'period_close' then v_role in ('super_admin')
  when 'ledger_admin' then v_role in ('super_admin')
  else false
end
```

The value for `v_role` must come from the existing server-side registry/helper.

- [ ] **Step 3: Add RLS policies**

Use `TO authenticated` plus capability predicates. Do not permit direct journal DML for ordinary Finance users.

- [ ] **Step 4: Run authorization tests**

Expected: PASS.

- [ ] **Step 5: Run current Supabase security advisors**

Discover syntax first via CLI/MCP; resolve new critical findings caused by these objects.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations tests/sql/enterprise_accounting_rls_v1.sql
git commit -m "feat: enforce accounting RLS and capabilities"
```

### Task 5: Implement reversal, correction, depreciation, and period close controls

**Files:**
- Create via CLI: migration named `enterprise_accounting_controls_v1`
- Create: `tests/sql/enterprise_accounting_controls_v1.sql`

**Interfaces:**
- Consumes: posted journals, fixed assets, periods.
- Produces: `be_accounting_reverse_journal_v1(uuid,text)`, `be_accounting_correct_source_v1(...)`, `be_accounting_post_depreciation_v1(date)`, `be_accounting_close_period_v1(uuid,text)`.

- [ ] **Step 1: Write failing reversal test**

Post a journal, reverse with reason `Correct source amount`, and assert original remains POSTED; reversal references original; every line is inverted; audit contains reason.

- [ ] **Step 2: Write failing depreciation test**

Create a MMK 12,000,000 asset, zero residual value, 60-month life. Expect MMK 200,000 monthly depreciation:

```text
Dr Depreciation Expense        200000
Cr Accumulated Depreciation    200000
```

A second run for the same asset/month must not duplicate the journal.

- [ ] **Step 3: Write failing period-close test**

Closing with unresolved reconciliation blockers returns `CLOSE_BLOCKED`; after controls clear, it returns `CLOSED`.

- [ ] **Step 4: Implement RPCs**

Require non-empty reasons for reversal/correction/reopen. Never mutate posted lines in place. Link original, reversal, and replacement journals.

- [ ] **Step 5: Re-run tests**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations tests/sql/enterprise_accounting_controls_v1.sql
git commit -m "feat: add accounting reversal depreciation and close controls"
```

### Task 6: Verify foundation as a self-contained release

**Files:**
- Create: `scripts/verify-enterprise-ledger-foundation.mjs`
- Modify: `package.json` only if a repeatable verification script entry is required

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: repeatable foundation verification.

- [ ] **Step 1: Add verification script**

The script must fail on any non-zero contract result and print the failing contract name.

- [ ] **Step 2: Run application regression**

```bash
npm run build
npm run test:pricing
npm run test:workflow
```

Expected: PASS.

- [ ] **Step 3: Run all new SQL contracts**

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts tests/sql
git commit -m "test: verify enterprise ledger foundation"
```
