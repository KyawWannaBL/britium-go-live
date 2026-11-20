-- Exact verified production catalog function, for disposable CI reconstruction only.
CREATE OR REPLACE FUNCTION public.be_finance_live_wayplan_dashboard_v1(p_work_date date DEFAULT NULL::date, p_vehicle text DEFAULT NULL::text, p_worker text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_date date:=coalesce(p_work_date,(now() at time zone 'Asia/Yangon')::date);
begin
  if not (
    public.be_accounting_can_v1('finance_entry')
    or public.be_accounting_can_v1('finance_review')
    or public.be_accounting_can_v1('financial_reports')
  ) then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  return jsonb_build_object(
    'ok',true,
    'work_date',v_date,
    'rows',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.vehicle_plate,x.wayplan_id)
      from (
        select
          w.wayplan_id,
          coalesce(nullif(w.vehicle_code,''),nullif(w.vehicle_name,''),'UNASSIGNED') vehicle_plate,
          w.vehicle_name,
          w.driver_code,
          w.driver_name,
          w.rider_code,
          w.rider_name,
          w.helper_code,
          w.helper_name,
          count(s.delivery_way_id)::int total_ways,
          coalesce(sum(s.cod_amount),0)::numeric opening_cod_amount,
          count(*) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED'))::int dropped_ways,
          count(*) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO'))::int failed_ways,
          count(*) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) not in ('DELIVERED','COMPLETED','FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO','CANCELLED'))::int remaining_ways,
          coalesce(sum(s.cod_collected) filter(where upper(coalesce(s.metadata->>'payment_mode',''))='CASH'),0)::numeric cash_collected,
          coalesce(sum(s.cod_collected) filter(where upper(coalesce(s.metadata->>'payment_mode','')) in ('QR','BANK_TRANSFER','MOBILE_WALLET','MOBILE_BANKING')),0)::numeric mobile_banking_collected,
          coalesce(sum(s.cod_collected),0)::numeric actual_collected,
          greatest(coalesce(sum(s.cod_amount),0)-coalesce(sum(s.cod_collected),0),0)::numeric cod_left,
          upper(coalesce(w.wayplan_status,'UNKNOWN')) wayplan_status,
          max(s.updated_at) last_activity_at
        from public.be_wayplan_dispatches w
        join public.be_wayplan_dispatch_stops s on s.wayplan_id=w.wayplan_id
        where ((coalesce(w.dispatched_at,w.planned_at,w.created_at) at time zone 'Asia/Yangon')::date=v_date or exists (select 1 from public.be_wayplan_dispatch_stops today_stop where today_stop.wayplan_id=w.wayplan_id and (today_stop.delivered_at at time zone 'Asia/Yangon')::date=v_date and upper(coalesce(today_stop.stop_status,today_stop.rider_status,today_stop.dispatch_status,'')) in ('DELIVERED','COMPLETED')))
          and (nullif(btrim(coalesce(p_vehicle,'')),'') is null
            or coalesce(w.vehicle_code,w.vehicle_name,'') ilike '%'||p_vehicle||'%')
          and (nullif(btrim(coalesce(p_worker,'')),'') is null
            or coalesce(w.driver_code,'') ilike '%'||p_worker||'%'
            or coalesce(w.driver_name,'') ilike '%'||p_worker||'%'
            or coalesce(w.rider_code,'') ilike '%'||p_worker||'%'
            or coalesce(w.rider_name,'') ilike '%'||p_worker||'%'
            or coalesce(w.helper_code,'') ilike '%'||p_worker||'%'
            or coalesce(w.helper_name,'') ilike '%'||p_worker||'%')
          and (nullif(btrim(coalesce(p_status,'')),'') is null or upper(coalesce(w.wayplan_status,''))=upper(p_status))
        group by w.wayplan_id,w.vehicle_code,w.vehicle_name,w.driver_code,w.driver_name,w.rider_code,w.rider_name,w.helper_code,w.helper_name,w.wayplan_status
      ) x
    ),'[]'::jsonb)
  );
end
$function$

