
begin;

create or replace function public.be_sync_workforce_wallets()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_count integer:=0;
begin
  insert into public.be_workforce_wallets(
    code,name,role,status,worker_code,worker_name,worker_role,
    wayplan_id,delivery_way_id,source,earning_type,amount,wallet_status,
    reference_no,metadata,earned_at,updated_at
  )
  select
    'WALLET-'||e.role_code||'-'||coalesce(e.tracking_no,e.pickup_id,e.source_key),
    e.assignee_name,e.role_code,'active',
    coalesce(
      e.metadata->>'worker_code',
      case e.role_code
        when 'RIDER' then p.assigned_rider_code
        when 'DRIVER' then p.assigned_driver_code
        when 'HELPER' then p.assigned_helper_code
      end
    ),
    e.assignee_name,e.role_code,e.wayplan_code,
    coalesce(e.tracking_no,e.pickup_id,e.source_key),
    'COMMISSION_EVENT','COMMISSION',e.commission_mmk,
    case when upper(coalesce(e.event_status,'')) in ('PAID','SETTLED') then 'SETTLED' else 'PENDING' end,
    e.id::text,
    coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object(
      'commission_event_id',e.id,
      'operation_type',e.operation_type,
      'unit_count',e.unit_count,
      'rate_mmk',e.rate_mmk,
      'policy_version','COMMISSION_2026_09_30'
    ),
    e.created_at,now()
  from public.be_commission_events e
  left join public.be_portal_pickup_requests p on p.pickup_id=e.pickup_id
  where e.role_code in ('RIDER','DRIVER','HELPER')
    and nullif(e.assignee_email,'') is not null
    and coalesce(
      e.metadata->>'worker_code',
      case e.role_code
        when 'RIDER' then p.assigned_rider_code
        when 'DRIVER' then p.assigned_driver_code
        when 'HELPER' then p.assigned_helper_code
      end
    ) is not null
  on conflict(worker_code,worker_role,delivery_way_id,earning_type) do update
  set name=excluded.name,role=excluded.role,status=excluded.status,
      worker_name=excluded.worker_name,wayplan_id=excluded.wayplan_id,
      source='COMMISSION_EVENT',amount=excluded.amount,
      wallet_status=excluded.wallet_status,reference_no=excluded.reference_no,
      metadata=excluded.metadata,earned_at=excluded.earned_at,updated_at=now();

  get diagnostics v_count=row_count;

  perform public.be_refresh_party_wallets_v1();

  return jsonb_build_object(
    'ok',true,'source','be_commission_events',
    'status','SYNCED','rows',v_count,
    'policy_version','COMMISSION_2026_09_30'
  );
end;
$$;

revoke all on function public.be_sync_workforce_wallets()
from public,anon;
grant execute on function public.be_sync_workforce_wallets()
to authenticated,service_role;

commit;
