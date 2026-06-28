# Britium tariff function ambiguity fix

Fixes Supabase/PostgreSQL error:

```txt
ERROR: 42725: function name "public.be_calculate_tariff" is not unique
HINT: Specify the argument list to select the function unambiguously.
```

## Root cause

The clean SQL had:

```sql
GRANT EXECUTE ON FUNCTION public.be_calculate_tariff TO authenticated;
```

But your database already has more than one `be_calculate_tariff` overload, so PostgreSQL does not know which function to grant.

## Fix

Use the exact signature:

```sql
GRANT EXECUTE ON FUNCTION public.be_calculate_tariff(TEXT, NUMERIC, BOOLEAN) TO authenticated;
```

## Apply

```powershell
cd "D:\britium-go-live\enterprise_portal"

Expand-Archive -Path "C:\Users\Administrator.DESKTOP-HJREAI3\Downloads\britium-tariff-function-ambiguity-fix.zip" -DestinationPath . -Force

node scripts\apply-tariff-function-ambiguity-fix.cjs
node scripts\verify-tariff-function-ambiguity-fix.cjs
```

## Supabase SQL order

Run this first:

```txt
supabase/sql/95-tariff-function-ambiguity-fix.sql
```

Then rerun:

```txt
supabase/sql/99-run-all-clean-enterprise-portal.sql
```

## Verify

```sql
select public.be_tariff_function_ambiguity_verification();

select public.be_calculate_tariff('Standard', 4, false);
```
