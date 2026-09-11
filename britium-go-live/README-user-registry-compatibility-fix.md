# Britium User Registry Schema Compatibility Fix

## Error fixed

```txt
ERROR: 42703: column "user_id" of relation "be_user_account_registry" does not exist
LINE 355: insert into public.be_user_account_registry(user_id, ...)
```

## Why this happens

Your clean starter schema uses `auth_user_id`, but one seed block still inserts into legacy `user_id`.

## Apply

```powershell
cd "D:\britium-go-live\enterprise_portal"

Expand-Archive -Path "C:\Users\Administrator.DESKTOP-HJREAI3\Downloads\britium-user-registry-schema-compatibility-fix.zip" -DestinationPath . -Force

node scripts\apply-user-registry-compat-fix.cjs
node scripts\verify-user-registry-compat-fix.cjs
```

## SQL order in Supabase

Run this first:

```txt
supabase/sql/97-user-account-registry-schema-compatibility-fix.sql
```

Then rerun:

```txt
supabase/sql/99-run-all-clean-enterprise-portal.sql
```

If you ran the apply script, the 97 fix is also injected at the top of 99.

## Verify

```sql
select public.be_user_registry_compat_verification();

select user_id, auth_user_id, full_name, role, phone_number, branch_code, status
from public.be_user_account_registry
order by created_at desc
limit 20;
```
