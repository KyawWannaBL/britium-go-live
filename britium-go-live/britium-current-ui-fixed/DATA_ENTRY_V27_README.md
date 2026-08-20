# Data Entry V27 — Optional Photo Checking

V27 changes **Check Pics** from a mandatory Waybill requirement to an optional review tool.

## Behavior

- A parcel with all required registration fields can be saved and included in Waybill creation even when its Rider photo has not been checked.
- Unchecked photos are not placed in **Needed to Fix**.
- **Needed to Fix** now contains only parcels with missing required information or parcels deliberately deferred by staff.
- **Check Pics — Optional** and the guided review window remain available whenever staff want to inspect photos.
- Photo-review status is still recorded and shown, but it is informational only.
- V26 conflict-safe Save Parcel and popup Save/Close behavior are retained.

## Deployment

No additional backend SQL is required. The V26 save RPCs and V25/V24 Waybill RPCs already installed in Supabase remain compatible.

Extract every package file directly beside `package.json` and `src`, then run:

```bash
node install_data_entry_v27.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v27.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY V27
```

Build marker:

```text
DATA_ENTRY_V27_OPTIONAL_PHOTO_CHECK_2026-07-29
```
