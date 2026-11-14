-- Lock shipment parents before testing all live FK children. CASCADE/SET NULL history
-- must never be lost by deleting a registration whose shipment still says REGISTERED.
do $patch$
declare
 v_def text;
 v_marker text:=' if coalesce(v_d.is_printed,false)';
 v_guard text:=$guard$
 -- SHIPMENT_HISTORY_DELETE_GUARD_V1
 -- FOR UPDATE conflicts with the parent KEY SHARE lock acquired by FK inserts,
 -- keeping new child activity from slipping between this test and the deletion.
 perform 1 from public.shipments s where s.way_id in (v_way,v_p.tracking_code) order by s.id for update;
 if exists(
   select 1 from public.shipments s
   where s.way_id in (v_way,v_p.tracking_code) and (
     exists(select 1 from public.rider_cod_collections c where c.shipment_id=s.id)
     or exists(select 1 from public.shipment_delivery_proofs c where c.shipment_id=s.id)
     or exists(select 1 from public.ticket_threads c where c.shipment_id=s.id)
     or exists(select 1 from public.rider_settlement_items c where c.shipment_id=s.id)
     or exists(select 1 from public.cod_collections c where c.shipment_id=s.id)
     or exists(select 1 from public.delivery_exceptions c where c.shipment_id=s.id)
     or exists(select 1 from public.delivery_proofs c where c.shipment_id=s.id)
     or exists(select 1 from public.refunds c where c.shipment_id=s.id)
     or exists(select 1 from public.route_stops c where c.shipment_id=s.id)
     or exists(select 1 from public.support_tickets c where c.shipment_id=s.id)
     or exists(select 1 from public.warehouse_storage c where c.shipment_id=s.id)
   )
 ) then
   return jsonb_build_object('ok',false,'code','DOWNSTREAM_ACTIVITY_EXISTS','message','Shipment delivery, collection, support or warehouse history exists. This record cannot be deleted from Data Entry.');
 end if;
$guard$;
begin
 select pg_get_functiondef('public.be_data_entry_registration_delete_v1(jsonb)'::regprocedure) into v_def;
 if position('SHIPMENT_HISTORY_DELETE_GUARD_V1' in v_def)=0 then
   if position(v_marker in v_def)=0 then raise exception 'Registration deletion function changed; review shipment history guard before applying.';end if;
   execute replace(v_def,v_marker,v_guard||v_marker);
 end if;
end $patch$;
