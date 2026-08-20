# Britium Workforce Code SQL Fix

## Problem fixed

Supabase failed with:

```text
ERROR: 23502: null value in column "workforce_code" of relation "be_mobile_workforce_accounts" violates not-null constraint
```

The testing/production database already has `be_mobile_workforce_accounts.workforce_code` as a required column, but the clean starter seed inserted rider/driver rows without setting `workforce_code`.

## Files included

```text
supabase/sql/00-bootstrap-core-schema.sql
supabase/sql/10-seed-masterdata-from-authoritative-template.sql
supabase/sql/95-mobile-workforce-code-compatibility-fix.sql
supabase/sql/99-run-all-clean-enterprise-portal.sql
scripts/verify-workforce-code-sql-fix.cjs
```

## Apply

Extract this patch into your clean Enterprise Portal folder:

```powershell
cd "D:\britium-go-live\enterprise_portal"

Expand-Archive -Path "C:\Users\Administrator.DESKTOP-HJREAI3\Downloads\britium-workforce-code-sql-fix.zip" -DestinationPath . -Force

node scripts\verify-workforce-code-sql-fix.cjs
```

## Supabase order

If your previous `99-run-all-clean-enterprise-portal.sql` already failed, run this first:

```text
supabase/sql/95-mobile-workforce-code-compatibility-fix.sql
```

Then rerun the patched full SQL:

```text
supabase/sql/99-run-all-clean-enterprise-portal.sql
```

## Verify

```sql
select worker_id, workforce_code, full_name, role_type, phone_number, status
from public.be_mobile_workforce_accounts
order by role_type, workforce_code;

select public.be_master_dropdown_snapshot('en') -> 'counts';
```

Expected rider values should use template codes such as `RID001`, `RID002`, `RID003`.

Expected driver values should use template codes such as `DRV001`, `DRV002`.
