# Data Entry V22 — Save All

V22 adds a bulk **Save All** operation for uploaded or manually edited parcel rows.

## What changed

- A prominent `Save All (N)` button appears in the Full Register header and bottom action bar.
- Only unsaved/changed rows are submitted.
- Saves run in controlled batches of four to avoid overloading Supabase.
- Progress is shown as `Saving X/Y`.
- Successful rows immediately change to `Saved`.
- Failed rows remain unsaved and are summarized by Way ID, so they can be retried individually or by pressing Save All again.
- Existing individual Save buttons, photo review, bulk upload, calculations and waybill creation remain unchanged.

## Install from the repository root

Extract every ZIP item directly beside `package.json` and `src`, then run:

```bash
node install_data_entry_v22.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v22.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY V22
```

The active component includes the marker:

```text
DATA_ENTRY_V22_SAVE_ALL_2026-07-29
```

No database migration is required for this interface/workflow change. It reuses the already installed parcel save RPC with the existing fallback save paths.
