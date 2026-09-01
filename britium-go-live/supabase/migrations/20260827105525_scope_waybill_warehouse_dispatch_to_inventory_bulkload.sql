do $$
begin
  if to_regprocedure('public.be_get_waybill_print_queue_unfiltered_20260827(jsonb)') is null then
    alter function public.be_get_waybill_print_queue(jsonb)
      rename to be_get_waybill_print_queue_unfiltered_20260827;
  end if;
end $$;

revoke all on function public.be_get_waybill_print_queue_unfiltered_20260827(jsonb) from public,anon,authenticated;

create or replace function public.be_get_waybill_print_queue(p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_raw jsonb; v_rows jsonb;
begin
 v_raw:=public.be_get_waybill_print_queue_unfiltered_20260827(p_payload);
 select coalesce(jsonb_agg(e order by e->>'delivery_way_id'),'[]'::jsonb) into v_rows
 from jsonb_array_elements(coalesce(v_raw->'waybills','[]'::jsonb)) e
 where exists(select 1 from public.be_wayplan_inventory_bulkload b
              where b.active and b.delivery_way_id=e->>'delivery_way_id');
 return v_raw||jsonb_build_object('waybills',v_rows,'items',v_rows,'rows',v_rows,
   'count',jsonb_array_length(v_rows),'active_scope','WAREHOUSE_WAYPLAN_BULKLOAD');
end $$;

create or replace function public.be_warehouse_scan_lifecycle_snapshot()
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_raw jsonb; v_rows jsonb; v_stats jsonb;
begin
 v_raw:=public.be_warehouse_scan_lifecycle_snapshot_unfiltered_20260827();
 select coalesce(jsonb_agg(e),'[]'::jsonb) into v_rows
 from jsonb_array_elements(coalesce(v_raw->'rows','[]'::jsonb)) e
 where exists(select 1 from public.be_wayplan_inventory_bulkload b
              where b.active and b.delivery_way_id=e->>'delivery_way_id');
 select jsonb_build_object(
  'rows',count(*),
  'received',count(*) filter(where nullif(e->>'inbound_scan_at','') is not null),
  'dispatch_scanned',count(*) filter(where nullif(e->>'dispatch_scan_at','') is not null),
  'returns',count(*) filter(where coalesce((e->>'return_attempt_count')::int,0)>0),
  'priority',count(*) filter(where coalesce((e->>'next_attempt_priority')::boolean,false)),
  'rto',count(*) filter(where nullif(e->>'rto_at','') is not null or upper(coalesce(e->>'delivery_status',''))='RTO')
 ) into v_stats from jsonb_array_elements(v_rows) e;
 return v_raw||jsonb_build_object('rows',v_rows,'stats',v_stats,
  'active_scope','WAREHOUSE_WAYPLAN_BULKLOAD');
end $$;

create or replace function public.be_enterprise_dispatch_snapshot()
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_raw jsonb; v_jobs jsonb; v_wayplans jsonb; v_stats jsonb;
begin
 v_raw:=public.be_enterprise_dispatch_snapshot_unfiltered_20260827();
 select coalesce(jsonb_agg(e),'[]'::jsonb) into v_jobs
 from jsonb_array_elements(coalesce(v_raw->'jobs','[]'::jsonb)) e
 where exists(select 1 from public.be_wayplan_inventory_bulkload b
              where b.active and b.delivery_way_id=coalesce(e->>'delivery_way_id',e->>'tracking_no'));
 select coalesce(jsonb_agg(w),'[]'::jsonb) into v_wayplans
 from jsonb_array_elements(coalesce(v_raw->'wayplans','[]'::jsonb)) w
 where exists(select 1 from jsonb_array_elements(v_jobs) j
   where coalesce(j->>'wayplan_code',j->>'wayplan_no')=coalesce(w->>'wayplan_code',w->>'wayplan_no'));
 select jsonb_build_object(
  'wayplans',count(distinct nullif(coalesce(e->>'wayplan_code',e->>'wayplan_no'),'')),
  'jobs',count(*),
  'pending',count(*) filter(where upper(coalesce(e->>'delivery_status','PENDING')) in ('PENDING','WAITING','READY')),
  'out_for_delivery',count(*) filter(where upper(coalesce(e->>'dispatch_status',''))='OUT_FOR_DELIVERY'),
  'delivered',count(*) filter(where upper(coalesce(e->>'delivery_status','')) in ('DELIVERED','COMPLETED','DROP_OFF')),
  'failed',count(*) filter(where upper(coalesce(e->>'delivery_status','')) in ('ATTEMPTED_FAILED','DELIVERY_FAILED','FAILED')),
  'rto',count(*) filter(where upper(coalesce(e->>'delivery_status',''))='RTO'),
  'cod',coalesce(sum(coalesce((e->>'cod_amount')::numeric,0)),0)
 ) into v_stats from jsonb_array_elements(v_jobs) e;
 return v_raw||jsonb_build_object('jobs',v_jobs,'wayplans',v_wayplans,'stats',v_stats,
  'active_scope','WAREHOUSE_WAYPLAN_BULKLOAD');
end $$;

grant execute on function public.be_get_waybill_print_queue(jsonb) to authenticated;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot() to authenticated;
grant execute on function public.be_enterprise_dispatch_snapshot() to authenticated;;
