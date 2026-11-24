-- Already applied to Supabase production. Kept outside protected replay dirs while migration history is reconciled.
-- Read-only batch lookup for audited temporary provider choices.
-- Does not recalculate or mutate actual dispatch, tariffs or settlement.
create or replace function public.be_parcel_temp_provider_batch_v1(p_way_ids text[])
returns jsonb language plpgsql stable security definer
set search_path=public,private,auth,pg_temp
as $body$
declare v_role text:=lower(coalesce(public.be_current_role(),'')); v_result jsonb;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if v_role not in ('superadmin','operation_manager','operations_manager','operation_supervisor','customer_service','bd_manager','data_entry','warehouse','warehouse_lead','warehouse_manager','finance_manager','finance') then
   raise exception 'PROVIDER_READ_NOT_AUTHORIZED' using errcode='42501';
 end if;
 if coalesce(array_length(p_way_ids,1),0)>2000 then raise exception 'TOO_MANY_WAY_IDS' using errcode='22023'; end if;
 select coalesce(jsonb_object_agg(t.delivery_way_id,jsonb_build_object(
    'provider',t.provisional_provider_code,'reason',t.reason,'reviewed_at',t.selected_at
  )),'{}'::jsonb) into v_result
 from private.be_parcel_temp_provider_v1 t
 where t.delivery_way_id=any(select upper(btrim(x)) from unnest(coalesce(p_way_ids,array[]::text[])) as x);
 return jsonb_build_object('ok',true,'items',v_result);
end $body$;
revoke all on function public.be_parcel_temp_provider_batch_v1(text[]) from public,anon;
grant execute on function public.be_parcel_temp_provider_batch_v1(text[]) to authenticated;
