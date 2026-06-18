# Britium tariff overload final hardfix

## Problem

Supabase/Postgres reports:

```txt
ERROR: 42725: function name "public.be_calculate_tariff" is not unique
HINT: Specify the argument list to select the function unambiguously.
```

This means the database has multiple `public.be_calculate_tariff(...)` overloads, while one SQL file still contains a bare statement such as:

```sql
GRANT EXECUTE ON FUNCTION public.be_calculate_tariff TO authenticated;
DROP FUNCTION IF EXISTS public.be_calculate_tariff;
COMMENT ON FUNCTION public.be_calculate_tariff IS '...';
ALTER FUNCTION public.be_calculate_tariff OWNER TO ...;
```

## Apply

Run from the clean Enterprise Portal folder:

```powershell
cd "D:\britium-go-live\enterprise_portal"

Expand-Archive -Path "C:\Users\Administrator.DESKTOP-HJREAI3\Downloads\britium-tariff-overload-final-hardfix.zip" -DestinationPath . -Force

node scripts\apply-tariff-overload-final-hardfix.cjs
node scripts\verify-tariff-overload-final-hardfix.cjs
```

## Run SQL in Supabase

Run this first:

```txt
supabase/sql/92-tariff-overload-final-preflight.sql
```

Then rerun the patched full SQL:

```txt
supabase/sql/99-run-all-clean-enterprise-portal.sql
```

If needed, run safe grants after the full SQL:

```txt
supabase/sql/95-tariff-overload-safe-grants-final.sql
```

## Verify in Supabase

```sql
select
  p.oid::regprocedure::text as signature,
  pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'be_calculate_tariff'
order by signature;

select public.be_calculate_tariff('Standard', 4::numeric, false);
```
