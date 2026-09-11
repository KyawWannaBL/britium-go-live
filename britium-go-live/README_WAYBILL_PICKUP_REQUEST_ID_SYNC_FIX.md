# Data Entry / Waybill Studio pickup_request_id Fix

## Problem

`be_portal_pickup_request_items.pickup_request_id` is NOT NULL, but the Waybill Studio/Data Entry sync insert did not provide it.

Error:

```text
null value in column "pickup_request_id" of relation "be_portal_pickup_request_items" violates not-null constraint
```

## Fix

Run:

```text
waybill_pickup_request_id_sync_fix.sql
```

The SQL installs a trigger that automatically fills:

```text
be_portal_pickup_request_items.pickup_request_id = be_portal_pickup_requests.id
```

based on `pickup_id` or `waybill_no`.

## After running SQL

Run the current pickup sync again:

```sql
select public.be_force_waybill_studio_sync(
  'P0620-APA-030',
  'testdata_entry@britiumexpress.com'
);
```

Then finalize statuses:

```sql
select public.be_finalize_waybill_status_sync(
  'P0620-APA-030',
  'testdata_entry@britiumexpress.com'
);
```

## Verify

```sql
select
  pickup_id,
  waybill_no,
  pickup_status,
  workflow_stage,
  data_entry_status,
  warehouse_status
from public.be_portal_pickup_requests
where pickup_id = 'P0620-APA-030';

select
  pickup_request_id,
  pickup_id,
  waybill_no,
  delivery_way_id,
  parcel_sequence,
  warehouse_status
from public.be_portal_pickup_request_items
where pickup_id = 'P0620-APA-030'
order by parcel_sequence
limit 5;
```
