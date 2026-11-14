-- Dashboard KPI alignment, 2026-11-05.
-- Retains authorization and business-day/branch scope from the production function.
-- Keeps existing pickups_today for old clients while adding explicit categories.
-- No mutation of pickup or financial records.
CREATE OR REPLACE FUNCTION public.be_role_dashboard_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
  v_branch text;
  v_today date:=(now() at time zone 'Asia/Yangon')::date;
  v_operations jsonb:='{}'::jsonb;
  v_finance jsonb:='{}'::jsonb;
  v_warehouse jsonb:='{}'::jsonb;
  v_hr jsonb:='{}'::jsonb;
  v_growth jsonb:='{}'::jsonb;
  v_branches jsonb:='{}'::jsonb;
  v_scope text;
  v_super boolean;
  v_ops boolean;
  v_fin boolean;
  v_hr_ok boolean;
  v_growth_ok boolean;
  v_branch_ok boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;

  select coalesce(nullif(branch_code,''),'YGN') into v_branch
  from public.be_user_account_registry
  where auth_user_id=auth.uid()
  order by updated_at desc nulls last limit 1;
  v_branch:=coalesce(v_branch,'YGN');

  v_super:=v_role in ('superadmin','super_admin','admin','management','director');
  v_ops:=v_super or v_role in ('operation_manager','operations','operations_admin','supervisor','warehouse','warehouse_staff','sorter','dispatch','wayplan_manager','customer_service','cs','support','data_entry','encoder','branch_office','branch_manager','branch_staff','branch_admin');
  v_fin:=v_super or v_role in ('finance','finance_user','accountant');
  v_hr_ok:=v_super or v_role='hr_admin';
  v_growth_ok:=v_super or v_role in ('marketing','business_development','biz_dev');
  v_branch_ok:=v_super or v_role in ('branch_office','branch_manager','branch_staff','branch_admin');
  v_scope:=case when v_super or v_role in ('operation_manager','operations_admin') then 'ENTERPRISE' else 'ROLE' end;

  if v_ops then
    select jsonb_build_object(
      'pickups_today',count(*) filter(where (created_at at time zone 'Asia/Yangon')::date=v_today),
      'pickup_requests_today',count(*) filter(where (created_at at time zone 'Asia/Yangon')::date=v_today),
      'pending_pickups',count(*) filter(where upper(coalesce(nullif(pickup_status,''),status,'')) in ('WAITING_ASSIGNMENT','SUBMITTED','PENDING_ASSIGNMENT','PENDING')),
      'pickups_in_progress',count(*) filter(where upper(coalesce(nullif(pickup_status,''),status,'')) in ('ASSIGNED','RIDER_ASSIGNED','FIELD_TEAM_AT_PICKUP','PICKUP_VERIFICATION_IN_PROGRESS','PICKUP_IN_PROGRESS','PICKUP_STARTED','PICKUP_COLLECTING','RIDER_ACCEPTED')),
      'pickups_completed',count(*) filter(where upper(coalesce(nullif(pickup_status,''),status,'')) in ('PICKUP_COLLECTED','COLLECTED','PICKED_UP','DELIVERED_TO_WAREHOUSE','RECEIVED_AT_WAREHOUSE','PICKUP_COMPLETED','COMPLETED')),
      'active_shipments',count(*) filter(where upper(coalesce(status,pickup_status,'')) in ('PICKED_UP','IN_WAREHOUSE','SORTING','BAGGED','DISPATCHED','OUT_FOR_DELIVERY')),
      'delivered_today',count(*) filter(where upper(coalesce(status,pickup_status,''))='DELIVERED' and (updated_at at time zone 'Asia/Yangon')::date=v_today),
      'failed_today',count(*) filter(where upper(coalesce(status,pickup_status,'')) in ('FAILED_ATTEMPT','DELIVERY_FAILED','FAILED_DELIVERY') and (updated_at at time zone 'Asia/Yangon')::date=v_today),
      'exceptions_open',count(*) filter(where upper(coalesce(status,pickup_status,'')) in ('EXCEPTION','ON_HOLD','WAREHOUSE_HOLD')),
      'branch',case when v_scope='ENTERPRISE' then 'ALL' else v_branch end
    ) into v_operations
    from public.be_portal_pickup_requests p
    where v_scope='ENTERPRISE' or coalesce(p.branch_code,'YGN')=v_branch;

    -- Parcel registrations are a separate metric from pickup request headers.
    -- Use Yangon business date and keep branch-scoped dashboard access.
    select v_operations || jsonb_build_object(
      'parcels_registered_today',count(*),
      'pickup_batches_registered_today',count(distinct d.pickup_id)
    ) into v_operations
    from public.be_data_entry_parcel_details d
    where (d.created_at at time zone 'Asia/Yangon')::date=v_today
      and (
        v_scope='ENTERPRISE'
        or exists (
          select 1 from public.be_portal_pickup_requests p
          where p.pickup_id=d.pickup_id and coalesce(p.branch_code,'YGN')=v_branch
        )
      );

    -- Delivery lifecycle KPIs must use authoritative dispatch stops, not pickup request headers.
    with latest_stops as (
      select distinct on (upper(s.delivery_way_id))
        upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) lifecycle,
        s.delivered_at, s.updated_at
      from public.be_wayplan_dispatch_stops s
      where nullif(btrim(s.delivery_way_id),'') is not null
        and (v_scope='ENTERPRISE' or coalesce(s.branch_code,'YGN')=v_branch)
      order by upper(s.delivery_way_id), s.updated_at desc nulls last
    )
    select v_operations || jsonb_build_object(
      'active_shipments',count(*) filter (where lifecycle in (
        'READY_FOR_DISPATCH','DISPATCHED','RIDER_ACCEPTED','DELIVERY_ACCEPTED',
        'ACCEPTED_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERY_STARTED','ARRIVED_AT_CUSTOMER'
      )),
      'delivered_today',count(*) filter (where lifecycle in (
        'DELIVERED','DELIVERY_COMPLETED','POD_VERIFIED','COMPLETED'
      ) and (coalesce(delivered_at,updated_at) at time zone 'Asia/Yangon')::date=v_today),
      'failed_today',count(*) filter (where lifecycle in (
        'DELIVERY_FAILED','FAILED_DELIVERY','FAILED_ATTEMPT'
      ) and (updated_at at time zone 'Asia/Yangon')::date=v_today)
    ) into v_operations from latest_stops;

    select jsonb_build_object(
      'rows',coalesce(jsonb_array_length(coalesce(w->'rows','[]'::jsonb)),0),
      'inbound',coalesce((w->'stats'->>'received')::int,0),
      'dispatch',coalesce((w->'stats'->>'dispatch_scanned')::int,0),
      'returns',coalesce((w->'stats'->>'returns')::int,0),
      'awaiting_return_scan',coalesce((w->'stats'->>'awaiting_return_scan')::int,0),
      'ready_for_wayplan',coalesce((w->'stats'->>'ready_for_wayplan')::int,0),
      'warehouse_source','be_warehouse_scan_lifecycle_snapshot_v164.stats',
      'build',w->>'build'
    ) into v_warehouse from (select public.be_warehouse_scan_lifecycle_snapshot_v164() w)x;
  end if;

  if v_fin then
    select jsonb_build_object(
      'settlement_rows',count(*),
      'pending_rows',count(*) filter(where upper(coalesce(settlement_state,''))<>'SETTLED'),
      'settled_rows',count(*) filter(where upper(coalesce(settlement_state,''))='SETTLED'),
      'cod_expected',coalesce(sum(customer_total_collection),0),
      'merchant_payable',coalesce(sum(greatest(coalesce(merchant_final_settlement_amount,0),0)),0),
      'merchant_receivable',coalesce(sum(coalesce(merchant_receivable,0)),0),
      'delivery_revenue',coalesce(sum(coalesce(net_system_delivery_charge,0)),0)
    ) into v_finance from public.be_v_finance_merchant_settlement_queue_v2;
  end if;

  if v_hr_ok then
    select jsonb_build_object(
      'total_employees',coalesce((h->'summary'->>'total_employees')::int,0),
      'active_employees',coalesce((h->'summary'->>'active_employees')::int,0),
      'departments',coalesce((h->'summary'->>'departments')::int,0),
      'branches',coalesce((h->'summary'->>'branches')::int,0),
      'riders',coalesce((h->'summary'->>'riders')::int,0),
      'drivers',coalesce((h->'summary'->>'drivers')::int,0),
      'helpers',coalesce((h->'summary'->>'helpers')::int,0)
    ) into v_hr from (select public.be_hr_dashboard() h)x;
    -- HR headcount is separate from Rider App credentialed workforce.
    -- Label these as app accounts in the client, not employees.
    select v_hr || jsonb_build_object(
      'riders',count(*) filter(where lower(coalesce(role,''))='rider'),
      'drivers',count(*) filter(where lower(coalesce(role,''))='driver'),
      'helpers',count(*) filter(where lower(coalesce(role,''))='helper'),
      'workforce_source','be_mobile_workforce_accounts.active'
    ) into v_hr
    from public.be_mobile_workforce_accounts
    where is_active=true;
  end if;

  if v_growth_ok then
    select jsonb_build_object(
      'merchants',(select count(*) from public.be_master_merchants where upper(coalesce(status,'ACTIVE'))='ACTIVE'),
      'leads',(select count(*) from public.be_marketing_leads),
      'active_prospects',(select count(*) from public.be_bd_accounts where lower(coalesce(status,'active'))='active' and lower(coalesce(stage,'prospect')) not in ('closed_won','closed_lost')),
      'pipeline_value',(select coalesce(sum(expected_monthly_revenue),0) from public.be_bd_accounts where lower(coalesce(status,'active'))='active'),
      'closed_won',(select count(*) from public.be_bd_accounts where lower(coalesce(stage,''))='closed_won')
    ) into v_growth;
  end if;

  if v_branch_ok then
    select jsonb_build_object(
      'total_branches',count(*),
      'active_branches',count(*) filter(where lower(coalesce(status,'active'))='active'),
      'pending_amendments',(select count(*) from public.be_branch_amendment_requests where upper(coalesce(approval_status,'PENDING'))='PENDING'),
      'staff',(select count(*) from public.be_branch_staff)
    ) into v_branches from public.be_branch_offices;
  end if;

  return jsonb_build_object(
    'ok',true,'role',v_role,'scope',v_scope,'branch_code',v_branch,'work_date',v_today,'as_of',now(),
    'operations',v_operations,'finance',v_finance,'warehouse',v_warehouse,'hr',v_hr,'growth',v_growth,'branches',v_branches,
    'permissions',jsonb_build_object('operations',v_ops,'finance',v_fin,'hr',v_hr_ok,'growth',v_growth_ok,'branches',v_branch_ok,'bird_eye',v_super)
  );
end;
$function$;
