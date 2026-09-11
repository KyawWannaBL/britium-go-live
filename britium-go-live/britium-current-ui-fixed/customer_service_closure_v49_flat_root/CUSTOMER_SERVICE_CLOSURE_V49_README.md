# Britium Express Customer Service Closure V49

## Purpose

V49 implements Step 12 of the operational workflow:

`Rider final outcome -> Finance clearance -> customer communication -> close or escalate`

The existing CS Command ticket and messaging functions remain intact. V49 adds a closure queue to the top of `/#/cs-command`.

## Closure controls

A delivered parcel can close only after:

- delivery proof is available;
- customer communication is recorded;
- COD is `SETTLED` when expected COD is greater than zero;
- a closure note is supplied.

A `FAILED`, `RTO`, or `CANCELLED` parcel can close only after:

- customer communication is recorded;
- a next disposition is selected;
- an operational resolution reference is supplied;
- a closure note is supplied.

Unresolved financial or operational obligations can be escalated to Operations, Dispatch, Warehouse, Finance, Supervisor, or Customer Service.

## V47.2 diagnostic note

The result `removed_missing_view_column: false` is caused by the literal text `j.asset_code` remaining in a SQL comment inside the function definition. The executable query uses `be_wayplan_membership_v40.vehicle_code`, which is confirmed by `canonical_membership_source: true`.

A better verification query is:

```sql
select
  position('from public.be_v_enterprise_dispatch_jobs' in pg_get_functiondef(
    'public.be_publish_wayplan_to_dispatch(text,text)'::regprocedure
  )) = 0 as removed_legacy_view_dependency,
  position('be_wayplan_membership_v40 m' in pg_get_functiondef(
    'public.be_publish_wayplan_to_dispatch(text,text)'::regprocedure
  )) > 0 as canonical_membership_source;
```

## Backend installation

Run the complete file in Supabase SQL Editor:

```text
customer_service_closure_v49.sql
```

Expected objects:

```text
be_cs_closure_snapshot_v49(text,integer)
be_cs_closure_sync_v49(text)
be_cs_record_customer_contact_v49(text,text,text,text,text,text,text,text)
be_cs_close_communication_v49(text,text,text,text)
be_cs_escalate_closure_v49(text,text,text,text,text)
be_cs_closure_status_v49(text)
be_cs_closure_v49
be_cs_closure_events_v49
```

## Frontend installation

Extract the flat-root ZIP beside `package.json` and `src`, then run:

```bash
node install_customer_service_closure_v49.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_customer_service_closure_v49.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY CUSTOMER SERVICE CLOSURE V49
```

Then deploy:

```bash
npx vercel --prod
```

## Production test

1. Complete one delivery in Rider V46.
2. For COD, settle the row in Finance V48.
3. Open `/#/cs-command`.
4. Click `Sync Outcomes`.
5. Select the delivered Way ID.
6. Record the customer communication.
7. Close with evidence.
8. Confirm the row becomes `CLOSED`.
9. Test a failed or RTO row without a disposition/reference and confirm closure is blocked.
10. Escalate an unresolved row and confirm it becomes `ESCALATED`.
