# Britium user registry email compatibility fix

Fixes this Supabase SQL error:

```txt
ERROR: 23502: null value in column "email" of relation "be_user_account_registry" violates not-null constraint
```

## Cause

The clean seed SQL creates user-account rows from rider/driver/workforce master records. Some insert blocks do not provide `email`, while your current `be_user_account_registry.email` column is `NOT NULL`.

## What this patch does

- Adds `98-user-registry-email-required-compatibility-fix.sql`
- Creates a BEFORE INSERT/UPDATE trigger on `public.be_user_account_registry`
- Auto-generates safe testing emails like:
  - `rider-rid001@testing.britium.local`
  - `driver-drv001@testing.britium.local`
- Backfills existing null emails
- Re-enforces `email NOT NULL`
- Injects the fix before the master-data seed block inside `99-run-all-clean-enterprise-portal.sql`

## Apply

```powershell
cd "D:\britium-go-live\enterprise_portal"

Expand-Archive -Path "C:\Users\Administrator.DESKTOP-HJREAI3\Downloads\britium-user-registry-email-compatibility-fix.zip" -DestinationPath . -Force

node scripts\apply-user-registry-email-compat-fix.cjs
node scripts\verify-user-registry-email-compat-fix.cjs
```

## Supabase SQL order

Run the patched full SQL:

```txt
supabase/sql/99-run-all-clean-enterprise-portal.sql
```

Or, if running files manually:

```txt
supabase/sql/00-bootstrap-core-schema.sql
supabase/sql/98-user-registry-email-required-compatibility-fix.sql
supabase/sql/10-seed-masterdata-from-authoritative-template.sql
```

## Verify

```sql
select public.be_user_registry_email_compat_verification();

select user_id, auth_user_id, full_name, role, email, phone_number, branch_code, status
from public.be_user_account_registry
order by created_at desc
limit 20;
```
