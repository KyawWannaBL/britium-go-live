# Rider delivery timeout regression gate (V219)

Production incident: DeliveryWayID `D1114-KSC-0116`, 2026-11-16. The original `be_cs_closure_stop_sync_trigger_v49` called `be_cs_closure_sync_v49(wayplan)` which synchronously invoked `be_finance_cod_sync_v48(wayplan)`. The PostgreSQL log context confirms the V48 `INSERT ... SELECT ... ON CONFLICT` statement was cancelled during `be_field_team_confirm_delivery_v146` after `be_field_team_delivery_action_v77` updated the rider route stop.

## Applied migration

Version `20261116154736` `fix_rider_delivery_timeout_defer_finance_cod_v219` is **already applied to the Production Supabase database**. The SQL file here records the exact verified definitions for source-control synchronization. Do not reapply manually to the same Production branch.

- `be_cs_closure_sync_v49` no longer calls the whole-wayplan Finance V48 reconciliation inside the rider transaction. Its CS closure upsert and existing terminal-status safeguards remain in place.
- `be_delivery_finance_outbox_process_v1` continues performing V48 Finance/COD reconciliation and accounting/wallet updates, and now invokes `be_cs_closure_sync_v49(wayplan)` once Finance has been reconciled. Scheduler-only authorization, existing 90s statement timeout, and retries remain unchanged.
- Existing `be_finance_cod_stop_sync_trigger_v48` and `be_sync_delivered_financial_pipeline_v189` already enqueue via `be_delivery_finance_outbox_enqueue_v1`. Existing `pg_cron` job 3 runs the outbox worker every minute.

## Verification performed

- Read-back SQL verified the CS function has **no inline** `be_finance_cod_sync_v48` call and the worker retains `DATABASE_SCHEDULER_ONLY` plus the post-Finance CS projection.
- A `BEGIN; SET LOCAL statement_timeout='5s'; SELECT be_cs_closure_sync_v49('<wayplan>'); ROLLBACK;` test on the impacted wayplan returned success, `synced_rows=9` (transaction rolled back).
- The scheduled worker's most recent observed job run was `succeeded` at 2026-11-16 15:49 UTC.
- Canonical delivery remains `ARRIVED_AT_CUSTOMER` and `geo_verified=true` at the last check, not DELIVERED. COD remains **43,500 MMK**, with collected amount 0 because the failed delivery transactions rolled back. **Rider must retry using legitimate recipient proof/signature and COD collection.** Do not manually force status or financial settlement.

## Release gates

1. Keep production branch and UAT schema recovery separate.
2. Rider with assigned `RID012` completes delivery once through the app; check canonical stop state, proof, COD and outbox row.
3. Confirm `be_delivery_finance_outbox_v1` progresses `PENDING -> COMPLETE` and `be_cs_closure_v49` has updated finance status after scheduler.
4. Check new `postgres_logs` for statement timeouts from `be_field_team_confirm_delivery_v146`, `be_finance_cod_sync_v48`, and scheduler retries.
5. No new authenticated or anon grants, no changes to COD arithmetic or RLS.
