# Britium Express Rider Delivery V46

## Purpose

Rider V46 continues the approved Wayplan workflow after Supervisor approval and mandatory Dispatch scanning.

```text
DISPATCHED
-> assigned Rider/Driver accepts the route
-> route starts inside the Britium Head Office GPS radius
-> Rider follows the saved Mapbox V45 sequence
-> each stop is arrived, delivered, failed, or RTO
-> route completes with a full audit trail
```

## Controls added

- Only the Rider or Driver assigned on the Wayplan may initialize and execute the route.
- The Wayplan must already be published by Dispatch.
- The route must have a saved Mapbox V45 plan.
- Route start is blocked outside the configured Head Office radius. Default: 1,000 metres.
- Delivery stop order is enforced by the backend.
- Stop arrival captures GPS and reports whether it is inside the configured stop radius.
- Existing delivery proof, COD, signature, failure-count, and three-failure RTO functions remain active.
- Delivered, failed, and RTO results are synchronized into the V46 route run.
- A route finishes as `COMPLETED` or `COMPLETED_WITH_EXCEPTIONS`.
- Action operation IDs are stored for retry-safe execution.

## Prerequisites

Install and verify these versions first:

- Warehouse / Dispatch V39
- Wayplan membership V40
- Supervisor approval / guarded Dispatch V43
- Assignment modes V44 / V44.1
- Mapbox Head Office route V45
- `VITE_MAPBOX_ACCESS_TOKEN` configured in local and Vercel environments

## 1. Install the SQL

Run the complete file in Supabase SQL Editor:

```text
rider_delivery_execution_v46.sql
```

Expected verification objects:

```text
be_rider_route_snapshot_v46(text,text)
be_rider_accept_route_v46(text,text,text)
be_rider_start_route_v46(text,text,numeric,numeric,text)
be_rider_arrive_stop_v46(text,text,text,numeric,numeric,text)
be_rider_record_stop_result_v46(text,text,text,text,text,jsonb)
be_rider_route_status_v46(text)
be_rider_route_runs_v46
be_rider_route_stop_state_v46
```

## 2. Install the frontend

Extract the package directly beside `package.json` and `src`.

```bash
node install_rider_delivery_v46.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_rider_delivery_v46.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY RIDER DELIVERY V46
```

Then deploy:

```bash
npx vercel --prod
```

## Production test

1. Create, approve, Dispatch-scan, and publish a Wayplan with a saved V45 route.
2. Sign in as the Rider assigned to the Wayplan.
3. Open Deliveries and confirm the V46 execution panel appears.
4. Select **Accept Route**.
5. At Britium Head Office, select **Start at Head Office**.
6. Confirm the current stop is stop 1.
7. Attempt to arrive at a later stop and confirm the backend rejects the out-of-order action.
8. Select **Arrive Current Stop** and verify the GPS result.
9. Complete the parcel with receiver, COD, signature, and proof.
10. Confirm the current stop advances to the next Mapbox stop.
11. Record one failed attempt and confirm V39 failure counting remains active.
12. Complete the final stop and confirm the route becomes `COMPLETED` or `COMPLETED_WITH_EXCEPTIONS`.

## Configuration

The default radii are stored in `be_rider_route_settings_v46`:

```sql
select *
from public.be_rider_route_settings_v46
order by setting_key;
```

To change the Head Office start radius to 1,500 metres:

```sql
update public.be_rider_route_settings_v46
set numeric_value = 1500,
    updated_at = now()
where setting_key = 'head_office_start_radius_m';
```

Do not make the radius so large that Riders can start routes away from Head Office.
