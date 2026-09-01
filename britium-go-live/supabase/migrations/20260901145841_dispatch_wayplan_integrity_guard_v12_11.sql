create or replace function public.be_dispatch_wayplan_integrity_v12_11(
  p_wayplan_id text,
  p_rider_code text default null,
  p_driver_code text default null,
  p_helper_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id,'')),'');
  v_rider text := upper(nullif(btrim(coalesce(p_rider_code,'')),''));
  v_driver text := upper(nullif(btrim(coalesce(p_driver_code,'')),''));
  v_helper text := upper(nullif(btrim(coalesce(p_helper_code,'')),''));
  v_total integer := 0;
  v_canonical integer := 0;
  v_registered integer := 0;
  v_financial_valid integer := 0;
  v_scanned integer := 0;
  v_membership integer := 0;
  v_membership_ready integer := 0;
  v_review_status text;
  v_rider_ok boolean := true;
  v_driver_ok boolean := true;
  v_helper_ok boolean := true;
  v_primary_ok boolean := false;
  v_issues jsonb := '[]'::jsonb;
begin
  if v_wayplan is null then
    return jsonb_build_object('ok',false,'issues',jsonb_build_array('WAYPLAN_ID_REQUIRED'));
  end if;

  if v_rider is null and v_driver is null and v_helper is null then
    select upper(nullif(btrim(coalesce(w.rider_code,'')),'')),
           upper(nullif(btrim(coalesce(w.driver_code,'')),'')),
           upper(nullif(btrim(coalesce(w.helper_code,'')),''))
      into v_rider,v_driver,v_helper
    from public.be_wayplan_dispatches w where w.wayplan_id=v_wayplan limit 1;
  end if;

  select count(*)::integer,
         count(*) filter (where s.delivery_way_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$')::integer,
         count(*) filter (where exists(select 1 from public.be_data_entry_parcel_details d where d.delivery_way_id=s.delivery_way_id))::integer,
         count(*) filter (where exists(select 1 from public.be_data_entry_parcel_details d where d.delivery_way_id=s.delivery_way_id and upper(coalesce(d.financial_validation_status,''))='VALID'))::integer,
         count(*) filter (where exists(select 1 from public.be_dispatch_scans_v39 ds where ds.delivery_way_id=s.delivery_way_id and ds.scan_status='SCANNED' and ds.wayplan_code=v_wayplan))::integer
    into v_total,v_canonical,v_registered,v_financial_valid,v_scanned
  from public.be_wayplan_dispatch_stops s
  where s.wayplan_id=v_wayplan;

  select count(*)::integer,
         count(*) filter (where m.membership_status in ('READY_FOR_DISPATCH','DISPATCHED'))::integer
    into v_membership,v_membership_ready
  from public.be_wayplan_membership_v40 m
  where m.wayplan_id=v_wayplan and m.membership_status not in ('CANCELLED','COMPLETED','RTO');

  select r.review_status into v_review_status
  from public.be_wayplan_review_v43 r where r.wayplan_id=v_wayplan;

  v_primary_ok := v_rider is not null or v_driver is not null;

  if v_rider is not null then
    select exists(
      select 1 from public.be_mobile_workforce_accounts a
      where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=v_rider
        and upper(coalesce(a.role,''))='RIDER'
        and coalesce(a.active,true) and coalesce(a.is_active,true)
        and a.auth_user_id is not null
    ) into v_rider_ok;
  end if;

  if v_driver is not null then
    select exists(
      select 1 from public.be_mobile_workforce_accounts a
      where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=v_driver
        and upper(coalesce(a.role,''))='DRIVER'
        and coalesce(a.active,true) and coalesce(a.is_active,true)
        and a.auth_user_id is not null
    ) into v_driver_ok;
  end if;

  if v_helper is not null then
    select exists(
      select 1 from public.be_mobile_workforce_accounts a
      where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,''),nullif(a.driver_code,''),nullif(a.helper_code,'')))=v_helper
        and upper(coalesce(a.role,''))='HELPER'
        and coalesce(a.active,true) and coalesce(a.is_active,true)
        and a.auth_user_id is not null
    ) into v_helper_ok;
  end if;

  if v_total=0 then v_issues:=v_issues||jsonb_build_array('NO_WAYPLAN_STOPS'); end if;
  if v_canonical<>v_total then v_issues:=v_issues||jsonb_build_array(format('%s_NONCANONICAL_STOPS',v_total-v_canonical)); end if;
  if v_registered<>v_total then v_issues:=v_issues||jsonb_build_array(format('%s_UNREGISTERED_DATA_ENTRY_STOPS',v_total-v_registered)); end if;
  if v_financial_valid<>v_total then v_issues:=v_issues||jsonb_build_array(format('%s_FINANCIALLY_UNVALIDATED_STOPS',v_total-v_financial_valid)); end if;
  if v_membership<>v_total then v_issues:=v_issues||jsonb_build_array(format('MEMBERSHIP_COUNT_%s_OF_%s',v_membership,v_total)); end if;
  if v_membership_ready<>v_total then v_issues:=v_issues||jsonb_build_array(format('MEMBERSHIP_READY_%s_OF_%s',v_membership_ready,v_total)); end if;
  if coalesce(v_review_status,'') not in ('DISPATCH_READY','DISPATCHED') then v_issues:=v_issues||jsonb_build_array('SUPERVISOR_REVIEW_NOT_DISPATCH_READY'); end if;
  if v_scanned<>v_total then v_issues:=v_issues||jsonb_build_array(format('%s_STOPS_REQUIRE_DISPATCH_SCAN',v_total-v_scanned)); end if;
  if not v_primary_ok then v_issues:=v_issues||jsonb_build_array('RIDER_OR_DRIVER_REQUIRED'); end if;
  if not v_rider_ok then v_issues:=v_issues||jsonb_build_array('RIDER_AUTH_MAPPING_INVALID:'||coalesce(v_rider,'')); end if;
  if not v_driver_ok then v_issues:=v_issues||jsonb_build_array('DRIVER_AUTH_MAPPING_INVALID:'||coalesce(v_driver,'')); end if;
  if not v_helper_ok then v_issues:=v_issues||jsonb_build_array('HELPER_AUTH_MAPPING_INVALID:'||coalesce(v_helper,'')); end if;

  return jsonb_build_object(
    'ok',jsonb_array_length(v_issues)=0,
    'build','DISPATCH_WAYPLAN_INTEGRITY_V12_11_20260901',
    'wayplan_id',v_wayplan,
    'total_stops',v_total,
    'canonical_stops',v_canonical,
    'registered_stops',v_registered,
    'financially_valid_stops',v_financial_valid,
    'membership_rows',v_membership,
    'membership_ready_rows',v_membership_ready,
    'dispatch_scanned_stops',v_scanned,
    'review_status',v_review_status,
    'rider_code',v_rider,
    'driver_code',v_driver,
    'helper_code',v_helper,
    'rider_auth_ok',v_rider_ok,
    'driver_auth_ok',v_driver_ok,
    'helper_auth_ok',v_helper_ok,
    'helper_optional',true,
    'issues',v_issues
  );
end;
$$;

grant execute on function public.be_dispatch_wayplan_integrity_v12_11(text,text,text,text) to authenticated;

create or replace function public.be_wayplan_dispatch_status_guard_v12_11()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_check jsonb;
begin
  if upper(coalesce(new.wayplan_status,''))='DISPATCHED'
     and (tg_op='INSERT' or upper(coalesce(old.wayplan_status,''))<>'DISPATCHED') then
    v_check:=public.be_dispatch_wayplan_integrity_v12_11(new.wayplan_id,new.rider_code,new.driver_code,new.helper_code);
    if not coalesce((v_check->>'ok')::boolean,false) then
      raise exception 'DISPATCH_BLOCKED_V12_11: %',v_check->'issues' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_be_wayplan_dispatch_status_guard_v12_11 on public.be_wayplan_dispatches;
create trigger trg_be_wayplan_dispatch_status_guard_v12_11
before insert or update of wayplan_status on public.be_wayplan_dispatches
for each row execute function public.be_wayplan_dispatch_status_guard_v12_11();;
