# Britium Enterprise Portal Full Sync Patch

This patch wires the remaining empty portal screens to the same live backend workflow already used by:

Data Entry → Warehouse → Wayplan → Dispatch → Rider App → Exceptions.

No demo, mock, or hardcoded operational rows are created.

## Run SQL first

Run:

```sql
rollback;
```

Then run the full file:

```text
enterprise_portal_full_sync.sql
```

## Copy frontend files

Copy:

```text
components/PortalLiveSnapshotPage.tsx -> src/components/PortalLiveSnapshotPage.tsx
lib/portalLiveApi.ts                  -> src/lib/portalLiveApi.ts

pages/SupervisorPortalPage.tsx        -> src/pages/SupervisorPortalPage.tsx
pages/SupervisorPickupPage.tsx        -> src/pages/SupervisorPickupPage.tsx
pages/SupervisorWayplanReviewPage.tsx -> src/pages/SupervisorWayplanReviewPage.tsx
pages/FinancePortalPage.tsx           -> src/pages/FinancePortalPage.tsx
pages/InvoiceStudioPage.tsx           -> src/pages/InvoiceStudioPage.tsx
pages/CODSettlementPage.tsx           -> src/pages/CODSettlementPage.tsx
pages/RiderSettlementPage.tsx         -> src/pages/RiderSettlementPage.tsx
pages/CustomerPortalPage.tsx          -> src/pages/CustomerPortalPage.tsx
pages/BranchOfficePortalPage.tsx      -> src/pages/BranchOfficePortalPage.tsx
```

Use:

```text
App.full_portal_sync_routes_snippet.tsx
```

to update `src/App.tsx`.

## Backend RPCs added

```text
be_enterprise_portal_healthcheck()
be_portal_sync_smoke_test()

be_supervisor_portal_snapshot()
be_supervisor_pickup_snapshot()
be_supervisor_wayplan_snapshot()

be_finance_portal_snapshot()
be_invoice_studio_snapshot()
be_cod_settlement_snapshot()
be_rider_settlement_snapshot(p_rider_email, p_work_date)

be_customer_portal_snapshot(p_tracking_no, p_phone, p_actor_email)
be_branch_office_portal_snapshot(p_branch_code, p_actor_email)
```

## Canonical live view

```text
be_v_portal_live_jobs
```

This view is built from `be_v_warehouse_scan_lifecycle`, so all screens read the same parcel lifecycle.

## Verify

Run:

```sql
select public.be_enterprise_portal_healthcheck();
select public.be_portal_sync_smoke_test();
```

Then run:

```sql
select
  (select count(*) from public.be_v_portal_live_jobs) as live_jobs,
  (select count(*) from public.be_v_rider_dispatch_jobs) as rider_jobs,
  (select count(*) from public.be_v_exception_board) as exceptions,
  (select count(*) from public.be_portal_pickup_requests) as pickup_requests;
```

For the current UAT case, `live_jobs` should be at least `30`.

## Deploy

```bash
npm run build
npx vercel --prod
```

Hard refresh:

```text
Ctrl + Shift + R
```

## Important

This patch assumes the earlier warehouse/dispatch lifecycle SQL has already succeeded:

```text
be_v_warehouse_scan_lifecycle
be_v_enterprise_dispatch_jobs
be_v_rider_dispatch_jobs
be_v_exception_board
```

Your previous verification already showed `warehouse_rows = 30`, so this prerequisite is satisfied.
