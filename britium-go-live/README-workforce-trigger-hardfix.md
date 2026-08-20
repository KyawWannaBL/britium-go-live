# Britium workforce_code trigger hardfix

This patch fixes:

```text
ERROR: 23502: null value in column "workforce_code" of relation "be_mobile_workforce_accounts" violates not-null constraint
```

## Why the earlier SQL still failed

The failing insert is still an old/legacy insert that omits `workforce_code`.
Changing only one seed block is not enough when another page/module still inserts:

```text
RID001 / rider / Ko Kyaw Zin Khant
```

without explicitly setting `workforce_code`.

This patch adds a database-level `BEFORE INSERT OR UPDATE` trigger so old SQL will be repaired automatically before the NOT NULL check runs.

## Apply

Extract this package into the clean Enterprise Portal folder:

```powershell
cd "D:\britium-go-live\enterprise_portal"

Expand-Archive -Path "C:\Users\Administrator.DESKTOP-HJREAI3\Downloads\britium-workforce-trigger-hardfix.zip" -DestinationPath . -Force

node scripts\verify-workforce-trigger-hardfix.cjs
```

## Supabase SQL order

Because your full SQL already failed after creating the table, run this now:

```text
supabase/sql/96-mobile-workforce-workforce-code-trigger-hardfix.sql
```

Then rerun:

```text
supabase/sql/99-run-all-clean-enterprise-portal.sql
```

If you start from a fresh testing database, use this order:

```text
1. supabase/sql/00-bootstrap-core-schema.sql
2. supabase/sql/96-mobile-workforce-workforce-code-trigger-hardfix.sql
3. supabase/sql/99-run-all-clean-enterprise-portal.sql
```

## Verify

```sql
select
  workforce_code,
  coalesce(role_type, workforce_type) as role_type,
  full_name,
  phone_number,
  status
from public.be_mobile_workforce_accounts
order by coalesce(role_type, workforce_type), workforce_code;

select public.be_master_dropdown_snapshot('en') -> 'counts';
```

Expected rider codes:

```text
RID001
RID002
RID003
```

Expected driver codes:

```text
DRV001
DRV002
DRV003
```

No row should have `workforce_code` as null.
