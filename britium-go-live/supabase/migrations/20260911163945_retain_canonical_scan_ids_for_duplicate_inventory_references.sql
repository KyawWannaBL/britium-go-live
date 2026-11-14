begin;
do $$
declare f record; definition text;
begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in ('be_warehouse_inbound_scan','be_warehouse_dispatch_scan','be_warehouse_return_scan') loop
 definition:=replace(pg_get_functiondef(f.oid),E'\n  v_way := public.be_resolve_inventory_waybill(v_way);','');
 execute definition;
 end loop;
end $$;
drop function public.be_resolve_inventory_waybill(text);
commit;