create or replace function public.be_get_waybill_print_queue(p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_raw jsonb; v_existing jsonb; v_missing jsonb; v_rows jsonb;
begin
 v_raw:=public.be_get_waybill_print_queue_unfiltered_20260827(p_payload);
 select coalesce(jsonb_agg(e order by e->>'delivery_way_id'),'[]'::jsonb) into v_existing
 from jsonb_array_elements(coalesce(v_raw->'waybills','[]'::jsonb)) e
 where exists(select 1 from public.be_wayplan_inventory_bulkload b
              where b.active and b.delivery_way_id=e->>'delivery_way_id');

 select coalesce(jsonb_agg(jsonb_build_object(
  'id',b.delivery_way_id,'waybill_id',b.delivery_way_id,'waybill_no',b.delivery_way_id,
  'delivery_way_id',b.delivery_way_id,'pickup_id',b.pickup_way_id,
  'merchant_code',b.merchant_code,'merchant_name',b.merchant_name,
  'recipient_name',coalesce(nullif(b.recipient_name,''),'Recipient name required'),
  'receiver_name',coalesce(nullif(b.recipient_name,''),'Recipient name required'),
  'recipient_phone',b.recipient_phone,'receiver_phone',b.recipient_phone,
  'recipient_address',b.recipient_address,'delivery_address',b.recipient_address,
  'destination_township',b.township,'destination_city',coalesce(b.destination,'Yangon'),
  'item_price',b.item_price,'delivery_fee',b.delivery_fee,'surcharge',b.surcharge,
  'cod_amount',b.cod_amount,'actual_collect',b.cod_amount,'weight_kg',b.weight_kg,
  'remarks',concat_ws(' | ',b.remarks,'VALIDATION: recipient name missing in source workbook'),
  'status','GENERATED','print_status','Ready','warehouse_status','RECEIVED',
  'way_management_status','READY_FOR_WAYPLAN','finance_status','PENDING_INVOICE',
  'date',to_char(b.pickup_date,'YYYY-MM-DD'),'created_at',b.loaded_at,
  'validation_status','RECIPIENT_NAME_REQUIRED'
 ) order by b.delivery_way_id),'[]'::jsonb) into v_missing
 from public.be_wayplan_inventory_bulkload b
 where b.active and nullif(trim(b.recipient_name),'') is null
   and not exists(select 1 from jsonb_array_elements(v_existing) e
                  where e->>'delivery_way_id'=b.delivery_way_id);

 v_rows:=v_existing||v_missing;
 return v_raw||jsonb_build_object('waybills',v_rows,'items',v_rows,'rows',v_rows,
  'count',jsonb_array_length(v_rows),'active_scope','WAREHOUSE_WAYPLAN_BULKLOAD',
  'validation_required',jsonb_array_length(v_missing));
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
  'received',count(*) filter(where nullif(e->>'inbound_scan_at','') is not null
    or upper(coalesce(e->>'warehouse_status',e->>'warehouse_scan_status','')) in
       ('RECEIVED','WAREHOUSE_RECEIVED','WAREHOUSE_READY')),
  'dispatch_scanned',count(*) filter(where nullif(e->>'dispatch_scan_at','') is not null),
  'returns',count(*) filter(where coalesce((e->>'return_attempt_count')::int,0)>0),
  'priority',count(*) filter(where coalesce((e->>'next_attempt_priority')::boolean,false)),
  'rto',count(*) filter(where nullif(e->>'rto_at','') is not null
    or upper(coalesce(e->>'delivery_status',''))='RTO')
 ) into v_stats from jsonb_array_elements(v_rows) e;
 return v_raw||jsonb_build_object('rows',v_rows,'stats',v_stats,
  'active_scope','WAREHOUSE_WAYPLAN_BULKLOAD');
end $$;

grant execute on function public.be_get_waybill_print_queue(jsonb) to authenticated;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot() to authenticated;;
