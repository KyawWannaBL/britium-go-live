# Dispatch Command Board Final Patch

This patch replaces the duplicated Dispatch, Dispatch Center, Live Dispatch, Delivery Dispatch, Delivery Workflow, Ops Command, Ops Manager and Executive Ops screens with one operational screen:

```txt
Dispatch Command Center
/dispatch-command
```

## Why

The previous pages looked different but were reading different stale sources. The unified page reads only:

```txt
public.be_enterprise_dispatch_snapshot()
public.be_v_enterprise_dispatch_wayplans
public.be_v_enterprise_dispatch_jobs
public.be_v_rider_dispatch_jobs
```

and uses the same RPCs as the rider/driver app:

```txt
public.be_publish_wayplan_to_dispatch()
public.be_driver_update_delivery_status()
```

## Screen included

`DispatchCommandCenterPage.tsx` is based on the requested dispatch board layout:

```txt
Header: Sync Fresh + Report
Stats bar
Left: Parcel Pool
Middle: Fleet / Wayplan Grid
Right: Status Board
Parcel detail modal
Publish to Rider App
Done / Failed / Out for Delivery status actions
```

## Install

1. Run SQL:

```txt
dispatch_command_board_sync.sql
```

2. Copy files:

```txt
DispatchCommandCenterPage.tsx        -> src/pages/DispatchCommandCenterPage.tsx
App.dispatch_command_board_cleanup.tsx -> src/App.tsx
```

Optional redirect replacement files:

```txt
DispatchPage.tsx
DispatchCenterPage.tsx
LiveDispatchWayplanBoard.tsx
DeliveryDispatchPage.tsx
DeliveryWorkflowPage.tsx
OpsCommandPage.tsx
OpsManagerPage.tsx
ExecutiveOpsPage.tsx
```

3. Rider app:

Use `rider_app_dispatch_jobs_snippet.ts` in the rider/driver app screens so they read:

```txt
be_v_rider_dispatch_jobs
```

and update delivery status through:

```txt
be_driver_update_delivery_status()
```

## Sidebar after cleanup

Keep only:

```txt
Dispatch Command
Wayplan Command
```

Remove/hide:

```txt
Dispatch
Dispatch Center
Live Dispatch
Delivery Dispatch
Delivery Workflow
Ops Command
Ops Manager
Executive Ops
```

## Verify backend

```sql
select public.be_enterprise_dispatch_snapshot();

select
  (select count(*) from public.be_v_enterprise_dispatch_wayplans) as dispatch_wayplans,
  (select count(*) from public.be_v_enterprise_dispatch_jobs) as dispatch_jobs,
  (select count(*) from public.be_v_rider_dispatch_jobs) as rider_visible_jobs;
```

Expected for the current test flow:

```txt
dispatch_jobs = 30
rider_visible_jobs = 30
```

## Deploy

```bash
npm run build
npx vercel --prod
```

Hard refresh:

```txt
Ctrl + Shift + R
```
