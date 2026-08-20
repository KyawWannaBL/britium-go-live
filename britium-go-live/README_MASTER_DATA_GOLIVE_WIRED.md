# Britium Master Data Go-Live Wired Patch

This patch recreates the Master Data module to match the current portal structure and wire it for go-live.

## What changed

- `MasterDataPage.tsx` now uses the same current app structure:
  - `src/pages/MasterDataPage.tsx`
  - `@/integrations/supabase/client`
  - `@/contexts/LanguageContext`
  - `lucide-react`
  - Tailwind classes matching the current dark Britium Ops UI
- Tabs and columns are loaded from backend metadata.
- No hardcoded React tables for Merchant / Workforce / Fleet only.
- Row-level actions are available for every tab:
  - Add
  - Edit
  - Delete
  - Save
  - Cancel
- Backend has generic RPCs for future updates.
- Go-live views are added for other modules to consume:
  - `be_v_master_merchants`
  - `be_v_master_workforce`
  - `be_v_master_fleets`
  - `be_v_master_townships`
  - `be_v_master_tariff_inputs`

## Files

Copy:

```txt
pages/MasterDataPage.tsx -> src/pages/MasterDataPage.tsx
lib/masterDataApi.ts     -> src/lib/masterDataApi.ts
```

Copy template:

```txt
public/templates/britium_master_data_templates.xlsx -> public/templates/britium_master_data_templates.xlsx
```

Run SQL:

```txt
sql/master_data_golive_sync.sql
```

Optional verification:

```txt
sql/master_data_golive_verification.sql
```

Optional workbook seed script:

```txt
scripts/seed-master-data-from-xlsx.mjs -> scripts/seed-master-data-from-xlsx.mjs
```

## Install order

### 1. Run backend SQL

In Supabase SQL Editor:

```sql
rollback;
```

Then run:

```txt
sql/master_data_golive_sync.sql
```

### 2. Copy frontend files

```txt
pages/MasterDataPage.tsx -> src/pages/MasterDataPage.tsx
lib/masterDataApi.ts     -> src/lib/masterDataApi.ts
```

### 3. Confirm route

Your current `App.tsx` already has the correct route, but confirm:

```tsx
const MasterDataPage = safeLazy(() => import('@/pages/MasterDataPage'));

<Route path="/master-data" element={<MasterDataPage />} />
```

Sidebar should include:

```tsx
{ name: "Master Data", path: "/master-data", icon: Database }
```

### 4. Build

```bash
npm run build
```

### 5. Deploy

```bash
npx vercel --prod
```

## Loading the workbook data

The SQL intentionally does not hardcode operational master rows.

To import the workbook into the new metadata-driven master data tables:

```bash
npm install @supabase/supabase-js xlsx
SUPABASE_URL="https://YOUR_PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
node scripts/seed-master-data-from-xlsx.mjs public/templates/britium_master_data_templates.xlsx
```

The browser screen also supports direct upload of CSV/JSON for the active tab.

## Backend RPCs

```txt
be_master_data_snapshot(p_dataset_key, p_search, p_limit, p_offset)
be_master_data_page_snapshot()
be_master_data_upsert_row(p_dataset_key, p_record_key, p_payload, p_status, p_actor_email)
be_master_data_delete_row(p_dataset_key, p_record_key, p_actor_email)
be_master_data_bulk_upsert(p_dataset_key, p_rows, p_actor_email)
be_master_data_sync_to_live_tables(p_dataset_key, p_actor_email)
be_master_data_healthcheck()
```

## Verify

```sql
select public.be_master_data_healthcheck();

select
  (select count(*) from public.be_master_data_tabs where active) as datasets,
  (select count(*) from public.be_master_data_columns) as columns,
  (select count(*) from public.be_master_data_rows where deleted_at is null) as rows,
  (select count(*) from public.be_v_master_merchants) as merchants,
  (select count(*) from public.be_v_master_workforce) as workforce,
  (select count(*) from public.be_v_master_fleets) as fleets,
  (select count(*) from public.be_v_master_townships) as townships;
```

Expected after SQL only:

```txt
datasets = 14
columns >= 100
rows = current preserved rows, or 0 before workbook seed
```

Expected after workbook seed:

```txt
rows > 400
```

## Go-live behavior

The Master Data screen is now the single editable source for these categories:

```txt
Merchant Master
Rider Master
Driver Master
Helper Master
Employee Master
Fleet Master
Service Types
Weight Brackets
Vehicle Capacity
Zone Master
Township Master
COD Fee Rules
Surcharge Rules
Cargo Dropoff Rate
```

Other modules can read from the go-live views instead of keeping duplicate hardcoded lists.
