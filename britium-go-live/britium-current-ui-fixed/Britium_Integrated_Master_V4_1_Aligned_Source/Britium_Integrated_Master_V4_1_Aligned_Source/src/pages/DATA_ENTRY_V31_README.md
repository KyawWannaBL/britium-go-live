# Data Entry V31 — explicit required-field mapping

V31 fixes the live `public.parcels.recipient_address` NOT NULL failure without relying only on a generic JSON trigger.

It writes the required legacy columns in three places:

1. A deterministic `BEFORE INSERT OR UPDATE` trigger.
2. Both Data Entry save RPCs.
3. The frontend's direct Supabase fallback payload.

The existing V28 search box and V27 optional photo review remain unchanged.

## 1. Database

Run `data_entry_required_fields_explicit_fix_v31.sql` once in a new Supabase SQL Editor tab.

Expected verification:

- `be_fill_parcel_required_v31()`
- `be_parcels_fill_required_v31`
- both save RPC signatures
- save strategy confirming explicit `recipient_address` mapping

## 2. Frontend

Extract every package file directly beside `package.json` and `src`, then run:

```bash
node install_data_entry_v31.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v31.mjs
```

Deploy only after `SAFE TO DEPLOY V31`.

## 3. Retest

Hard-refresh the deployed site, click **Save All**, then **Confirm & Create Waybill**.

Rows with genuinely blank recipient addresses remain in **Needed to Fix**; complete rows save normally.
