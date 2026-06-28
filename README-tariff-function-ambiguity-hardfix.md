# Britium Tariff Function Ambiguity Hardfix

This patch fixes PostgreSQL error:

```txt
ERROR: 42725: function name "public.be_calculate_tariff" is not unique
HINT: Specify the argument list to select the function unambiguously.
```

## Why it happens

Your Supabase database has more than one overloaded function named:

```txt
public.be_calculate_tariff(...)
```

Statements like this fail:

```sql
GRANT EXECUTE ON FUNCTION public.be_calculate_tariff TO authenticated;
```

because PostgreSQL needs the exact argument list.

## Apply

```powershell
cd "D:\britium-go-live\enterprise_portal"

Expand-Archive -Path "C:\Users\Administrator.DESKTOP-HJREAI3\Downloads\britium-tariff-function-ambiguity-hardfix.zip" -DestinationPath . -Force

node scripts\apply-tariff-function-ambiguity-hardfix.cjs
node scripts\verify-tariff-function-ambiguity-hardfix.cjs
```

## Run SQL in Supabase

Run this first:

```txt
supabase/sql/95-tariff-function-ambiguity-hardfix.sql
```

Then rerun your full SQL:

```txt
supabase/sql/99-run-all-clean-enterprise-portal.sql
```

## Verify

```sql
select public.be_tariff_function_ambiguity_hardfix_verification();

select public.be_calculate_tariff('Standard', 4::numeric, false);
```

If the same error remains, search the exact failing SQL for:

```txt
be_calculate_tariff
```

and remove any statement that uses the bare function name without argument types.
