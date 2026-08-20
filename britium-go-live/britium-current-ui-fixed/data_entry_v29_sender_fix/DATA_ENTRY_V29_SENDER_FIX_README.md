# Data Entry V29 — sender_name compatibility fix

## Problem fixed

Parcel saves stopped with:

`null value in column "sender_name" of relation "parcels" violates not-null constraint`

The 15-column Data Entry form stores the sender/merchant name in **OS**, while the older `public.parcels` schema also requires `sender_name`.

## Install

Run the entire file below in a new Supabase SQL Editor tab:

`data_entry_sender_legacy_fix_v29.sql`

The final verification result should show:

- `legacy_fill_function = be_fill_parcel_legacy_required_v29()`
- `legacy_fill_trigger = be_parcels_fill_legacy_required_v29`
- `sender_name_nullable = NO`
- `save_strategy = sender_name is auto-filled from OS/merchant/customer before every parcel save`

## Mapping

- `sender_name` ← `OS`, then merchant/customer ID fallback
- `tracking_code` ← `way_id`
- Legacy receiver fields ← recipient fields
- Legacy delivery/collection totals ← the current parcel calculation fields

## Deployment

This is a backend-only correction. No frontend rebuild is required when V28 is already deployed. Hard-refresh the Data Entry page, run **Save All**, then **Confirm & Create Waybill**.
