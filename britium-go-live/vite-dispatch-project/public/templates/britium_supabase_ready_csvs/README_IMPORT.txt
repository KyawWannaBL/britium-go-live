BRITIUM EXPRESS - SUPABASE CSV IMPORT BUNDLE

Why the original failed:
The original .xlsx file is a ZIP-based Excel workbook. Supabase CSV import read its binary contents, which is why the preview began with PK and garbled characters.

How to import:
1. Unzip this bundle.
2. In Supabase, import ONE CSV into ONE table at a time.
3. Use the suggested table names in import_manifest.csv.
4. All files are UTF-8 CSV with the field names in the first row.
5. Date fields were normalized to YYYY-MM-DD and is_active values to true/false.
6. Phone numbers remain text so leading zeroes are preserved.

Important:
- merchant_master.csv contains 20 named columns. The source workbook had an extra unnamed column U that duplicated default_pickup_address; it was removed.
- employee_master.csv contains some blank employee_id values, preserved for system-generated IDs.
- The reference folder is for validation/lookups and does not need to be imported unless your database design requires it.
