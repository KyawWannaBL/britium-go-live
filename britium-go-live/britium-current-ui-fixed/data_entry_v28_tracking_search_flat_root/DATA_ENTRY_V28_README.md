# Data Entry V28 — tracking_code save fix and parcel search

V28 fixes the Waybill-blocking error:

```text
null value in column "tracking_code" of relation "parcels" violates not-null constraint
```

It also adds a fast search box above the register so staff can locate a parcel using Way ID, OS/merchant, customer ID, merchant ID, recipient, phone, township, address, destination, status, sequence number, or remarks.

## 1. Run the SQL first

Open a new Supabase SQL Editor tab and run the complete file:

```text
data_entry_tracking_code_fix_v28.sql
```

The SQL installs a BEFORE trigger on `public.parcels`. Whenever an RPC, bulk Save All, direct API fallback, or Waybill operation inserts a parcel without `tracking_code`, the trigger fills it from `way_id` before the NOT NULL constraint is checked.

The final query should return:

```text
tracking_code_trigger_function: be_fill_parcel_tracking_code_v28()
tracking_code_trigger: be_parcels_fill_tracking_code_v28
tracking_code_nullable: NO
save_strategy: tracking_code is auto-filled from way_id before every parcel save
```

## 2. Deploy the frontend

Extract every package file directly beside `package.json` and `src`, then run:

```bash
node install_data_entry_v28.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v28.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY V28
```

Build marker:

```text
DATA_ENTRY_V28_TRACKING_CODE_SEARCH_2026-07-29
```

## Search behavior

The search box filters both Full Form and Excel Sheet views while preserving the original row index for Save, Edit, photo review, and Needed-to-Fix actions. Multiple words are treated as AND terms, so `Baby World D0727` finds rows containing both values.

## Retry after installation

After the SQL and frontend are deployed:

1. Hard-refresh the Data Entry page.
2. Click **Save All** again.
3. Click **Confirm & Create Waybill**.

Photo checking remains optional.
