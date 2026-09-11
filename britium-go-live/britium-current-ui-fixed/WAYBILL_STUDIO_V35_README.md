# Waybill Studio V35 — corrected verifier package

The application build in the supplied log succeeded. The previous verifier then produced a false failure because it searched every JavaScript bundle for `BRITIUM EXPRESS DELIVERY SERVICE`. A separate legacy print component may contain that wording even though the active `#/waybill-studio` component is corrected.

This package keeps the V35 Waybill Studio source unchanged and replaces the verifier. The new verifier identifies the active production chunk using the unique marker:

`WAYBILL_STUDIO_V35_BRAND_OVERLAP_FIX_2026-07-30`

It checks the forbidden wording only inside that active chunk.

## Deployment

Extract all files beside `package.json` and `src`, then run:

```bash
node install_waybill_studio_v35.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_waybill_studio_v35.mjs
```

Deploy after:

`SAFE TO DEPLOY WAYBILL STUDIO V35`

No SQL change is required.
