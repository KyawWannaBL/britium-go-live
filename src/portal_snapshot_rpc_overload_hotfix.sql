rollback;

begin;

-- Remove old overloaded snapshot RPCs that make PostgreSQL/PostgREST unable to choose a candidate.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'be_enterprise_portal_healthcheck',
        'be_supervisor_portal_snapshot',
        'be_supervisor_pickup_snapshot',
        'be_supervisor_wayplan_snapshot',
        'be_finance_portal_snapshot',
        'be_invoice_studio_snapshot',
        'be_cod_settlement_snapshot',
        'be_rider_settlement_snapshot',
        'be_customer_portal_snapshot',
        'be_branch_office_portal_snapshot',
        'be_portal_sync_smoke_test'
      )
  loop
    execute 'drop function if exists ' || r.fn || ' cascade';
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
