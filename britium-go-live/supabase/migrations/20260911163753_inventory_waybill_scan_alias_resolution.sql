begin;
create or replace function public.be_resolve_inventory_waybill(p_code text)
returns text language plpgsql stable security invoker set search_path='' as $$
declare ids text[]; code text:=btrim(p_code);
begin
 select array_agg(distinct d.delivery_way_id) into ids
 from public.be_data_entry_parcel_details d
 where d.delivery_way_id=code or d.financial_quote->>'source_waybill_no'=code;
 if coalesce(cardinality(ids),0)>1 then raise exception 'Ambiguous inventory waybill: %',code; end if;
 return coalesce(ids[1],code);
end $$;
revoke all on function public.be_resolve_inventory_waybill(text) from public,anon,authenticated;
do $$
declare f record; definition text; needle text:='v_actor := public.be_warehouse_actor_email();';
begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in ('be_warehouse_inbound_scan','be_warehouse_dispatch_scan','be_warehouse_return_scan') loop
  definition:=pg_get_functiondef(f.oid);
  if position(needle in definition)=0 then raise exception 'Warehouse scan function shape changed'; end if;
  definition:=replace(definition,needle,needle||E'\n  v_way := public.be_resolve_inventory_waybill(v_way);');
  execute definition;
 end loop;
end $$;
commit;