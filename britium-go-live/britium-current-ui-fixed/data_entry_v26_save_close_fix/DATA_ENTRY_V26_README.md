# Data Entry V26 — Save/Close and Save Parcel Fix

V26 fixes the two issues shown in the review window:

1. **Save, Check & Close** now closes the popup after a successful save, focuses the main Data Entry page, switches to Full Form, and scrolls back to the parcel row that was reviewed.
2. **Save parcel** no longer depends on a UNIQUE constraint on `public.parcels.way_id`. The backend and frontend use an update-existing-row-or-insert-new-row strategy.

The row Save button now shows `Saving...`, then `Saved / Edit`. A failed row displays the exact database error beside that row and changes the sheet button to `Retry`.

## Deployment order

### 1. Supabase

Run the entire file in a new SQL Editor tab:

```text
data_entry_save_conflict_fix_v26.sql
```

The result should show both save RPC signatures and:

```text
UPDATE-THEN-INSERT; no ON CONFLICT dependency
```

### 2. Frontend

Extract every package file directly beside `package.json` and `src`, then run:

```bash
node install_data_entry_v26.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v26.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY V26
```

Build marker:

```text
DATA_ENTRY_V26_SAVE_CLOSE_AND_CONFLICT_SAFE_2026-07-29
```
