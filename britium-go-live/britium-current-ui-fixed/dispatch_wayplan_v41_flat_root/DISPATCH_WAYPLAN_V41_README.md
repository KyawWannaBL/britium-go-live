# Britium Express Dispatch / Wayplan V41

V41 completes the process after Wayplan V40:

`WAREHOUSE_READY -> Wayplan PLANNED -> READY_FOR_DISPATCH -> mandatory Dispatch scan -> guarded Publish -> DISPATCHED / OUT_FOR_DELIVERY -> Rider App`

## What V41 changes

- The **Dispatch Scan** button in Wayplan Command opens Dispatch Command with that Wayplan preselected.
- Dispatch Command loads V40 membership directly instead of relying on a broad legacy parcel pool.
- A scan is accepted only when the parcel belongs to the selected Wayplan and its membership is `READY_FOR_DISPATCH`.
- Single-scanner input and pasted batch-scanner output are supported.
- Duplicate scans are safe; wrong-Wayplan, RTO, held, and non-ready parcels are rejected.
- **Publish Selected Wayplan** stays disabled until every parcel in that Wayplan is dispatch-scanned and no row is blocked.
- Publish calls the V39 guarded release, then changes V40 membership to `DISPATCHED` and records a Wayplan event.
- The broad **Publish All** button is removed from the active UI to prevent accidental cross-route release.
- Existing V39 failed-attempt, return-scan, three-failure RTO, and 48-hour alert behavior remains in place.

## Prerequisites

The following must already be installed:

- Warehouse / Dispatch V39
- Wayplan V40
- `be_publish_wayplan_to_dispatch(text,text)` legacy controlled release RPC

## 1. Install the database bridge

Run the complete file in Supabase SQL Editor:

```text
dispatch_wayplan_execution_v41.sql
```

Expected verification objects:

```text
be_dispatch_wayplan_snapshot_v41(text)
be_dispatch_scan_wayplan_parcel_v41(text,text,text)
be_dispatch_scan_wayplan_batch_v41(text,text[],text)
be_dispatch_publish_wayplan_v41(text,text)
be_dispatch_wayplan_status_v41(text)
```

## 2. Install and build the frontend

Extract this package directly beside `package.json` and `src`, then run:

```bash
node install_dispatch_wayplan_v41.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_dispatch_wayplan_v41.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY DISPATCH / WAYPLAN V41
```

Then deploy:

```bash
npx vercel --prod
```

## Production test

1. Open `/#/wayplan-command`.
2. Create or select one route-group Wayplan.
3. Click **Dispatch Scan**. Confirm `/#/dispatch-command?wayplan=<WAYPLAN_ID>` opens and the same Wayplan is selected.
4. Scan one valid Way ID. Confirm Scanned increases and Remaining decreases.
5. Scan a Way ID from another Wayplan. Confirm it is rejected.
6. Paste several Way IDs into Batch scanner output and process them.
7. Confirm **Publish Selected Wayplan** stays disabled until Remaining is zero and Blocked is zero.
8. Publish. Confirm all membership rows become `DISPATCHED` and the route becomes visible to the assigned Rider.
9. Confirm an already dispatched Wayplan is not released twice.

## Useful verification SQL

```sql
select public.be_dispatch_wayplan_status_v41('<WAYPLAN_ID>');

select *
from public.be_wayplan_events_v40
where wayplan_id = '<WAYPLAN_ID>'
order by event_at desc;
```
