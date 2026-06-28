
# Britium Unified Ops Workflow Sync Patch

## Problem fixed

The screenshots show these pages still displaying `0` even after the backend has valid wayplan / dispatch rows:

- Dispatch
- Dispatch Center
- Live Dispatch
- Delivery Dispatch
- Delivery Workflow
- Ops Command
- Ops Manager
- Executive Ops

Root cause: each page was reading a different old source, mock list, local filter, or stale table. The backend row exists, but the screens are not using the same canonical workflow API.

## New canonical page

Use this single page for the synchronized operational workflow:

```txt
Ops Workflow
/ops-workflow
```

The old routes are redirected to `/ops-workflow`.

## Backend API added

Run:

```txt
ops_workflow_unified_sync.sql
```

It creates:

```txt
be_v_operational_wayplans
be_v_operational_wayplan_items
be_unified_ops_workflow_snapshot()
```

It also creates compatibility RPC aliases:

```txt
be_dispatch_workflow_snapshot()
be_dispatch_center_snapshot()
be_live_dispatch_snapshot()
be_delivery_dispatch_snapshot()
be_ops_command_snapshot()
be_ops_manager_snapshot()
be_executive_ops_snapshot()
```

## Frontend files

Copy:

```txt
UnifiedOperationsWorkflowPage.tsx -> src/pages/UnifiedOperationsWorkflowPage.tsx
App.unified_ops_routes.tsx        -> src/App.tsx
```

Optional wrappers are included if you want old pages to render the unified page instead of route redirect:

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

## Verify SQL

```sql
select public.be_unified_ops_workflow_snapshot();

select
  (select count(*) from public.be_v_operational_wayplans) as wayplans,
  (select count(*) from public.be_v_operational_wayplan_items) as items;
```

Expected for the current UAT record:

```txt
wayplans >= 1
items >= 30
```

## Deploy

```bash
npm run build
npx vercel --prod
```

Then hard refresh:

```txt
Ctrl + Shift + R
```
