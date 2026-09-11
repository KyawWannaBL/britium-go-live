# Britium Dispatch + Way Management Production Patch

This patch rebuilds Dispatch and Way Management from the uploaded `britium_express_dispatch` project layout, but removes the old demo/mock/hardcoded data source pattern.

The attached reference app used a Dispatch board made of `StatsBar`, `ParcelPool`, `FleetGrid`, `StatusBoard`, and modal actions, plus a separate Wayplan map/fleet zoning module. This patch keeps that operating style but wires every screen to Supabase production workflow data only.

## Final pages to keep

Keep only these two enterprise portal pages:

```txt
Dispatch Command Center  -> /dispatch-command
Wayplan Command Center   -> /wayplan-command
```

Remove or redirect duplicate screens:

```txt
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

## Files

```txt
DispatchCommandCenterPage.tsx
WayplanCommandCenterPage.tsx
dispatch_waymanagement_production_sync.sql
App.dispatch_waymanagement_cleanup.tsx
rider_app_dispatch_sync_snippet.ts
redirect_pages/*.tsx
```

## Install

1. Run the SQL file in Supabase SQL Editor:

```txt
dispatch_waymanagement_production_sync.sql
```

2. Copy frontend files:

```txt
DispatchCommandCenterPage.tsx       -> src/pages/DispatchCommandCenterPage.tsx
WayplanCommandCenterPage.tsx        -> src/pages/WayplanCommandCenterPage.tsx
App.dispatch_waymanagement_cleanup.tsx -> src/App.tsx
```

3. Replace duplicate page files with redirect pages from:

```txt
redirect_pages/
```

or keep the route redirects already included in `App.dispatch_waymanagement_cleanup.tsx`.

4. Deploy:

```bash
npm run build
npx vercel --prod
```

5. Hard refresh:

```txt
Ctrl + Shift + R
```

## Backend APIs created

The SQL creates/repairs:

```txt
be_v_enterprise_dispatch_wayplans
be_v_enterprise_dispatch_jobs
be_v_rider_dispatch_jobs

be_enterprise_dispatch_snapshot()
be_way_management_snapshot()

be_publish_wayplan_to_dispatch()
be_publish_all_wayplans_to_dispatch()
be_assign_dispatch_job_to_asset()
be_driver_update_delivery_status()

be_upsert_dispatch_zone()
be_delete_dispatch_zone()
be_upsert_dispatch_asset()
be_delete_dispatch_asset()
```

Compatibility aliases are also created so old screens, if still imported, read the same canonical source:

```txt
be_dispatch_snapshot()
be_dispatch_center_snapshot()
be_live_dispatch_snapshot()
be_delivery_dispatch_snapshot()
be_delivery_workflow_snapshot()
be_ops_command_snapshot()
be_ops_manager_snapshot()
be_executive_ops_snapshot()
be_wayplan_management_snapshot()
be_wayplan_zone_snapshot()
```

## No demo/mock data

This patch does **not** create sample parcels or fake dispatch jobs.

It reads current production rows from:

```txt
be_wayplans
be_wayplan_items
be_v_wayplan_queue
```

and overlays live dispatch state through:

```txt
be_dispatch_job_assignments
```

The only seeded records are operational master configuration records for fleet assets, zones, and locations.

## Verify after SQL

```sql
select
  (select count(*) from public.be_v_enterprise_dispatch_wayplans) as dispatch_wayplans,
  (select count(*) from public.be_v_enterprise_dispatch_jobs) as dispatch_jobs,
  (select count(*) from public.be_v_rider_dispatch_jobs) as rider_visible_jobs;
```

Expected with the current UAT wayplan:

```txt
dispatch_jobs >= 30
```

Before publishing, `rider_visible_jobs` may be `0`.

After clicking **Publish** or **Publish All** in Dispatch Command Center:

```txt
rider_visible_jobs = dispatch_jobs
```

## Rider app wiring

Rider/driver app must read from:

```txt
be_v_rider_dispatch_jobs
```

When a rider taps Done/Failed/RTO, call:

```txt
be_driver_update_delivery_status()
```

Use:

```txt
rider_app_dispatch_sync_snippet.ts
```

## Export columns

Dispatch Excel/CSV export removes internal workflow columns and keeps only driver-useful fields:

```txt
Assigned Vehicle
Order ID
Township
Phone Number
Recipient
Address
Remarks
Status
```

The Excel export is UTF-8 HTML `.xls`, so Myanmar text remains readable without CSV encoding issues.
