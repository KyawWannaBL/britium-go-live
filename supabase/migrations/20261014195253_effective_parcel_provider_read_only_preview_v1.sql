create or replace function public.be_effective_parcel_provider_preview_v1(p_way_id text)
returns jsonb language plpgsql stable security invoker set search_path='public','pg_temp' as $$
declare v_way text:=upper(btrim(coalesce(p_way_id,''))); v_township text; v_default jsonb; v_override text; v_reason text; v_rate numeric;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 select township into v_township from public.be_data_entry_parcel_details where delivery_way_id=v_way limit 1;
 if not found then return jsonb_build_object('ok',false,'error','WAY_NOT_FOUND'); end if;
 v_default:=public.be_data_entry_service_provider_route_v17(v_township);
 select override_provider_code,override_reason into v_override,v_reason from public.be_parcel_provider_overrides_v1 where delivery_way_id=v_way;
 select standard_rate_mmk into v_rate from public.be_data_entry_tariff_catalog where is_active and provider_code=coalesce(v_override,v_default->>'provider_code') and public.be_data_entry_destination_key_v17(destination_key)=public.be_data_entry_destination_key_v17(v_township) order by updated_at desc limit 1;
 return jsonb_build_object('ok',true,'way_id',v_way,'default_provider',v_default->>'provider_code','effective_provider',coalesce(v_override,v_default->>'provider_code'),'override_reason',v_reason,'provider_specific_standard_rate_mmk',v_rate,'requires_manual_pricing_review',v_rate is null);
end $$;
revoke all on function public.be_effective_parcel_provider_preview_v1(text) from public,anon;
grant execute on function public.be_effective_parcel_provider_preview_v1(text) to authenticated;