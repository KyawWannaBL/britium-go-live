# Data Entry V21 — active buttons and photo review

V21 keeps the V20 clean interface and fixes the unusable photo-review controls.

## Improvements

- `Check photo` always runs. It searches known photo fields, multiple storage buckets and likely pickup folders.
- `Retry secure photo link` is active even when the stored field is incomplete.
- If an image object is unavailable, the preview explains the problem and provides **Mark checked manually**.
- The card-level photo review control is a normal button instead of a disabled native checkbox.
- `Confirm & Create Waybill` remains clickable and reports incomplete requirements instead of appearing permanently disabled.
- `REGISTER NOW` opens and scrolls to the full register form.
- `REPORT` downloads an XLSX report and the From/To date controls are functional.
- Existing pickup RPC, 15-column parcel sheet, bulk upload protection and calculations are retained.

## Install

Extract every file directly beside `package.json` and the `src` directory, then run:

```bash
node install_data_entry_v21.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v21.mjs
```

Deploy only after `SAFE TO DEPLOY V21` is displayed.

The page build marker is kept in the source and console only:

`DATA_ENTRY_V21_BUTTONS_PHOTO_REVIEW_2026-07-29`
