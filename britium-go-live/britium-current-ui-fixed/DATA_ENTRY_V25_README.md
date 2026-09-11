# Data Entry V25 — Guided Photo Review and Partial Waybill

## What changed

- **Check All Pics** starts a guided review of every unchecked parcel.
- A parcel opens in a separate browser window with the Rider photo on the left and one complete 15-column registration form on the right.
- **Save, Check & Close** saves the row, marks its photo checked, closes the review window, and returns to the normal table.
- **Save, Check & Next** continues through the guided review queue.
- Missing or rejected photos remain visually blank and can be saved as **Needed to Fix**.
- Saved rows show a separate **Edit** button.
- All missing fields, unchecked photos, and deferred rows are consolidated in one **Needed to Fix** panel.
- **Confirm & Create Waybill** sends only complete, photo-checked, non-deferred rows. Incomplete rows remain in the Needs-to-Fix queue and do not block ready parcels.

## Backend installation

Run `data_entry_partial_waybill_v25.sql` in a new Supabase SQL Editor tab after the V24 bridge SQL.

Expected verification:

- `be_data_entry_confirm_partial_waybill_v25(text,jsonb,jsonb,text)`
- `be_data_entry_needs_fix_v25`
- `be_data_entry_confirm_waybill_v24(text,jsonb,text)`

## Frontend deployment

Extract every file in this package directly beside `package.json` and `src`, then run:

```bash
node install_data_entry_v25.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v25.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY V25
```

The browser must contain the source marker:

```text
DATA_ENTRY_V25_GUIDED_PHOTO_PARTIAL_WAYBILL_2026-07-29
```

Allow pop-ups for the Vercel site because the photo + single-row registration workspace opens in a separate window.
