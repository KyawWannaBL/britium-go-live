# Britium UAT Role Authority + Account Provisioning

## Purpose

This package prepares role authority levels, role rights, registry mappings, and the 16 UAT test accounts requested for Britium Enterprise Portal and Rider App.

The UAT password is:

```txt
P@ssw0rd1
```

All requested accounts are configured with:

```txt
must_change_password = false
email_confirm = true
is_uat_account = true
```

## Files

| File | Purpose |
| --- | --- |
| `01_role_authority_and_registry.sql` | Creates/updates role authority table, user registry table, mobile workforce table, and UAT account staging table. |
| `seed_uat_accounts.mjs` | Creates/updates Supabase Auth users using the Admin API and maps them to registry/workforce tables. |
| `uat_accounts.csv` | Human-readable UAT account list. |

## Run order

### 1. Run SQL first

Open Supabase SQL Editor and run:

```sql
01_role_authority_and_registry.sql
```

This creates or updates:

```txt
be_role_authority_matrix
be_user_account_registry
be_mobile_workforce_accounts
be_uat_test_accounts
be_current_user_role()
be_can_access_module()
```

### 2. Install dependencies

On a trusted local machine or server:

```bash
npm install @supabase/supabase-js
```

### 3. Set environment variables

Linux / macOS:

```bash
export SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
export UAT_TEST_PASSWORD="P@ssw0rd1"
```

Windows PowerShell:

```powershell
$env:SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
$env:UAT_TEST_PASSWORD="P@ssw0rd1"
```

### 4. Create or update Auth users

```bash
node seed_uat_accounts.mjs
```

## Verification SQL

```sql
select email, role_id, role_name, authority_level, must_change_password, is_active
from public.be_user_account_registry
where is_uat_account = true
order by authority_level desc, email;
```

```sql
select email, role, workforce_code, status, must_change_password, is_active
from public.be_mobile_workforce_accounts
where is_uat_account = true
order by role, email;
```

## UAT Accounts

| Role | Email |
| --- | --- |
| Super Admin | testadmin@britiumexpress.com |
| Marketing | testmarketing@britiumexpress.com |
| Bus. Dev. Manager | testbusiness_development_manager@britiumexpress.com |
| Branch Manager | testbranch_office_manager@britiumexpress.com |
| Staff | teststaff@britiumexpress.com |
| Customer Service | testcustomer_service@britiumexpress.com |
| Data Entry | testdata_entry@britiumexpress.com |
| Supervisor | testsupervisor@britiumexpress.com |
| Warehouse | testwarehouse@britiumexpress.com |
| Dispatch | testdispatch@britiumexpress.com |
| Finance | testfinance@britiumexpress.com |
| Merchant | testmerchant@britiumexpress.com |
| Customer | testcustomer@britiumexpress.com |
| Rider | testrider@britiumexpress.com |
| Driver | testdriver@britiumexpress.com |
| Helper | testhelper@britiumexpress.com |

## Security note

The service-role key bypasses RLS and must be used only from a trusted server or local admin machine. Never place it inside frontend code, mobile app code, or public repositories.
