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
begin
  if v_status in ('DELIVERED','COMPLETED') then
    update public.be_rider_route_stop_state_v46
    set stop_status='DELIVERED',
        result_at=coalesce(result_at,new.delivered_at,now()),
        result_payload=coalesce(result_payload,'{}'::jsonb)
          || jsonb_strip_nulls(jsonb_build_object(
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
            'source','WAYPLAN_DISPATCH_STOP_V94'
          )),
        updated_at=now()
    where wayplan_id=new.wayplan_id
      and delivery_way_id=new.delivery_way_id;
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
for each row
execute function public.be_sync_delivery_finance_payload_v94();
