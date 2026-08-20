# Data Entry V24 — Confirm Waybill + Related-Screen Integration

Build marker: `DATA_ENTRY_V24_WAYBILL_BRIDGE_2026-07-29`

## What V24 fixes

- The **Confirm & Create Waybill** action commits the currently edited field before running.
- It saves every parcel row first; a partial row-save failure stops Waybill creation and identifies the failed Way IDs.
- It calls the new backend bridge `be_data_entry_confirm_waybill_v24`.
- The bridge saves the exact 15-column parcel sheet, creates/updates the pickup-level Waybill, synchronizes `be_data_entry_parcel_details`, and calls the legacy Waybill API used by Waybill Studio, document printing, and warehouse queues.
- The frontend retains fallbacks to:
  - `be_data_entry_create_waybill_from_parcel_sheet`
  - `be_data_entry_create_waybill_from_rows`
  - `be_data_entry_create_waybill`
- Blank or unavailable Rider photos may be manually acknowledged. The old check that rejected rows merely because the URL/path was unavailable has been removed; every proof still must be reviewed or manually acknowledged.
- On success, the page stores a shared Waybill context, emits `britium:waybill-created`, and opens **Waybill Studio** automatically.
- Success actions also link to **Waybill Studio**, **Doc Print Room**, and **Warehouse Ops**.
- Backend failures are shown beside the action button instead of only at the top of the long register.

## Required deployment order

1. In Supabase SQL Editor, run the complete file:

```text
data_entry_waybill_bridge_v24.sql
```

Its final verification row should show:

```text
be_data_entry_confirm_waybill_v24(text,jsonb,text)
```

The existing legacy API should also be shown when installed:

```text
be_data_entry_create_waybill_from_rows(text,jsonb,text)
```

2. Extract all V24 package files directly beside `package.json` and `src`.

3. Run:

```bash
node install_data_entry_v24.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v24.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY V24
```

## Runtime result

After a successful confirmation, the application:

1. Saves all parcel rows.
2. Creates/updates the Waybill backend record.
3. Synchronizes the screens and warehouse workflow.
4. Stores the created `pickupId`, `waybillId`, `waybillNo`, Way IDs, and parcel count under:

```text
britium:last-created-waybill
```

5. Opens the existing Waybill Studio navigation item.

The SQL is additive and does not replace or drop existing views.
