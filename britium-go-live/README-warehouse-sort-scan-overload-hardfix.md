# Britium Warehouse Sort Scan Overload Hardfix

Fixes Supabase/Postgres error:

```text
ERROR: 42725: function name "public.be_warehouse_sort_scan" is not unique
HINT: Specify the argument list to select the function unambiguously.
```

## Why this happens

Your database has more than one overload of:

```sql
public.be_warehouse_sort_scan(...)
```

but one of the SQL files still references it without argument types, usually in a statement like:

```sql
GRANT EXECUTE ON FUNCTION public.be_warehouse_sort_scan TO authenticated;
```

Postgres cannot choose which overload is intended.

## Files

```text
supabase/sql/93-warehouse-sort-scan-overload-hardfix.sql
supabase/sql/96-warehouse-sort-scan-safe-grants.sql
scripts/apply-warehouse-sort-scan-overload-hardfix.cjs
scripts/verify-warehouse-sort-scan-overload-hardfix.cjs
```

## Apply

```powershell
cd "D:\britium-go-live\enterprise_portal"

Expand-Archive -Path "C:\Users\Administrator.DESKTOP-HJREAI3\Downloads\britium-warehouse-sort-scan-overload-hardfix.zip" -DestinationPath . -Force

node scripts\apply-warehouse-sort-scan-overload-hardfix.cjs
node scripts\verify-warehouse-sort-scan-overload-hardfix.cjs
```

## Run in Supabase SQL Editor

Run first:

```text
supabase/sql/93-warehouse-sort-scan-overload-hardfix.sql
```

Then rerun:

```text
supabase/sql/99-run-all-clean-enterprise-portal.sql
```

Then, if needed, run:

```text
supabase/sql/96-warehouse-sort-scan-safe-grants.sql
```

## Verify

```sql
select
  p.oid::regprocedure::text as signature,
  pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'be_warehouse_sort_scan'
order by signature;
```
