# Data Entry V23 — Row Photos + Fast Text Editing

Build marker: `DATA_ENTRY_V23_ROW_PHOTOS_FAST_INPUT_2026-07-29`

## Changes

- Adds a Rider Photo cell beside every parcel row in both Full form and Excel sheet views.
- Matches photos by Way ID first and parcel sequence second.
- A missing, rejected, or inaccessible image is shown as a blank dashed photo cell.
- Clicking a blank photo cell retries the secure photo lookup.
- Each row has its own Check photo / Mark blank checked control.
- Text and numeric editors keep a local draft while typing, so the entire large table does not rerender for every character.
- Values commit on blur or Enter.
- Tariff RPC calculation runs after commit, not on every keystroke.
- Save, Save All, and waybill actions retain the current editor value by blurring the active editor first.
- Existing Save All, bulk upload, 15-column workbook, pickup RPC, photo modal, and calculations remain.

## Install

Extract all package files directly beside `package.json` and `src`, then run:

```bash
node install_data_entry_v23.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v23.mjs
```

Deploy only after the verifier prints:

```text
SAFE TO DEPLOY V23
```

No backend SQL change is required.
