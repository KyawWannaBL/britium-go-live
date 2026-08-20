# Britium Dispatch Command Unified Enterprise Patch

## Why the old screens looked the same

The old sidebar had separate pages for:

- Dispatch
- Dispatch Center
- Live Dispatch
- Delivery Dispatch
- Delivery Workflow
- Ops Command
- Ops Manager
- Executive Ops

They were overlapping operational views, and several were reading old/stale sources. That is why they showed the same empty `0` result even after the backend wayplan records existed.

## Final decision

Keep one operational screen only:

```txt
Dispatch Command Center
/dispatch-command
```

Keep Wayplan separately:

```txt
Wayplan Command Center
/wayplan-command
```

Wayplan Command is for generating/assigning wayplans.
Dispatch Command is for publishing those wayplans to the rider/driver app and tracking delivery progress.

## Files

```txt
dispatch_enterprise_sync.sql              -> run in Supabase SQL Editor
DispatchCommandCenterPage.tsx             -> src/pages/DispatchCommandCenterPage.tsx
App.dispatch_command_cleanup.tsx          -> src/App.tsx
rider_app_dispatch_jobs_snippet.ts         -> integrate into Rider app loading/action code
dispatch_enterprise_verify.sql            -> verification SQL
```

Redirect wrappers are included for the old duplicate pages:

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

Copy them to `src/pages/` if you want file-level redirects in addition to route redirects.

## Backend objects created

```txt
be_v_enterprise_dispatch_wayplans
be_v_enterprise_dispatch_jobs
be_v_rider_dispatch_jobs

be_enterprise_dispatch_snapshot()
be_publish_wayplan_to_dispatch(wayplan_code, actor_email)
be_driver_update_delivery_status(tracking_no, status, actor_email, note)
```

Compatibility aliases are also added, so old RPC names can still return the same unified snapshot.

## Sidebar cleanup

Only keep these two menu items under Dispatch & Routing:

```txt
Dispatch Command  -> /dispatch-command
Wayplan Command   -> /wayplan-command
```

Remove/hide:

```txt
Dispatch
Dispatch Center
Live Dispatch
Delivery Dispatch
Delivery Workflow
```

Remove/hide these overlapping management dashboards, or route them to Dispatch Command:

```txt
Ops Command
Ops Manager
Executive Ops
```

## Install

1. Run:

```sql
dispatch_enterprise_sync.sql
```

2. Copy files:

```txt
DispatchCommandCenterPage.tsx    -> src/pages/DispatchCommandCenterPage.tsx
App.dispatch_command_cleanup.tsx -> src/App.tsx
```

3. Optional: copy redirect wrappers to `src/pages/`.

4. Deploy:

```bash
npm install xlsx
npm run build
npx vercel --prod
```

5. Hard refresh:

```txt
Ctrl + Shift + R
```

## Rider app sync

Rider/driver app should read:

```txt
be_v_rider_dispatch_jobs
```

When rider/driver taps Done or Failed, call:

```txt
be_driver_update_delivery_status()
```

This updates the same backend source used by the enterprise portal, so Dispatch Command, Live view, Ops view, and Rider app stay synchronized.

## Verification

Run:

```sql
select
  (select count(*) from public.be_v_enterprise_dispatch_wayplans) as dispatch_wayplans,
  (select count(*) from public.be_v_enterprise_dispatch_jobs) as dispatch_jobs,
  (select count(*) from public.be_v_rider_dispatch_jobs) as rider_visible_jobs;
```

For your current UAT data, `dispatch_jobs` should be `30` for `WP0620-APA-030`. `rider_visible_jobs` becomes visible after clicking **Publish to Rider App** in Dispatch Command Center.
