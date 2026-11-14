alter table public.be_field_finance_settlements_v1
  add column if not exists opening_cod_amount numeric not null default 0;

create or replace function public.be_finance_field_settlement_center_v1(
  p_work_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_date date := coalesce(p_work_date,(now() at time zone 'Asia/Yangon')::date);
  v_role text := public.be_current_role();
  v_rows jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'code','AUTH_REQUIRED');
  end if;
  if v_role not in ('finance','accountant','superadmin','super_admin','rider','driver','helper') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  insert into public.be_field_finance_settlements_v1(
    work_date,wayplan_id,vehicle_code,vehicle_name,
    rider_code,rider_name,driver_code,driver_name,helper_code,helper_name,
    total_ways,delivered_ways,failed_ways,remaining_ways,
    opening_cod_amount,expected_cod,actual_collected,cash_collected,digital_collected,variance_amount,
    status,updated_at
  )
  select
    v_date,
    w.wayplan_id,
    w.vehicle_code,w.vehicle_name,
    w.rider_code,w.rider_name,
    w.driver_code,w.driver_name,
    w.helper_code,w.helper_name,
    count(s.delivery_way_id)::int,
    count(*) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED'))::int,
    count(*) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO'))::int,
    count(*) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) not in (
      'DELIVERED','COMPLETED','FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO','CANCELLED'
    ))::int,
    coalesce(sum(s.cod_amount),0),
    coalesce(sum(s.cod_amount) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')),0),
    coalesce(sum(s.cod_collected) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')),0),
    coalesce(sum(s.cod_collected) filter(
      where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')
        and upper(coalesce(s.metadata->>'payment_mode','CASH'))='CASH'
    ),0),
    coalesce(sum(s.cod_collected) filter(
      where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')
        and upper(coalesce(s.metadata->>'payment_mode','')) in ('QR','BANK_TRANSFER','MOBILE_WALLET','MOBILE_BANKING')
    ),0),
    coalesce(sum(s.cod_collected) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')),0)
      - coalesce(sum(s.cod_amount) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')),0),
    case
      when count(*) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) not in (
        'DELIVERED','COMPLETED','FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO','CANCELLED'
      ))=0 then 'READY_TO_SETTLE'
      else 'OPEN'
    end,
    now()
  from public.be_wayplan_dispatches w
  join public.be_wayplan_dispatch_stops s on s.wayplan_id=w.wayplan_id
  where (coalesce(w.dispatched_at,w.planned_at,w.created_at) at time zone 'Asia/Yangon')::date=v_date
  group by w.wayplan_id,w.vehicle_code,w.vehicle_name,w.rider_code,w.rider_name,w.driver_code,w.driver_name,w.helper_code,w.helper_name
  on conflict (work_date,wayplan_id) do update
  set vehicle_code=excluded.vehicle_code,
      vehicle_name=excluded.vehicle_name,
      rider_code=excluded.rider_code,
      rider_name=excluded.rider_name,
      driver_code=excluded.driver_code,
      driver_name=excluded.driver_name,
      helper_code=excluded.helper_code,
      helper_name=excluded.helper_name,
      total_ways=excluded.total_ways,
      delivered_ways=excluded.delivered_ways,
      failed_ways=excluded.failed_ways,
      remaining_ways=excluded.remaining_ways,
      opening_cod_amount=excluded.opening_cod_amount,
      expected_cod=excluded.expected_cod,
      actual_collected=excluded.actual_collected,
      cash_collected=excluded.cash_collected,
      digital_collected=excluded.digital_collected,
      variance_amount=excluded.variance_amount,
      status=case when be_field_finance_settlements_v1.status='CLEARED' then 'CLEARED' else excluded.status end,
      updated_at=now();

  select coalesce(jsonb_agg(to_jsonb(q) order by q.vehicle_code,q.wayplan_id),'[]'::jsonb)
  into v_rows
  from (
    select f.*,
      jsonb_build_object(
        'finance', coalesce(f.party_signatures ? 'finance',false),
        'rider', case when nullif(f.rider_code,'') is null then true else f.party_signatures ? 'rider' end,
        'driver', case when nullif(f.driver_code,'') is null then true else f.party_signatures ? 'driver' end,
        'helper', case when nullif(f.helper_code,'') is null then true else f.party_signatures ? 'helper' end
      ) signature_status
    from public.be_field_finance_settlements_v1 f
    where f.work_date=v_date
      and (
        v_role in ('finance','accountant','superadmin','super_admin')
        or (v_role='rider' and upper(coalesce(f.rider_code,''))=upper(coalesce((public.be_current_field_team_identity()->>'worker_code'),'')))
        or (v_role='driver' and upper(coalesce(f.driver_code,''))=upper(coalesce((public.be_current_field_team_identity()->>'worker_code'),'')))
        or (v_role='helper' and upper(coalesce(f.helper_code,''))=upper(coalesce((public.be_current_field_team_identity()->>'worker_code'),'')))
      )
  ) q;

  return jsonb_build_object('ok',true,'work_date',v_date,'rows',v_rows,'build','FIELD_FINANCE_SETTLEMENT_V1');
end
$function$;

revoke all on function public.be_finance_field_settlement_center_v1(date) from public,anon;
grant execute on function public.be_finance_field_settlement_center_v1(date) to authenticated,service_role;

create or replace function public.be_finance_field_settlement_sign_v1(
  p_work_date date,
  p_wayplan_id text,
  p_signed_name text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_role text := public.be_current_role();
  v_identity jsonb := public.be_current_field_team_identity();
  v_code text := upper(coalesce(v_identity->>'worker_code',''));
  v_key text;
  v_row public.be_field_finance_settlements_v1%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if nullif(btrim(coalesce(p_signed_name,'')),'') is null then
    return jsonb_build_object('ok',false,'code','SIGNED_NAME_REQUIRED');
  end if;

  perform public.be_finance_field_settlement_center_v1(p_work_date);

  select * into v_row
  from public.be_field_finance_settlements_v1
  where work_date=p_work_date and wayplan_id=p_wayplan_id
  for update;

  if not found then return jsonb_build_object('ok',false,'code','SETTLEMENT_NOT_FOUND'); end if;
  if v_row.status='CLEARED' then return jsonb_build_object('ok',true,'status','CLEARED','already_applied',true); end if;

  if v_role in ('finance','accountant','superadmin','super_admin') then
    v_key := 'finance';
  elsif v_role='rider' and v_code=upper(coalesce(v_row.rider_code,'')) then
    v_key := 'rider';
  elsif v_role='driver' and v_code=upper(coalesce(v_row.driver_code,'')) then
    v_key := 'driver';
  elsif v_role='helper' and v_code=upper(coalesce(v_row.helper_code,'')) then
    v_key := 'helper';
  else
    return jsonb_build_object('ok',false,'code','SIGNER_NOT_ASSIGNED_TO_SETTLEMENT');
  end if;

  update public.be_field_finance_settlements_v1
  set party_signatures = coalesce(party_signatures,'{}'::jsonb) ||
      jsonb_build_object(v_key,jsonb_build_object(
        'signed_name',btrim(p_signed_name),
        'auth_user_id',auth.uid(),
        'role',v_role,
        'worker_code',nullif(v_code,''),
        'email',lower(coalesce(auth.jwt()->>'email','')),
        'signed_at',now(),
        'note',nullif(btrim(coalesce(p_note,'')),'')
      )),
      updated_at=now()
  where id=v_row.id;

  return jsonb_build_object('ok',true,'status','SIGNED','signer',v_key,'wayplan_id',p_wayplan_id);
end
$function$;

revoke all on function public.be_finance_field_settlement_sign_v1(date,text,text,text) from public,anon;
grant execute on function public.be_finance_field_settlement_sign_v1(date,text,text,text) to authenticated,service_role;

create or replace function public.be_finance_field_settlement_clear_v1(
  p_work_date date,
  p_wayplan_id text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_role text := public.be_current_role();
  v_row public.be_field_finance_settlements_v1%rowtype;
  v_ref text;
  v_cod jsonb;
  v_commission jsonb;
  v_merchant jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if v_role not in ('finance','accountant','superadmin','super_admin') then
    return jsonb_build_object('ok',false,'code','FINANCE_AUTHORITY_REQUIRED');
  end if;

  perform public.be_finance_field_settlement_center_v1(p_work_date);

  select * into v_row
  from public.be_field_finance_settlements_v1
  where work_date=p_work_date and wayplan_id=p_wayplan_id
  for update;

  if not found then return jsonb_build_object('ok',false,'code','SETTLEMENT_NOT_FOUND'); end if;
  if v_row.status='CLEARED' then return jsonb_build_object('ok',true,'status','CLEARED','already_applied',true); end if;
  if v_row.remaining_ways<>0 then return jsonb_build_object('ok',false,'code','WAYS_STILL_ACTIVE','remaining_ways',v_row.remaining_ways); end if;
  if abs(coalesce(v_row.variance_amount,0))>0.01 then
    return jsonb_build_object('ok',false,'code','COLLECTION_VARIANCE_MUST_BE_RESOLVED','variance_amount',v_row.variance_amount);
  end if;
  if not (v_row.party_signatures ? 'finance') then return jsonb_build_object('ok',false,'code','FINANCE_SIGNATURE_REQUIRED'); end if;
  if nullif(v_row.rider_code,'') is not null and not (v_row.party_signatures ? 'rider') then return jsonb_build_object('ok',false,'code','RIDER_SIGNATURE_REQUIRED'); end if;
  if nullif(v_row.driver_code,'') is not null and not (v_row.party_signatures ? 'driver') then return jsonb_build_object('ok',false,'code','DRIVER_SIGNATURE_REQUIRED'); end if;
  if nullif(v_row.helper_code,'') is not null and not (v_row.party_signatures ? 'helper') then return jsonb_build_object('ok',false,'code','HELPER_SIGNATURE_REQUIRED'); end if;

  v_ref := 'EOD-'||to_char(p_work_date,'YYYYMMDD')||'-'||regexp_replace(p_wayplan_id,'[^A-Za-z0-9]','','g');

  select public.be_finance_settle_wayplan_cod(jsonb_build_object(
    'wayplan_id',p_wayplan_id,
    'settlement_reference',v_ref,
    'settlement_receiver','Finance',
    'settlement_note',coalesce(nullif(btrim(coalesce(p_note,'')),''),'End-of-day field settlement cleared'),
    'actor',lower(coalesce(auth.jwt()->>'email','finance'))
  )) into v_cod;

  if not coalesce((v_cod->>'ok')::boolean,false) then
    return v_cod || jsonb_build_object('code','COD_SETTLEMENT_FAILED');
  end if;

  update public.be_field_finance_settlements_v1
  set status='CLEARED',
      settlement_note=coalesce(nullif(btrim(coalesce(p_note,'')),''),settlement_note),
      cleared_by=auth.uid(),
      cleared_at=now(),
      updated_at=now()
  where id=v_row.id;

  select public.be_commission_settlement_snapshot(p_work_date,lower(coalesce(auth.jwt()->>'email','finance')),true) into v_commission;
  select public.be_accounting_sync_merchant_settlements_v1(p_work_date,p_work_date) into v_merchant;

  return jsonb_build_object(
    'ok',true,'status','CLEARED','wayplan_id',p_wayplan_id,'settlement_reference',v_ref,
    'cod_settlement',v_cod,'workforce_commission_sync',v_commission,'merchant_settlement_sync',v_merchant
  );
end
$function$;

revoke all on function public.be_finance_field_settlement_clear_v1(date,text,text) from public,anon;
grant execute on function public.be_finance_field_settlement_clear_v1(date,text,text) to authenticated,service_role;
