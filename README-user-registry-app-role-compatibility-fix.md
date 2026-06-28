
# Britium user registry app_role compatibility fix

This patch fixes Supabase seed/runtime failures where `public.be_user_account_registry.app_role`
is `NOT NULL`, but legacy seed blocks insert rider/driver/user rows without `app_role`.

## Error fixed

```text
ERROR: 23502: null value in column "app_role" of relation "be_user_account_registry" violates not-null constraint
```

## Apply

```powershell
cd "D:\britium-go-live\enterprise_portal"

Expand-Archive -Path "C:\Users\Administrator.DESKTOP-HJREAI3\Downloads\britium-user-registry-app-role-compatibility-fix.zip" -DestinationPath . -Force

node scripts\apply-user-registry-app-role-compat-fix.cjs
node scripts\verify-user-registry-app-role-compat-fix.cjs
```

Then run in Supabase SQL Editor:

```text
supabase/sql/98-user-registry-app-role-compatibility-fix.sql
```

Then rerun:

```text
supabase/sql/99-run-all-clean-enterprise-portal.sql
```

If the apply script injected this fix into `99-run-all-clean-enterprise-portal.sql`, rerunning `99` alone is also fine.

## Verification

```sql
select public.be_user_registry_app_role_compat_verification();

select user_id, auth_user_id, full_name, role, app_role, email, phone_number, branch_code, status
from public.be_user_account_registry
order by created_at desc
limit 20;
```

Expected: `app_role` is never null. Template driver/rider records should become:

- `driver`
- `rider`
- `helper`
- `merchant`
- `warehouse`
- `finance`
- `customer_service`
- `supervisor`
- `admin`
- `user`

This patch does not create Supabase Auth users. It only keeps the application user registry compatible with stricter NOT NULL schema constraints.
