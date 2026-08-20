# Data Entry Save Rows FIXED5

## Problem

`be_data_entry_parcel_details` still returns 0 rows even though the Data Entry screen shows 30 rows.

That means the browser-visible rows are not being written to the backend table before Waybill Studio sync.

## Apply

1. Run `dataentry_force_save_rows_fixed5.sql`
2. Replace `src/pages/DataEntryPage.tsx` with `DataEntryPage.waybill_synced_fixed5.tsx`
3. Deploy:
   ```bash
   npm run build
   npx vercel --prod
   ```

## What changed

The confirm button now does a direct upsert into:

`be_data_entry_parcel_details`

before calling:

`be_data_entry_create_waybill_from_rows`

If the direct save fails, the page shows the real error message instead of silently leaving row count at 0.

## Verify

```sql
select public.be_debug_data_entry_saved_rows('P0620-APA-030');

select count(*) as saved_rows
from public.be_data_entry_parcel_details
where pickup_id = 'P0620-APA-030';
```

Expected after clicking the fixed Data Entry confirm button:

`saved_rows = 30`
