# Britium Express V50 — Final Synchronization and Canonical Reconciliation

Build: `FINAL_SYNCHRONIZATION_V50_CANONICAL_RECONCILIATION_2026-07-30`

## Purpose

V50 implements Step 13 of the operating workflow. Operations Control or an authorized Supervisor refreshes the canonical parcel record and compares the final state across:

- Warehouse receipt and readiness
- Dispatch scan and Wayplan release
- Approved Mapbox route
- Rider route completion and final delivery outcome
- Finance COD clearance
- Customer Service communication closure
- Open operational alerts and failed-attempt/RTO consistency

A row may be certified for reporting only when all required module states agree and no open variance remains.

## Workflow

```text
Departmental final states
→ Refresh canonical data
→ Detect and assign variances
→ Correct the existing Way ID / Pickup ID
→ Recheck and clear variances
→ Certify for controlled reporting
```

V50 does not replace or directly edit departmental records. It reads their canonical ledgers and records reconciliation evidence. Source corrections must continue through the appropriate controlled RPC or operating screen.

## Files

- `final_synchronization_v50.sql`
- `verify_final_synchronization_v50.sql`
- `src/components/operations/FinalSynchronizationV50.tsx`
- `src/pages/UnifiedOperationsWorkflowPage.V50.tsx`
- `install_final_synchronization_v50.mjs`
- `verify_final_synchronization_v50.mjs`

The active route remains `/#/ops-workflow`.

## Backend installation

Run the complete file in Supabase SQL Editor:

```text
final_synchronization_v50.sql
```

Expected verification objects:

```text
be_final_sync_snapshot_v50(text,integer)
be_final_sync_refresh_v50(text)
be_final_sync_assign_variance_v50(bigint,text,text,text)
be_final_sync_resolve_variance_v50(bigint,text,text)
be_final_sync_certify_v50(text,text,text)
be_final_sync_certify_batch_v50(text[],text,text)
be_final_sync_status_v50(text)
be_final_sync_cases_v50
be_final_sync_variances_v50
be_final_sync_events_v50
```

Then run:

```text
verify_final_synchronization_v50.sql
```

To refresh the current Wayplan:

```sql
select public.be_final_sync_refresh_v50('WP-20260730-053113');
select public.be_final_sync_snapshot_v50('ALL', 500);
```

The current Wayplan may initially show variances such as `RIDER_ROUTE_NOT_FINAL`, `DELIVERY_NOT_FINAL`, `FINANCE_NOT_CLEAR`, or `CUSTOMER_CLOSURE_NOT_COMPLETE`. This is correct until the Rider, Finance, and Customer Service stages are actually completed.

## Frontend installation

Extract the flat-root ZIP directly beside `package.json` and `src`, then run:

```bash
node install_final_synchronization_v50.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_final_synchronization_v50.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY FINAL SYNCHRONIZATION V50
```

Then:

```bash
npx vercel --prod
```

## Production test

1. Open `/#/ops-workflow`.
2. Confirm the **Step 13 · Final Synchronization V50** panel appears.
3. Select **Refresh Canonical Data**.
4. Inspect each variance and assign an owner.
5. Correct the source record through Warehouse, Dispatch, Rider, Finance, or Customer Service as appropriate.
6. Select **Recheck & Resolve**; V50 will reopen the variance when the source remains inconsistent.
7. Certify only rows showing `READY_TO_CERTIFY` with zero open variances.
8. Export the controlled synchronization CSV.

A certified record becomes stale automatically when a later canonical refresh detects changed source data. It must then be reviewed and certified again before final reporting.

## Security

- Authenticated users receive no direct table mutation access.
- Reads and mutations use `SECURITY DEFINER` RPCs with a locked `search_path`.
- Refresh, assignment, resolution, and certification require an authorized Operations Control, Supervisor, Admin, Auditor, or Compliance role.
- Do not expose a Supabase service-role key through a `VITE_*` variable or browser bundle.
