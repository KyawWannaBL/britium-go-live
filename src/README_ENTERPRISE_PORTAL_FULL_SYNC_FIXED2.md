# Britium Enterprise Portal Full Sync Patch - Fixed2

This fixed version resolves PostgreSQL error:

`function public.be_supervisor_portal_snapshot() is not unique`

## Why it happened

The UAT database already had older overloaded RPC functions with the same names and default parameters. PostgreSQL could not decide which function to call from `be_portal_sync_smoke_test()`.

## Fix

The SQL now drops **all overloaded versions** of these portal snapshot RPCs before recreating the canonical versions:

- `be_supervisor_portal_snapshot`
- `be_supervisor_pickup_snapshot`
- `be_supervisor_wayplan_snapshot`
- `be_finance_portal_snapshot`
- `be_invoice_studio_snapshot`
- `be_cod_settlement_snapshot`
- `be_rider_settlement_snapshot`
- `be_customer_portal_snapshot`
- `be_branch_office_portal_snapshot`
- `be_portal_sync_smoke_test`

## Install

1. In Supabase SQL Editor, run:

```sql
rollback;
```

2. Run the full file:

```text
enterprise_portal_full_sync.fixed2.sql
```

3. Verify:

```sql
select public.be_enterprise_portal_healthcheck();
select public.be_portal_sync_smoke_test();

select
  p.oid::regprocedure as rpc_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'be_supervisor_portal_snapshot',
    'be_supervisor_pickup_snapshot',
    'be_supervisor_wayplan_snapshot',
    'be_finance_portal_snapshot',
    'be_invoice_studio_snapshot',
    'be_cod_settlement_snapshot',
    'be_rider_settlement_snapshot',
    'be_customer_portal_snapshot',
    'be_branch_office_portal_snapshot'
  )
order by p.proname, p.oid::regprocedure::text;
```

Expected: one canonical signature for each snapshot RPC.
