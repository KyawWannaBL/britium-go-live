# Waybill Studio V38

V38 fixes the live batch printing and the three print-template field mappings reported after V37.

## Fixed

1. **Print All / Print Selected authorization**
   - The 287 parcel labels belong to one pickup-level batch Waybill.
   - V38 authorizes the batch Waybill once instead of trying to authorize 287 `D...` parcel Way IDs independently.
   - A prior print requires one batch reprint reason.
   - Every authorized job is retained in `be_waybill_print_audit_v38`.

2. **OS / Merchant name**
   - Loaded from canonical `public.parcels` using `os`, `sender_name`, `merchant_id`, or `customer_id`.
   - The false `Britium Merchant` display is removed. Missing source data is shown as `OS not provided`.

3. **Recipient township**
   - The vertical township label now uses the parcel recipient township.
   - Destination/city is no longer substituted for township.

4. **Remarks**
   - `Remarks:` is displayed in the 4 × 2 and 4 × 3 layouts.
   - The value comes from Data Entry/OS/recipient instructions stored in `remarks` or `remark`.

## Deployment order

1. Run `waybill_studio_batch_print_fix_v38.sql` in Supabase SQL Editor.
2. Extract all package files beside `package.json` and `src`.
3. Run:

```bash
node install_waybill_studio_v38.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_waybill_studio_v38.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY WAYBILL STUDIO V38
```
