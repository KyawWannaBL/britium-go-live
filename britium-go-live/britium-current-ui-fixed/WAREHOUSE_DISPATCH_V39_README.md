# Britium Warehouse / Dispatch V39

## Scope

V39 keeps warehouse receiving scans available but makes the requirement configurable by **Super Admin**.

- Default policy: warehouse receiving scan is **OPTIONAL**.
- Super Admin can switch the policy between `OPTIONAL` and `REQUIRED` with an audit reason.
- Under optional policy, warehouse staff can skip receiving scans for one Pickup ID with a recorded reason, actor and timestamp.
- Warehouse exceptions remain on hold and are never released by the skip action.
- Dispatch scanning is always mandatory and cannot be disabled by the receiving-scan setting.
- Publishing a wayplan and moving a parcel to `OUT_FOR_DELIVERY` are blocked until the parcel has a valid dispatch scan.
- Every failed delivery reverses its previous dispatch scan. The returned parcel must be scanned at Warehouse and scanned again for Dispatch before another attempt.
- Three consecutive failed delivery attempts for the same Way ID automatically change it to `RTO` / `RETURN_TO_SENDER`.
- Parcels remaining in Warehouse beyond 48 hours create warning alerts for Warehouse and Operations Supervisor.

## Alert scheduling

The SQL attempts to create an hourly `pg_cron` job named:

`be-v39-warehouse-dwell-alerts`

When `pg_cron` is not enabled or the current database role cannot create the job, the installation remains valid and dwell alerts refresh whenever `/warehouse` or `/warehouse-operations` is opened. For fully unattended alerts, enable Supabase `pg_cron`, rerun the V39 SQL and verify the scheduler status.

## Backend installation

Run the full file in Supabase SQL Editor:

`warehouse_dispatch_rto_alert_v39.sql`

The final verification row should include:

- `be_warehouse_receipt_snapshot_v39(text)`
- `be_set_warehouse_scan_policy_v39(boolean,text)`
- `be_warehouse_skip_receiving_scan_v39(text,text,text,text,text)`
- `be_dispatch_scan_parcel_v39(text,text,text)`
- `be_publish_wayplan_with_dispatch_scan_v39(text,text[],text)`
- `be_record_delivery_failure_v39(text,text,text,text)`
- `be_warehouse_return_scan_v39(text,text,text,text)`
- `be_refresh_warehouse_dwell_alerts_v39()`
- `be_warehouse_dwell_scheduler_status_v39()`
- `receiving_scan_required_default = false`
- `dwell_alert_hours = 48`
- `failed_attempts_before_rto = 3`

Then run:

```sql
select public.be_warehouse_dwell_scheduler_status_v39();
```

A fully automatic result contains `"mode":"HOURLY_DATABASE_JOB"`. A result containing `"mode":"ON_SCREEN_REFRESH"` means the alert logic works when the operational screens refresh, but `pg_cron` must be enabled for unattended hourly checks.

## Frontend installation

Extract every file from the flat-root ZIP directly beside `package.json` and `src`, then run:

```bash
node install_warehouse_dispatch_v39.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_warehouse_dispatch_v39.mjs
```

Deploy only after:

`SAFE TO DEPLOY WAREHOUSE / DISPATCH V39`

## Controlled test

1. Sign in as Super Admin and set Warehouse Receiving Scan to `OPTIONAL`.
2. Open `/warehouse`, select a test Pickup ID and use **Skip Receiving Scan for Pickup** with a reason.
3. Confirm eligible rows become `WAREHOUSE_READY`; exception rows remain on hold.
4. Open `/dispatch-command`. Confirm Publish and Out for Delivery are blocked until every relevant Way ID is dispatch-scanned.
5. Record one delivery failure. Confirm the dispatch scan becomes invalid and a Warehouse failed-return scan is required.
6. Scan the failed return at `/warehouse-operations`, mark it ready, dispatch-scan it again, and retry delivery.
7. Record three consecutive failures for one test Way ID. Confirm it becomes `RTO` and cannot be dispatched.
8. For a controlled test row, backdate `warehouse_entered_at` beyond 48 hours and run `select public.be_refresh_warehouse_dwell_alerts_v39();`. Confirm the warning appears in Warehouse and operational notification queues.

## Dependencies

Run after the Warehouse V36 and existing Waybill/Data Entry/Dispatch backend migrations. The guarded publish functions reuse the existing `be_publish_wayplan_to_dispatch` and `be_publish_all_wayplans_to_dispatch` RPCs.
