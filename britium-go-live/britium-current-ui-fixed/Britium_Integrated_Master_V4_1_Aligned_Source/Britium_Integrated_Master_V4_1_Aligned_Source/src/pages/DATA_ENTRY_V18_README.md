# Data Entry V18 — Rider photo review and full register screen

This is a frontend-only correction. The V16 pickup RPC and parcel-sheet backend already tested successfully and do not need another SQL migration.

## Corrections

- Resolves Rider photos from all known fields: `display_photo`, `proof_photo_url`, `proof_photo_data`, `image_url`, `proof_photo_path`, and `photo_url`.
- Extracts storage object paths from full Supabase Storage URLs and requests a fresh four-hour signed URL.
- Displays a large photo preview modal.
- Adds an explicit `Photo checked` control for every parcel.
- Blocks waybill creation until every Rider photo has been opened/checked.
- Places Rider photos above the register instead of reducing the register to three quarters of the page.
- Makes `Full form` the default register view so all 15 fields are visible without horizontal scrolling.
- Keeps an optional `Excel sheet` view with the exact workbook column sequence.
- Resets the sheet scroll position to the first column whenever proofs load or sheet view opens.

## Installation

Put these files in the repository root:

- `DataEntryPage.V18.tsx`
- `install_data_entry_v18.mjs`
- `verify_data_entry_v18.mjs`

Run:

```bash
node install_data_entry_v18.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v18.mjs
```

Deploy only when the last line is:

```text
SAFE TO DEPLOY V18
```

The deployed page must display this build marker:

```text
DATA_ENTRY_V18_PHOTO_REVIEW_FULL_REGISTER_2026-07-29
```

## Photo storage note

If a card still reports that the image did not load, click **Retry secure photo link**. V18 requests a new signed link from the `pickup-parcel-proofs` bucket. If retry also fails, the database path points to an object that is missing from that bucket; the frontend cannot reconstruct a deleted or differently named storage object.
