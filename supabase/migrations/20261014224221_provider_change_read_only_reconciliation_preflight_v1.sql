create or replace function public.be_provider_change_preflight_v1(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','auth','pg_temp' as $f$
declare v_role text; v_req record; v_township text; v_closed timestamptz; v_tariff_count int; v_wayplan bool; v_settlement bool;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 v_role:=lower(coalesce(public.be_current_role(),''));
 if v_role not in ('superadmin','operation_manager','operations_manager','operation_supervisor') then raise exception 'MANAGER_REQUIRED'; end if;
 select * into v_req from public.be_parcel_provider_change_requests_v1 where id=p_request_id;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 select township,closed_at into v_township,v_closed from public.be_data_entry_parcel_details where delivery_way_id=v_req.delivery_way_id order by updated_at desc limit 1;
 if not found then raise exception 'PARCEL_NOT_FOUND'; end if;
 select count(*) into v_tariff_count from public.be_data_entry_tariff_catalog t where t.is_active and t.provider_code=v_req.requested_provider_code and t.destination_key=public.be_data_entry_destination_key_v17(v_township);
 select exists(select 1 from public.be_dispatch_wayplan_assignments w where upper(btrim(w.way_id))=upper(btrim(v_req.delivery_way_id))) into v_wayplan;
 select exists(select 1 from public.be_finance_cod_settlements_v48 s where upper(btrim(s.delivery_way_id))=upper(btrim(v_req.delivery_way_id))) into v_settlement;
 return jsonb_build_object('request_id',p_request_id,'status',v_req.status,'requested_provider',v_req.requested_provider_code,'matching_tariffs',v_tariff_count,'has_wayplan',v_wayplan,'has_settlement',v_settlement,'parcel_closed',v_closed is not null,'safe_for_automatic_apply',false,'requires_finance_and_warehouse_sync',true);
end $f$;
revoke execute on function public.be_provider_change_preflight_v1(uuid) from public,anon;
grant execute on function public.be_provider_change_preflight_v1(uuid) to authenticated;