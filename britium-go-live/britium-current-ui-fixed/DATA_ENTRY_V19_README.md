# Data Entry V19 — bulk upload crash fix

## Cause
The V18 workbook merge directly evaluated `row.way_id` for every existing array entry. If the existing React row array contained a sparse or undefined entry, bulk upload crashed the whole route with `Cannot read properties of undefined (reading 'way_id')`. Large uploads also launched one tariff RPC per row simultaneously.

## V19 changes
- Removes undefined/sparse entries before matching or rendering uploaded rows.
- Checks each candidate before reading `way_id` or `parcel_sequence`.
- Matches rows by Way ID first, then sequence, and appends safely.
- Limits tariff calculation to six concurrent requests instead of an unlimited `Promise.all` burst.
- Reports the exact Excel row if parsing or calculation fails.
- Keeps Rider-photo review, 52-pickup RPC, full register form and the 15-column workbook contract.

## Install
Extract every file from the ZIP directly into the repository root, beside `package.json` and `src`.

Git Bash:

```bash
ls DataEntryPage.V19.tsx install_data_entry_v19.mjs verify_data_entry_v19.mjs
./deploy_data_entry_v19.sh
```

Windows Command Prompt:

```bat
deploy_data_entry_v19.cmd
```

Manual commands:

```bash
node install_data_entry_v19.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v19.mjs
```

Deploy only after `SAFE TO DEPLOY V19` appears.

## Browser confirmation
The page must show:

`DATA_ENTRY_V19_BULK_UPLOAD_SAFE_2026-07-29`

After a successful upload, the message begins with:

`BULK_UPLOAD_V19_SAFE_MERGE`

No database SQL change is required for this frontend crash.
