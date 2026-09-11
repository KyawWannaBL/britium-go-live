# Enterprise Portal Full Sync - Build Fixed

This build-fixed package corrects the JSX syntax errors in the page wrappers.

## Fixed

- `rpcArgs={}` -> `rpcArgs={{}}`
- `rpcArgs={ p_rider_email: null, ... }` -> `rpcArgs={{ p_rider_email: null, ... }}`

## Copy files

Copy the following files into your project:

```txt
components/PortalLiveSnapshotPage.tsx -> src/components/PortalLiveSnapshotPage.tsx
lib/portalLiveApi.ts                  -> src/lib/portalLiveApi.ts

pages/SupervisorPortalPage.tsx        -> src/pages/SupervisorPortalPage.tsx
pages/SupervisorPickupPage.tsx        -> src/pages/SupervisorPickupPage.tsx
pages/SupervisorWayplanReviewPage.tsx -> src/pages/SupervisorWayplanReviewPage.tsx
pages/FinancePortalPage.tsx           -> src/pages/FinancePortalPage.tsx
pages/InvoiceStudioPage.tsx           -> src/pages/InvoiceStudioPage.tsx
pages/CODSettlementPage.tsx           -> src/pages/CODSettlementPage.tsx
pages/RiderSettlementPage.tsx         -> src/pages/RiderSettlementPage.tsx
pages/CustomerPortalPage.tsx          -> src/pages/CustomerPortalPage.tsx
pages/BranchOfficePortalPage.tsx      -> src/pages/BranchOfficePortalPage.tsx
```

Then build:

```bash
npm run build
```
