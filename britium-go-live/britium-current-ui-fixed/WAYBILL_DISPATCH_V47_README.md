# Britium Express V47 — Waybill Barcode/QR and Dispatch Scanner Integrity

## What the reported scan proves

The supplied scanner text contains **34 Way ID occurrences**, **24 unique Way IDs**, and **10 repeated scans**. The Dispatch page treated the entire concatenated stream as one parcel ID, which caused:

`Way ID <many concatenated IDs> does not belong to Wayplan WP-20260730-053113`

V47 fixes both ends:

1. Waybill printing uses one canonical parcel Way ID for the visible text, Code 128 barcode, and QR code.
2. Dispatch separates concatenated scanner output, removes duplicates, and validates each extracted Way ID against the selected Wayplan.

## Backend installation

Run the complete file in Supabase SQL Editor:

`waybill_dispatch_scan_integrity_v47.sql`

Expected verification objects:

- `be_extract_way_ids_v47(text)`
- `be_dispatch_scan_preview_v47(text,text)`
- `be_dispatch_scan_payload_v47(text,text,text)`

The SQL wraps the existing V41 mandatory Dispatch scan control. It does not weaken Supervisor approval, Wayplan membership, RTO, warehouse holds, or guarded Publish.

## Frontend installation

Extract this package directly beside `package.json` and `src`, then run:

```bash
node install_waybill_dispatch_v47.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_waybill_dispatch_v47.mjs
```

Deploy only after:

`SAFE TO DEPLOY WAYBILL / DISPATCH V47 SCAN INTEGRITY`

Then deploy:

```bash
npx vercel --prod
```

## Production checks

1. Open Waybill Studio and print one test sheet.
2. Decode one barcode and the QR on the same label. Both must equal the visibly printed Way ID exactly, such as `D0728-CTM-026`.
3. Open Dispatch Command and select the intended Wayplan.
4. Scan one label. The input self-submits after a short scanner-idle interval even when the scanner does not send Enter.
5. Scan several adjacent labels or paste a concatenated stream. V47 reports occurrences, unique IDs, duplicates ignored, accepted rows, and rejected rows.
6. Confirm only Way IDs belonging to the selected Wayplan are accepted.
7. Publish remains blocked until every member of the selected Wayplan has a valid mandatory Dispatch scan.

## Preview a suspicious scanner stream without recording scans

```sql
select public.be_dispatch_scan_preview_v47(
  'WP-20260730-053113',
  'D0728-CTM-026D0728-MML-045D0728-MML-049'
);
```

The response shows each extracted Way ID, whether it belongs to the selected Wayplan, its membership status, and whether it was already Dispatch-scanned.

## Existing printed labels

The Dispatch parser can process old labels when their individual decoded value is a valid canonical Way ID. Reprint any label where a single barcode or QR decodes to a value different from its visibly printed Way ID. V47 blocks future Waybill printing when a row has a missing, malformed, or duplicated canonical parcel Way ID.
