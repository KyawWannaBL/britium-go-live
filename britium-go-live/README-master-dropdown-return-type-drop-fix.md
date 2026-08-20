# Britium Master Dropdown Return-Type Drop Fix

## Error fixed

```txt
ERROR: 42P13: cannot change return type of existing function
HINT: Use DROP FUNCTION be_master_dropdown_snapshot(text) first.
```

## Why it happens

Your existing Supabase database already has `public.be_master_dropdown_snapshot(text)` with an older return type.
PostgreSQL cannot `CREATE OR REPLACE FUNCTION` if the return type changes.

## Apply

```powershell
cd "D:\britium-go-live\enterprise_portal"

Expand-Archive -Path "C:\Users\Administrator.DESKTOP-HJREAI3\Downloads\britium-master-dropdown-return-type-drop-fix.zip" -DestinationPath . -Force

node scripts\apply-master-dropdown-return-type-drop-fix.cjs
node scripts\verify-master-dropdown-return-type-drop-fix.cjs
```

## Run SQL

Run first:

```txt
supabase/sql/92-master-dropdown-return-type-drop-fix.sql
```

Then rerun:

```txt
supabase/sql/99-run-all-clean-enterprise-portal.sql
```

## Verify

```sql
select public.be_master_dropdown_return_type_drop_verification();

select
  p.oid::regprocedure::text as signature,
  pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('be_master_dropdown_snapshot', 'be_master_record_lookup')
order by signature;

select public.be_master_dropdown_snapshot('en') -> 'counts';
```

