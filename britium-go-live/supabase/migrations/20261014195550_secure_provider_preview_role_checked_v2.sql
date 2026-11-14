CREATE OR REPLACE FUNCTION public.be_effective_parcel_provider_preview_v1(p_way_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp' AS $fn$
DECLARE
 v_way text:=upper(btrim(coalesce(p_way_id,'')));
 v_role text;
 v_township text;
 v_default jsonb;
 v_override text;
 v_reason text;
 v_rate numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 v_role:=lower(coalesce(public.be_current_role(),''));
 IF v_role NOT IN ('superadmin','operation_manager','operations_manager','operation_supervisor','customer_service','bd_manager','data_entry')
 THEN RAISE EXCEPTION 'PROVIDER_PREVIEW_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF v_way='' THEN RAISE EXCEPTION 'WAY_ID_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT township INTO v_township FROM public.be_data_entry_parcel_details WHERE delivery_way_id=v_way LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','WAY_NOT_FOUND'); END IF;
 v_default:=public.be_data_entry_service_provider_route_v17(v_township);
 SELECT override_provider_code,override_reason INTO v_override,v_reason
 FROM public.be_parcel_provider_overrides_v1 WHERE delivery_way_id=v_way;
 SELECT standard_rate_mmk INTO v_rate FROM public.be_data_entry_tariff_catalog
 WHERE is_active AND provider_code=coalesce(v_override,v_default->>'provider_code')
 AND public.be_data_entry_destination_key_v17(destination_key)=public.be_data_entry_destination_key_v17(v_township)
 ORDER BY updated_at DESC LIMIT 1;
 RETURN jsonb_build_object('ok',true,'way_id',v_way,'default_provider',v_default->>'provider_code',
 'effective_provider',coalesce(v_override,v_default->>'provider_code'),
 'override_reason',v_reason,'provider_specific_standard_rate_mmk',v_rate,
 'requires_manual_pricing_review',v_rate IS NULL);
END $fn$;
REVOKE ALL ON FUNCTION public.be_effective_parcel_provider_preview_v1(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.be_effective_parcel_provider_preview_v1(text) TO authenticated;