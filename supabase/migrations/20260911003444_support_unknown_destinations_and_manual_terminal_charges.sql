create or replace function public.be_manual_handoff_charge(p_payload jsonb,p_station_code text)
returns bigint language plpgsql stable security invoker set search_path=public,pg_temp as $fn$
declare v text;
begin
 if not (p_payload ? 'handoff_delivery_charge') then return public.be_data_entry_handoff_charge_v26(p_station_code); end if;
 v:=p_payload->>'handoff_delivery_charge';
 if v is null or v !~ '^[0-9]+$' then raise exception 'Enter a non-negative whole-MMK highway delivery charge.' using errcode='22023'; end if;
 return v::bigint;
end $fn$;
revoke all on function public.be_manual_handoff_charge(jsonb,text) from public;
grant execute on function public.be_manual_handoff_charge(jsonb,text) to authenticated,service_role;
do $patch$
declare d text; f text;
begin
select pg_get_functiondef('public.be_data_entry_delivery_route_v26(text,numeric,text,text)'::regprocedure) into d;
if strpos(d,'begin')=0 then raise exception 'Missing route definition'; end if;
d:=replace(d,'begin',$route$
begin
  if lower(btrim(coalesce(p_township,'')))='unknown' then
    return jsonb_build_object('provider_code',null,'reason','PENDING_CLARIFICATION','region_code','UNRESOLVED','delivery_mode','UNRESOLVED','map_required',false,'station_required',false,'destination_key','unknown','matched_destination',null);
  end if;
  if lower(btrim(coalesce(p_township,''))) in ('ဂိတ်ချ','h.terminal drop-off','highway terminal drop-off') then
    return jsonb_build_object('provider_code','H.TERMINAL DROP-OFF','reason','EXPLICIT_HIGHWAY_STATION','region_code','OUTSIDE_CORE','delivery_mode','HIGHWAY_BUS_STATION','map_required',false,'station_required',true,'destination_key','ဂိတ်ချ','matched_destination','ဂိတ်ချ');
  end if;
$route$);
execute d;
foreach f in array array['be_data_entry_financial_v2_calculate_v19_legacy','be_data_entry_financial_v2_save'] loop
 select pg_get_functiondef(oid) into d from pg_proc where proname=f;
 if strpos(d,'public.be_data_entry_handoff_charge_v26(v_station->>''code'')')=0 then raise exception 'Unexpected station override in %',f; end if;
 d:=replace(d,'public.be_data_entry_handoff_charge_v26(v_station->>''code'')','public.be_manual_handoff_charge(v_payload,v_station->>''code'')');
 if f='be_data_entry_financial_v2_save' then
  d:=replace(d,'''handoff_station_name'',case when v_station_required then v_station->>''name'' else null end',
   '''handoff_delivery_charge'',case when v_station_required then public.be_manual_handoff_charge(v_payload,v_station->>''code'') else null end, ''handoff_station_name'',case when v_station_required then v_station->>''name'' else null end');
 end if;
 execute d;
end loop;
end $patch$;