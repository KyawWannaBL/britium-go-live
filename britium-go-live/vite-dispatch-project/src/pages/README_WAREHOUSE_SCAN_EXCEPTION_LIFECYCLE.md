# Britium Warehouse Scan Lifecycle + Exception Board Patch

## Purpose

This patch updates the Warehouse screen so the table has the requested operational columns:

- Inbound Scan
- Dispatch Scan
- Return Scan 1
- Reason
- Return Scan 2
- Reason
- Return Scan 3
- Reason

It also wires the lifecycle to backend Supabase RPCs and the shared Exception screen.

## Files

```txt
WarehousePage.tsx                         -> src/pages/WarehousePage.tsx
ExceptionsPage.tsx                        -> src/pages/ExceptionsPage.tsx
warehouse_scan_lifecycle_columns_sync.sql -> Supabase SQL Editor
warehouse_scan_lifecycle_verification.sql -> Supabase SQL Editor verification
App.warehouse_exception_routes_snippet.tsx -> apply into src/App.tsx if routes still point to old pages
```

## Backend behavior

### Inbound scan

Warehouse staff clicks **Inbound Scan** or scans/enters the Delivery Way ID.

RPC:

```sql
public.be_warehouse_inbound_scan(
  p_tracking_no,
  p_actor_email,
  p_warehouse_code
)
```

Effect:

```txt
WH Status -> RECEIVED
inbound_scan_at is saved
inbound_scan_by is saved
```

### Dispatch scan

Before delivery, warehouse staff clicks **Dispatch Scan**.

RPC:

```sql
public.be_warehouse_dispatch_scan(
  p_tracking_no,
  p_actor_email,
  p_warehouse_code
)
```

Effect:

```txt
dispatch_scan_at is saved
warehouse_scan_status -> DISPATCH_SCANNED
dispatch_status -> OUT_FOR_DELIVERY
delivery_status -> OUT_FOR_DELIVERY
published_to_rider -> true
```

### End-day drop-off

At the end of the day, click **End Day: Mark Drop-off**.

RPC:

```sql
public.be_close_dispatch_day(
  p_wayplan_code,
  p_actor_email
)
```

Effect:

```txt
OUT_FOR_DELIVERY parcels with no return scan -> DROP_OFF
Returned parcels are not marked drop-off
RTO parcels are not changed
```

### Return scan attempts

Warehouse staff selects a reason from the exception-rule dropdown and clicks **Return Scan**.

RPC:

```sql
public.be_warehouse_return_scan(
  p_tracking_no,
  p_reason_code,
  p_actor_email,
  p_remark
)
```

Effect:

```txt
Attempt 1 -> return_scan_1_at + reason_1, priority next-wayplan
Attempt 2 -> return_scan_2_at + reason_2, priority next-wayplan
Attempt 3 -> return_scan_3_at + reason_3, RTO automatically
```

Every return scan creates an exception event in:

```txt
public.be_parcel_exception_events
```

and appears in:

```txt
public.be_v_exception_board
```

### Merchant exception access

Staff/admin users can see all exception events through:

```sql
public.be_exception_screen_snapshot(p_actor_email, p_merchant_code)
```

Merchant users are filtered by:

```txt
merchant_email
merchant_code
```

Merchant-specific RPC:

```sql
public.be_merchant_exception_screen_snapshot(p_merchant_code, p_actor_email)
```

## Install

1. Run this SQL in Supabase SQL Editor:

```txt
warehouse_scan_lifecycle_columns_sync.sql
```

2. Copy frontend files:

```txt
WarehousePage.tsx  -> src/pages/WarehousePage.tsx
ExceptionsPage.tsx -> src/pages/ExceptionsPage.tsx
```

3. Confirm routes in `src/App.tsx`:

```txt
/warehouse  -> WarehousePage
/exceptions -> ExceptionsPage
```

Use `App.warehouse_exception_routes_snippet.tsx` only if your route map is still pointing to old pages.

4. Build and deploy:

```bash
npm run build
npx vercel --prod
```

5. Hard refresh:

```txt
Ctrl + Shift + R
```

## Verify

Run:

```sql
select public.be_warehouse_scan_lifecycle_snapshot();
```

Then run:

```sql
select
  (select count(*) from public.be_v_warehouse_scan_lifecycle) as warehouse_rows,
  (select count(*) from public.be_v_warehouse_scan_lifecycle where warehouse_scan_status = 'RECEIVED') as received,
  (select count(*) from public.be_v_warehouse_scan_lifecycle where dispatch_scan_at is not null) as dispatch_scanned,
  (select count(*) from public.be_v_warehouse_scan_lifecycle where return_attempt_count > 0) as return_scanned,
  (select count(*) from public.be_v_warehouse_scan_lifecycle where next_attempt_priority) as priority_next_wayplan,
  (select count(*) from public.be_v_warehouse_scan_lifecycle where rto_at is not null or warehouse_scan_status = 'RTO') as rto,
  (select count(*) from public.be_v_exception_board where resolved_at is null) as open_exceptions;
```

## Operational notes

- The Warehouse table has horizontal scrolling because the lifecycle columns are wide.
- Reason dropdown is populated from `be_exception_rules`.
- Returned parcels go to priority for the next wayplan until attempt 3.
- Third failed/returned scan becomes RTO automatically.
- Exception screen is global for staff and filtered for merchant accounts.
