create or replace function public.be_warehouse_resolve_scan_v3(p_scan text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_code text := btrim(coalesce(p_scan,'')); v_rows jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform public.be_warehouse_assert_internal();
 if v_code !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' then raise exception 'Invalid waybill code'; end if;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.pickup_id,s.canonical_id),'[]'::jsonb) into v_rows from (
 select distinct d.delivery_way_id as canonical_id,d.pickup_id,
 coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as waybill_no
 from public.be_data_entry_parcel_details d
 where d.delivery_way_id=v_code or d.financial_quote->>'source_waybill_no'=v_code
 ) s;
 return jsonb_build_object('matches',v_rows);
end $$;
revoke all on function public.be_warehouse_resolve_scan_v3(text) from public,anon;
grant execute on function public.be_warehouse_resolve_scan_v3(text) to authenticated;