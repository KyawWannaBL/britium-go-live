# Warehouse / Dispatch V39.2 verifier correction

## What happened

The production build completed successfully, but the original verifier searched the minified Rider bundle for the exact source expression:

```text
payload.operationId
```

Vite/Rolldown is allowed to rename local variables during minification, so the production bundle can contain an equivalent expression such as `e.operationId`. This made the verifier report a false failure even though the V39 Rider source and RPC integration were present.

## What changed

The corrected verifier still checks `payload.operationId` in `src/pages/RiderAppPage.tsx`, where the source variable name is stable. In the production bundle it checks only stable identifiers:

- the V39 Rider marker;
- `be_record_delivery_failure_v39`;
- `be_record_delivery_success_v39`.

No frontend or SQL behavior changed.

## Install and verify

Copy `verify_warehouse_dispatch_v39.mjs` into the repository root, replacing the old verifier. Then run:

```bash
node verify_warehouse_dispatch_v39.mjs
```

Expected final line:

```text
SAFE TO DEPLOY WAREHOUSE / DISPATCH V39
```

Then deploy the already-built V39 output:

```bash
npx vercel --prod
```

The CSS `@import` message in the build output is a warning, not a build failure. It may be cleaned separately by moving the Google Fonts `@import` to the top of the stylesheet or, preferably, loading the font through `index.html`.
