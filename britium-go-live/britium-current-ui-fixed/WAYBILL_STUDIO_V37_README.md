# Waybill Studio V37 — Reliable Bulk Print

V37 fixes Print All and Print Selected for large batches such as the 287-row pickup.

## Root causes fixed

1. The print popup was opened only after hundreds of asynchronous authorization calls. Browsers therefore treated it as an unsolicited popup and blocked it.
2. Print authorization ran sequentially, making a 287-row batch appear unresponsive.
3. An authorization RPC error rejected the whole click handler without a clear on-screen result.
4. Print All used only the currently filtered rows instead of every loaded row.

## V37 behavior

- Opens the print window immediately from the trusted button click.
- Authorizes up to eight rows concurrently with live progress.
- Handles individual authorization failures without crashing the entire batch.
- Prints all loaded rows even when a search filter is active.
- Keeps Print Selected limited to checked rows.
- Provides a manual **Print now** button in the print window if the browser does not show the dialog automatically.
- Waits for QR/barcode images, with a 20-second maximum wait so one failed image cannot stall the entire batch.
- Retains V34/V35 live Data Entry rows and corrected BRITIUM EXPRESS branding.

## Deploy

Extract the package beside `package.json` and `src`, then run:

```bash
node install_waybill_studio_v37.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_waybill_studio_v37.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY WAYBILL STUDIO V37
```

No backend SQL change is required.
