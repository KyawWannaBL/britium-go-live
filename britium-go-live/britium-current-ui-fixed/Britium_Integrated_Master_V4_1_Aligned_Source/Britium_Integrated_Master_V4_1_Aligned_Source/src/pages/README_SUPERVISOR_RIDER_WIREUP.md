# Britium Supervisor → Rider/Driver Wire-Up Patch

## What this patch fixes

1. CS pickup request appears in Supervisor queue.
2. Supervisor sees unread notification for new CS pickup.
3. Supervisor assignment calls `be_supervisor_assign_pickup()`.
4. The RPC resolves Rider/Driver/Helper by either email or code.
5. Assignment writes these fields into `be_portal_pickup_requests`:

```txt
assigned_rider_email
assigned_driver_email
assigned_helper_email
assigned_rider_code
assigned_driver_code
assigned_helper_code
assigned_vehicle_id
pickup_status = RIDER_ASSIGNED
workflow_stage = RIDER_ASSIGNED
supervisor_status = ASSIGNED
rider_status = ASSIGNED
```

6. Rider/Driver/Helper apps can read their jobs from:

```txt
be_v_mobile_workforce_jobs
be_v_rider_jobs
be_v_driver_jobs
be_v_helper_jobs
```

## Apply order

1. Run `supervisor_to_rider_driver_wireup.sql` in Supabase SQL Editor.
2. Replace `src/pages/SupervisorPickupPage.tsx` with `SupervisorPickupPage.wired.tsx`.
3. Replace `src/pages/SupervisorPortalPage.tsx` with `SupervisorPortalPage.wired.tsx`.
4. In rider/driver app, use the logic in `rider_driver_app_job_queue_snippet.ts`.

## Verify CS → Supervisor

```sql
select
  pickup_id,
  merchant_code,
  pickup_status,
  workflow_stage,
  supervisor_status,
  has_unread_notification,
  created_at
from public.be_v_supervisor_pickup_queue
order by created_at desc
limit 10;
```

Expected: new CS pickup appears with:

```txt
pickup_status = PICKUP_REQUESTED
workflow_stage = PICKUP_REQUESTED
supervisor_status = PENDING_ASSIGNMENT
has_unread_notification = true
```

## Verify Supervisor → Rider/Driver app

After assigning `P0620-APA-030` to `testrider@britiumexpress.com`:

```sql
select
  pickup_id,
  workforce_role,
  workforce_email,
  workforce_code,
  pickup_status,
  workflow_stage,
  rider_status,
  assigned_at
from public.be_v_mobile_workforce_jobs
where pickup_id = 'P0620-APA-030'
order by workforce_role;
```

Expected rows:

```txt
RIDER  testrider@britiumexpress.com  RIDER_ASSIGNED
DRIVER testdriver@britiumexpress.com RIDER_ASSIGNED
HELPER testhelper@britiumexpress.com RIDER_ASSIGNED
```

For rider-only app:

```sql
select pickup_id, workforce_email, pickup_status, rider_status
from public.be_v_rider_jobs
where workforce_email = 'testrider@britiumexpress.com'
order by assigned_at desc;
```

Expected: assigned pickup appears.

## Important frontend rule

Do not call old `be_assign_pickup_workforce()` from Supervisor pages anymore.

Use only:

```txt
be_supervisor_assign_pickup()
```

because it writes both code and email and creates the mobile notifications.
