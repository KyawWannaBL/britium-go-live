# Britium Warehouse V36

## Purpose

V36 connects the 287 Data Entry parcel rows and the pickup-level Waybill batch to the active `/warehouse` route. It provides physical receipt scanning, count reconciliation, label QA, staging, and a consolidated non-blocking exception queue.

## Main workflow

`PENDING -> RECEIVED -> WAREHOUSE_READY`

Rows with physical or data problems become `WAREHOUSE_EXCEPTION`. They remain in the Warehouse Holds panel while valid rows can continue to Dispatch.

## Features

- Automatically opens the latest Data Entry Waybill pickup or reads `britium:last-created-waybill`.
- Pickup and batch selector with expected, scanned, ready, exception, remaining, and label-QA counts.
- Single barcode/Way-ID receipt scanning.
- Batch paste/scanner receipt processing.
- Actual-weight capture.
- Warehouse and staging-zone capture.
- Individual and batch release to `WAREHOUSE_READY`.
- Consolidated discrepancy queue for missing, extra, damaged, mismatched, and unscannable parcels.
- Physical QR/barcode pass/fail tracking.
- Search and status filters across the complete receipt register.
- Existing `/warehouse-operations` return/dispatch lifecycle remains unchanged.

## Deployment order

1. Run the complete `warehouse_receipt_reconciliation_v36.sql` in Supabase SQL Editor.
2. Confirm the verification row lists all four V36 RPCs and `be_v_warehouse_receipt_v36`.
3. Extract this package directly beside `package.json` and `src`.
4. Run:

```bash
node install_warehouse_v36.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_warehouse_v36.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY WAREHOUSE V36
```

## Live test

1. Open `/#/warehouse`.
2. Select pickup `P0729-HMS-002`.
3. Confirm Expected = 287.
4. Scan a parcel Way ID, such as `D0728-KNY-001`.
5. Confirm Scanned increases and Remaining decreases.
6. Mark the row Ready.
7. Record one controlled exception and confirm it appears in Consolidated Warehouse Holds.
8. Use **Mark All Scanned as Warehouse Ready** and confirm exception rows remain on hold.

## Security

The new tables have RLS enabled and no browser table-mutation grants. Authenticated users work through SECURITY DEFINER RPCs only. Do not add service-role credentials to browser environment variables.
