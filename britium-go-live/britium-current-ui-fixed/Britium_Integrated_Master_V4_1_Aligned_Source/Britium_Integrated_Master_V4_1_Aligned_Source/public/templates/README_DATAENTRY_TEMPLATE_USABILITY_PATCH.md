# Data Entry Template Usability Patch

## What this patch adds

1. Township field becomes an editable English/Myanmar typeahead.
2. Township options come from `be_v_township_search_options`, which includes:
   - seeded Yangon/Mandalay/Naypyidaw townships,
   - township values found in `merchant_masters`,
   - English/Myanmar aliases.
3. Adds `Contact No. (2)` column.
4. Adds `Remark / Special Instruction` column.
5. Adds row-level `Save` button.
6. Adds top and bottom horizontal scrolling for the wide Data Entry template.
7. Keeps Rider photo proof sync and selected pickup lock behavior.

## Apply order

1. Run `dataentry_template_usability_patch.sql` in Supabase SQL Editor.
2. Replace `src/pages/DataEntryPage.tsx` with `DataEntryPage.usability_enhanced.tsx`.
3. Optional: replace downloadable template with `Britium_DataEntry_Template_Usability_v2.xlsx`.
4. Build and deploy Enterprise Portal:

```bash
npm run build
npx vercel --prod
```

## Verification SQL

```sql
select township, township_mm, city, region_state, label
from public.be_v_township_search_options
order by township;
```

```sql
select public.be_normalize_township('ဒဂုံမြောက်ပိုင်း');
select public.be_normalize_township('North Dagon');
```

```sql
select *
from public.be_v_data_entry_parcel_template
where pickup_id = 'P0620-APA-030'
order by parcel_sequence;
```

## UI behavior

- Staff can type township manually in English or Myanmar.
- The system suggests/normalizes township using township master.
- Contact No. (2) is optional.
- Remark is optional and saved per parcel.
- Staff can scroll horizontally from top or bottom of the table.
