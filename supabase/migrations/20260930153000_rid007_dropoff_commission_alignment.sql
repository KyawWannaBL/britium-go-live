begin;

update public.rider_master rm
set rider_name = mr.rider_name,
    phone_primary = mr.phone_primary,
    updated_at = now()
from public.be_master_riders mr
where rm.rider_id='RID007'
  and mr.rider_id='RID007';

update public.be_workforce_wallets
set name='Bo Bo Kyaw',
    worker_code='RID007',
    worker_name='Bo Bo Kyaw',
    worker_role='RIDER',
    updated_at=now()
where code='RID007'
   or worker_code='RID007';

update public.be_commission_rate_master
set active=false,
    effective_to=case
      when effective_from < date '2026-09-30'
        then least(coalesce(effective_to,date '2026-09-29'),date '2026-09-29')
      else effective_to
    end,
    updated_at=now()
where operation_type='HIGHWAY_DROPOFF'
  and active;

insert into public.be_commission_rate_master(
  operation_type,role_code,unit_type,rate_mmk,active,effective_from,effective_to,notes,created_at,updated_at
)
select *
from (values
  ('HIGHWAY_DROPOFF','RIDER','BAG',300::numeric,true,date '2026-09-30',null::date,'All successful rider drop-off ways: 300 MMK',now(),now()),
  ('HIGHWAY_DROPOFF','DRIVER','BAG',150::numeric,true,date '2026-09-30',null::date,'All successful driver drop-off ways: 150 MMK',now(),now()),
  ('HIGHWAY_DROPOFF','HELPER','BAG',150::numeric,true,date '2026-09-30',null::date,'All successful helper drop-off ways: 150 MMK',now(),now())
) v(operation_type,role_code,unit_type,rate_mmk,active,effective_from,effective_to,notes,created_at,updated_at)
where not exists(
  select 1 from public.be_commission_rate_master r
  where r.operation_type=v.operation_type
    and r.role_code=v.role_code
    and r.unit_type=v.unit_type
    and r.effective_from=v.effective_from
    and r.active
);

update public.be_commission_events
set rate_mmk=300,
    commission_mmk=300 * greatest(coalesce(unit_count,1),1),
    metadata=coalesce(metadata,'{}'::jsonb)
      || jsonb_build_object(
        'policy_version','COMMISSION_2026_09_30',
        'corrected_reason','RID007_CANONICAL_DROPOFF_RATE'
      ),
    updated_at=now()
where lower(coalesce(assignee_email,''))='rider_ygn_0007@britiumventures.com'
  and upper(coalesce(role_code,''))='RIDER'
  and operation_type in ('DELIVERY','HIGHWAY_DROPOFF')
  and upper(coalesce(event_status,'')) not in ('PAID','SETTLED');

commit;
