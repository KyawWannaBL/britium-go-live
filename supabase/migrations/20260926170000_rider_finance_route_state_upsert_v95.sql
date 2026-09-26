create or replace function public.be_sync_delivery_finance_payload_v94()
returns trigger
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
declare
  v_status text := upper(coalesce(new.stop_status,new.rider_status,new.dispatch_status,''));
  v_proof text := nullif(btrim(coalesce(new.rider_proof_url,new.proof_url,'')),'');
  v_receiver text := nullif(btrim(coalesce(new.receiver_name,new.recipient_name,'')),'');
  v_phone text := nullif(btrim(coalesce(new.receiver_phone,new.recipient_phone,'')),'');
  v_payment_mode text := nullif(upper(btrim(coalesce(new.metadata->>'payment_mode',new.metadata->>'payment_type',''))),'');
  v_payload jsonb;
begin
  if v_status in ('DELIVERED','COMPLETED') then
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'delivery_way_id',new.delivery_way_id,
      'wayplan_id',new.wayplan_id,
      'cod_collected',coalesce(new.cod_collected,0),
      'cod_collected_amount',coalesce(new.cod_collected,0),
      'collected_amount',coalesce(new.cod_collected,0),
      'proof_url',v_proof,
      'proof_reference',v_proof,
      'recipient_name',v_receiver,
      'recipient_phone',v_phone,
      'payment_mode',v_payment_mode,
      'delivered_at',coalesce(new.delivered_at,now()),
      'source','WAYPLAN_DISPATCH_STOP_V95'
    ));

    insert into public.be_rider_route_stop_state_v46(
      wayplan_id,delivery_way_id,stop_sequence,stop_status,
      recipient_name,recipient_phone,address,township,
      result_at,result_payload,created_at,updated_at
    ) values (
      new.wayplan_id,new.delivery_way_id,new.stop_sequence,'DELIVERED',
      v_receiver,v_phone,coalesce(new.delivery_address,new.address),new.township,
      coalesce(new.delivered_at,now()),v_payload,now(),now()
    )
    on conflict (wayplan_id,delivery_way_id) do update
    set stop_sequence=excluded.stop_sequence,
        stop_status='DELIVERED',
        recipient_name=coalesce(excluded.recipient_name,public.be_rider_route_stop_state_v46.recipient_name),
        recipient_phone=coalesce(excluded.recipient_phone,public.be_rider_route_stop_state_v46.recipient_phone),
        address=coalesce(excluded.address,public.be_rider_route_stop_state_v46.address),
        township=coalesce(excluded.township,public.be_rider_route_stop_state_v46.township),
        result_at=coalesce(public.be_rider_route_stop_state_v46.result_at,excluded.result_at),
        result_payload=coalesce(public.be_rider_route_stop_state_v46.result_payload,'{}'::jsonb)||excluded.result_payload,
        updated_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_be_sync_delivery_finance_payload_v94 on public.be_wayplan_dispatch_stops;
create trigger trg_be_sync_delivery_finance_payload_v94
after insert or update of
  stop_status,rider_status,dispatch_status,cod_collected,proof_url,rider_proof_url,
  receiver_name,receiver_phone,delivered_at
on public.be_wayplan_dispatch_stops
for each row execute function public.be_sync_delivery_finance_payload_v94();
