# Britium UAT / Go-Live UX/UI Patch

## What changed

- Added a Go-Live Command Center at `/dashboard` and `/go-live-readiness`.
- Added a Template Download & Upload Center at `/templates`.
- Added Data Entry upload workflow at `/data-entry` and `/data-entry/upload`.
- Added Merchant/Customer account-bound upload workflow at `/merchant/upload` and `/customer/upload`.
- Added Warehouse scan/inventory workflow at `/warehouse`, `/warehouse/upload`, and `/warehouse/scan`.
- Reprioritized the route candidate list in `App.tsx` so UAT/go-live pages load before older/testing screens.
- Added header-only CSV/XLSX templates under `public/templates`.
- Added Supabase migration with:
  - runtime cleanup archive tables,
  - runtime reset log,
  - readiness snapshot RPC,
  - Data Entry upload staging RPC,
  - Merchant/Customer upload staging RPC,
  - Warehouse upload staging RPC,
  - Warehouse scan lookup/upsert staging RPC.

## Files to copy

Copy these folders/files into your Vite React app source root:

- `App.tsx`
- `pages/UATGoLiveCommandCenterPage.tsx`
- `pages/GoLiveTemplateCenterPage.tsx`
- `pages/DataEntryUATUploadPage.tsx`
- `pages/PortalUploadCenterPage.tsx`
- `pages/WarehouseUATUploadPage.tsx`
- `lib/britiumGoLiveTemplateSchemas.ts`
- `public/templates/*`
- `supabase/migrations/20260615_britium_uat_go_live_cleanup_and_upload.sql`

## Important production note

The included upload RPCs stage rows safely when the exact production pickup/warehouse table contracts are not available in the uploaded source. Map the staging tables into your canonical production functions/tables before Go-Live:

- `be_go_live_upload_rows` → canonical pickup request RPC/table.
- `be_warehouse_scan_stage` → warehouse inventory + cargo event tables.
- `be_go_live_archive_and_cleanup_runtime()` → run once after reviewing which runtime tables exist in your database.

The runtime cleanup function does not delete master data, tariff master, branch nodes, workforce accounts, user registry, or audit archive.
