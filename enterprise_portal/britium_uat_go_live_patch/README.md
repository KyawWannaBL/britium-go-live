# Britium UAT / Go-Live Patch Package

This package is intended as an overlay for the current React/Vite project.

## Overlay paths

Copy these into your app source root, preserving folder names:

- `App.tsx`
- `pages/*.tsx`
- `lib/britiumGoLiveTemplateSchemas.ts`
- `public/templates/*`
- `public/config/britiumLogisticsExceptionRules.json`
- `supabase/migrations/20260615_britium_uat_go_live_cleanup_and_upload.sql`

## What it implements

- Enhanced UAT/go-live UX dashboard.
- Needed screens for template download, Data Entry upload, Merchant/Customer upload, Warehouse scan/upload.
- Route wiring from App.tsx to the new screens.
- Header-only CSV/XLSX templates with no sample/mock/demo rows.
- Local mock/demo runtime clearing and backend cleanup/readiness RPC hooks.
- Safe Supabase staging functions for upload rows when production table contracts are not available in the provided files.

## After installing

1. Apply the SQL migration.
2. Run the app.
3. Visit `/go-live-readiness`.
4. Click `Clear Mock Runtime`.
5. Click `Run Readiness Check`.
6. Download templates from `/templates`.
7. Run one end-to-end UAT pickup lifecycle.
