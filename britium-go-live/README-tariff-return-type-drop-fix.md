# Britium tariff return-type drop fix

Fixes:

```text
ERROR: 42P13: cannot change return type of existing function
HINT: Use DROP FUNCTION be_calculate_tariff(text,numeric,boolean) first.
```

## Apply

```powershell
cd "D:\britium-go-live\enterprise_portal"

Expand-Archive -Path "C:\Users\Administrator.DESKTOP-HJREAI3\Downloads\britium-tariff-return-type-drop-fix.zip" -DestinationPath . -Force

node scripts\apply-tariff-return-type-drop-fix.cjs
node scripts\verify-tariff-return-type-drop-fix.cjs
```

## Supabase SQL order

Run this first:

```text
supabase/sql/94-tariff-return-type-drop-fix.sql
```

Then rerun:

```text
supabase/sql/99-run-all-clean-enterprise-portal.sql
```

## Verify

```sql
select proname,
       pg_get_function_identity_arguments(oid) as args,
       pg_get_function_result(oid) as returns
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'be_calculate_tariff';

select public.be_calculate_tariff('Standard', 4::numeric, false);
```

