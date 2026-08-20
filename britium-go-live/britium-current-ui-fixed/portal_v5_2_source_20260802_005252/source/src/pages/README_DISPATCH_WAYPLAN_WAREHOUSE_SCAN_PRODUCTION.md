# Britium Dispatch + Wayplan + Warehouse Scan Production Patch

## What this patch adds

This patch wires the current live workflow across:

- Wayplan Command Center
- Dispatch Command Center
- Warehouse Scan Center
- Exception Center
- Rider/Driver app backend views

It removes the practical need for duplicate screens and keeps only the production workflow sources.

## Screens to keep

Keep these sidebar items:

```text
Dispatch Command
Wayplan Command
Warehouse
Exceptions
```

Hide/remove or redirect these duplicates:

```text
Dispatch
Dispatch Center
Live Dispatch
Delivery Dispatch
Delivery Workflow
Ops Command
Ops Manager
Executive Ops
Way Management
Way Management Plan
Wayplan Zone
Wayplan Management Go Live
```

## Files to copy

```text
DispatchCommandCenterPage.tsx      -> src/pages/DispatchCommandCenterPage.tsx
WayplanCommandCenterPage.tsx       -> src/pages/WayplanCommandCenterPage.tsx
WarehousePage.scan_lifecycle.tsx   -> src/pages/WarehousePage.tsx
ExceptionsPage.tsx                 -> src/pages/ExceptionsPage.tsx
App.route_cleanup_snippet.tsx      -> use to update src/App.tsx routes/sidebar
```

Optional redirect replacements are in:

```text
redirect_pages/
```

## SQL to run

Run this file in Supabase SQL Editor:

```text
dispatch_wayplan_warehouse_scan_sync.sql
```

It creates/updates:

```text
be_exception_rules
be_parcel_exception_events
be_v_warehouse_scan_lifecycle
be_v_exception_board
be_warehouse_inbound_scan()
be_warehouse_dispatch_scan()
be_warehouse_return_scan()
be_close_dispatch_day()
be_generate_wayplans_by_fleet()
be_warehouse_scan_lifecycle_snapshot()
be_exception_screen_snapshot()
be_merchant_exception_screen_snapshot()
```

## New workflow

### Warehouse

1. Inbound Scan  
   - Staff scans the parcel.
   - `WH status` becomes `RECEIVED`.

2. Dispatch Scan  
   - Staff scans before loading/rider handoff.
   - Status becomes `OUT_FOR_DELIVERY`.

3. End of day no-return close  
   - Dispatch Command can run `Close Day Drop Off`.
   - Any parcel still `OUT_FOR_DELIVERY` with no return scan becomes `DROP_OFF`.

4. Return Scan 1/2/3  
   - Staff scans returned parcel.
   - Staff selects reason from exception rules dropdown.
   - Attempts 1 and 2 become priority for next wayplan.
   - Attempt 3 becomes RTO automatically.
   - Exception is inserted into the Exception Center.

### Wayplan

Click **Generate** to assign current live wayplan jobs to vans/riders based on configured fleet zoning.

### Dispatch

Parcel cards now include:

```text
Out
Done
Fail
RTO
```

`Out` means `OUT_FOR_DELIVERY`.

### Manifest

Both Dispatch and Wayplan pages generate print-ready manifest pages grouped by van/rider. The layout follows the attached manifest print-ready HTML style: A4 pages, Pyidaungsu/Myanmar font, meta table, parcel table, totals, and signature blocks.

## Verification queries

```sql
select public.be_warehouse_scan_lifecycle_snapshot();

select
  (select count(*) from public.be_v_warehouse_scan_lifecycle) as warehouse_rows,
  (select count(*) from public.be_v_exception_board) as exceptions,
  (select count(*) from public.be_v_rider_dispatch_jobs) as rider_jobs;
```

## Deploy

```bash
npm run build
npx vercel --prod
```

Then hard refresh:

```text
Ctrl + Shift + R
```
