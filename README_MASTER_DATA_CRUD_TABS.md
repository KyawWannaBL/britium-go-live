# Britium Master Data CRUD Tabs Patch

This patch replaces the old three-tab Master Data screen with a backend-driven CRUD screen.

## What it fixes

- Adds `Add`, `Edit`, `Delete`, and `Save` actions on every master data row.
- Shows all master data modules as separate tabs.
- Uses backend metadata for tabs and columns, so the screen is not hardcoded.
- Seeds the master data catalogue from `britium_master_data_templates.xlsx`.
- Keeps all rows in a generic JSONB master data store that is easy to extend later.
- Keeps backward-compatible snapshot keys for Supervisor, Pickup, Fleet, Merchant, Rider, Driver, and Helper fallback screens.

## Master data tabs included

- Merchant Master
- Rider Master
- Driver Master
- Helper Master
- Employee Master
- Fleet Master
- Service Types
- Weight Brackets
- Vehicle Capacity
- Zone Master
- COD Fee Rules
- Surcharge Rules
- Township Master
- Cargo Dropoff Rate

## Install

1. Run SQL in Supabase SQL Editor:

```sql
rollback;
```

Then run:

```txt
sql/master_data_crud_tabs_sync.sql
```

2. Copy frontend file:

```txt
pages/MasterDataPage.tsx -> src/pages/MasterDataPage.tsx
```

3. Copy workbook template:

```txt
public/templates/britium_master_data_templates.xlsx -> public/templates/britium_master_data_templates.xlsx
```

4. Confirm route still points to:

```txt
/master-data -> MasterDataPage
```

5. Build and deploy:

```bash
npm run build
npx vercel --prod
```

## Verify

Run:

```txt
sql/master_data_crud_tabs_verification.sql
```

Expected result:

- `ok = true`
- `datasets = 14`
- `rows > 400`
- all 14 datasets listed with row counts

## Future updates

To add a new master data tab without editing the React page:

1. Insert one row in `be_master_data_tabs`.
2. Insert its columns in `be_master_data_columns`.
3. Insert rows using `be_master_data_upsert_record()` or `be_master_data_bulk_upsert_records()`.

Example:

```sql
select public.be_master_data_upsert_column(
  p_dataset_key => 'merchant_master',
  p_field_key => 'merchant_segment',
  p_label_en => 'Merchant Segment',
  p_data_type => 'select',
  p_options => '["A","B","C"]'::jsonb,
  p_sort_order => 21
);
```

The UI will show the new column after refresh.
