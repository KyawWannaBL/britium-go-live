# Pickup duplicate confirmation patch

## Purpose

When the same merchant already has an active pickup request on the same pickup date, the backend no longer fails with `pickup_way_uidx`.

Instead, it returns:

```json
{
  "ok": false,
  "requires_confirmation": true,
  "reason": "ACTIVE_PICKUP_EXISTS",
  "message": "APAC for DD/MM/YYYY order picking request has already accepted and assigned..."
}
```

The frontend should ask the user:

> APAC for DD/MM/YYYY order picking request has already accepted and assigned. Is this another order picking request? Are you willing to move on?

If the user confirms, call the same RPC again with:

```ts
p_duplicate_confirmed: true
```

The backend then creates the next valid pickup ID / pickup way ID.

## Files

- `pickup_duplicate_confirmation_patch.sql`
- `PickupForm.duplicate_confirmation_snippet.ts`

## Apply order

1. Run `pickup_duplicate_confirmation_patch.sql`
2. Add the frontend snippet into the Pickup Form submit handler
3. Deploy
4. Wait 30-60 seconds or run `notify pgrst, 'reload schema';`

## Verify

```sql
select
  p.oid::regprocedure as rpc_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'be_create_pickup_request_from_master'
order by 1;
```

Expected signatures:

```text
be_create_pickup_request_from_master(text,text,integer,text,text,text,date,text,text,text,text)
be_create_pickup_request_from_master(text,text,integer,text,text,text,date,text,text,text,text,boolean)
```
