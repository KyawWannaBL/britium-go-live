# Waybill Studio Data Entry Sync Patch

## Problem

Waybill number exists after Data Entry, but Waybill Studio shows no rows because the page is reading an unsynchronized source or the item rows were not rebuilt from `be_data_entry_parcel_details`.

## Files

- `waybill_studio_dataentry_sync_patch.sql`
- `WaybillStudioPage.dataentry_synced.tsx`

## Apply order

1. Run `waybill_studio_dataentry_sync_patch.sql` in Supabase SQL Editor.
2. Replace `src/pages/WaybillStudioPage.tsx` with `WaybillStudioPage.dataentry_synced.tsx`.
3. Deploy frontend.
4. In Waybill Studio, click **Sync Waybills**.

## Manual repair for current pickup

```sql
select public.be_force_waybill_studio_sync(
  'P0620-APA-030',
  'testdata_entry@britiumexpress.com'
);
```

## Verify

```sql
select
  pickup_id,
  waybill_no,
  delivery_way_id,
  parcel_sequence,
  recipient_name,
  delivery_township,
  warehouse_status,
  waybill_status
from public.be_v_waybill_studio_queue
where pickup_id = 'P0620-APA-030'
order by parcel_sequence;
```

Expected: 30 rows for `P0620-APA-030`.

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
```

Expected:

- `waybill_no = WB0620-APA-030`
- `pickup_status = WAYBILL_CREATED`
- `workflow_stage = WAYBILL_CREATED`
- `data_entry_status = WAYBILL_CREATED`
- `warehouse_status = READY_FOR_RECEIVE`
