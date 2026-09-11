# Waybill Studio V35 - Brand overlap fix

V35 keeps the V34 live Data Entry integration and removes the word **DELIVERY** from the waybill brand header where it overlaps the barcode.

## Preserved from V34

- Loads the 287 parcel rows from `be_data_entry_parcel_details`.
- Reads the current pickup and batch Waybill context.
- Keeps search, selection, QR, barcode, thermal, A5 and A4 layouts.

## Changed in V35

- 4 x 2 header: `BRITIUM EXPRESS DELIVERY SERVICE` becomes `BRITIUM EXPRESS`.
- Compact header: the `DELIVERY SERVICE` subtitle is removed.
- Full 4 x 6 WAYBILL header: the `DELIVERY SERVICE` subtitle is removed.
- Invoice and Document modes still display their document type where applicable.

## Installation

Extract every package file directly into the repository root beside `package.json` and `src`.

Run:

```bash
node install_waybill_studio_v35.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_waybill_studio_v35.mjs
```

Deploy only after the verifier prints:

```text
SAFE TO DEPLOY WAYBILL STUDIO V35
```

After deployment, hard-refresh the page with `Ctrl+Shift+R`.

Build marker:

```text
WAYBILL_STUDIO_V35_BRAND_OVERLAP_FIX_2026-07-30
```

No backend SQL change is required.
