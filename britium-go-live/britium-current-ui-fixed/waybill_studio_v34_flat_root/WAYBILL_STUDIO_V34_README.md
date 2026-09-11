# Waybill Studio V34 — Data Entry parcel rows

## Cause

The active print screen loaded `be_v32_parcels` and displayed a hard-coded `D0627-BBG-015` preview when that source was unavailable. It did not load the 287 synchronized rows stored in `be_data_entry_parcel_details` for the newly created pickup.

## V34 behavior

- Reads `pickup_id`, `waybill_no`, and `waybill_id` from the route query or `britium:last-created-waybill` context.
- Automatically loads the newest created pickup when no context is present.
- Loads up to 5,000 parcel rows from `be_data_entry_parcel_details` ordered by parcel sequence.
- Uses each parcel `delivery_way_id` as its printable Waybill number.
- Displays the pickup-level batch Waybill number separately.
- Removes the obsolete hard-coded Baby Genius preview row.
- Automatically refreshes when Data Entry publishes `britium:waybill-created`.
- Adds search by Way ID, pickup, recipient, phone, township, address, merchant, destination, or remark.
- Preserves all existing 4×6, 4×3, 4×2, 2×3, 2×1.5, A5, and A4 print layouts and print authorization.

## Install

Extract every file directly beside `package.json` and `src`, then run:

```bash
node install_waybill_studio_v34.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_waybill_studio_v34.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY WAYBILL STUDIO V34
```

## Production check

Open Data Entry, create a Waybill, then open Waybill Studio. The header should show the pickup ID, batch Waybill number, and the synchronized parcel count. For the verified pickup in this case it should load 287 rows for `P0729-HMS-002`.

No additional SQL migration is required because V33 already reports `legacy_detail_rows: 287` and `screen_sources_ready: true`.
