-- CI ONLY: exact preserved V13.2 calculator; original signature restored before V17 rename.
-- This is a diagnostic fixture, not a migration for hosted environments.
CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_calculate(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_result jsonb;
  v_data jsonb;
  v_quote jsonb;
  v_resolution jsonb;
  v_update_access jsonb;
  v_type text := upper(nullif(btrim(coalesce(p_payload->>'amount_entry_type','')),''));
  v_requested_tier text := upper(nullif(btrim(coalesce(p_payload->>'customer_tier','')),''));
  v_provider_code text := upper(nullif(btrim(coalesce(p_payload->>'service_provider_code','')),''));
  v_override_requested boolean := lower(coalesce(p_payload->>'customer_tier_override','false')) in ('true','1','yes','on');
  v_registered boolean := false;
  v_monthly integer := 0;
  v_additional bigint := 0;
  v_ok boolean := false;
begin
  v_result := public.be_data_entry_financial_v2_calculate_v61_3_3_legacy(v_payload);
  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result;
  end if;

  if v_type = 'OPAQUE_COD_COLLECTION' then
    return v_result || jsonb_build_object(
      'ok',false,
      'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','OPAQUE_COD_RETIRED','field','amount_entry_type',
        'message','Unclassified COD collection is retired. Use Exact Collection Amount and enter the exact receiver total.'
      ))
    );
  end if;

  v_additional := coalesce(nullif(btrim(coalesce(p_payload->>'additional_customer_charge','')),'')::bigint,0);
  if v_additional <> 0 then
    return v_result || jsonb_build_object(
      'ok',false,
      'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','ADDITIONAL_CUSTOMER_CHARGE_RETIRED','field','additional_customer_charge',
        'message','Additional customer charge is retired for new Data Entry calculations and must be zero.'
      ))
    );
  end if;

  if v_provider_code is not null and not exists (
    select 1 from public.be_data_entry_service_providers p
    where p.provider_code=v_provider_code and p.is_active
  ) then
    return v_result || jsonb_build_object(
      'ok',false,
      'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','SERVICE_PROVIDER_INVALID','field','service_provider_code',
        'message','Select an active service provider.'
      ))
    );
  end if;

  v_resolution := coalesce(v_result->'server_resolution','{}'::jsonb);
  v_registered := coalesce(v_resolution->>'merchant_registration_status','')='REGISTERED_ACTIVE_PROFILE';
  v_monthly := coalesce(nullif(v_resolution->>'backend_monthly_ways','')::integer,0);

  if v_override_requested and v_registered then
    if v_requested_tier not in ('STANDARD','ROYAL','COMMITMENT') then
      return v_result || jsonb_build_object(
        'ok',false,
        'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
        'errors',jsonb_build_array(jsonb_build_object(
          'code','INVALID_TIER_OVERRIDE','field','customer_tier',
          'message','Tier override must be STANDARD, ROYAL, or COMMITMENT.'
        ))
      );
    end if;

    v_update_access := public.be_data_entry_require_access_v57('update',false);
    v_quote := public.be_calculate_parcel_financial_v2(
      nullif(btrim(v_payload->>'township'),''),
      v_requested_tier,
      v_type,
      nullif(btrim(v_payload->>'item_price'),'')::bigint,
      nullif(btrim(v_payload->>'delivery_charges'),'')::bigint,
      nullif(btrim(v_payload->>'merchant_stated_total_amount'),'')::bigint,
      0,
      coalesce(nullif(btrim(v_payload->>'cbm_surcharge'),'')::bigint,0),
      coalesce(nullif(btrim(v_payload->>'other_surcharge'),'')::bigint,0),
      coalesce(nullif(btrim(v_payload->>'merchant_payable_charges'),'')::bigint,0),
      coalesce(nullif(btrim(v_payload->>'other_merchant_credits'),'')::bigint,0),
      coalesce(nullif(btrim(v_payload->>'weight_kg'),'')::numeric,0),
      v_monthly
    );

    v_data := coalesce(v_result->'data','{}'::jsonb)
      || v_quote
      || jsonb_build_object(
        'customer_tier',v_requested_tier,
        'additional_customer_charge',0,
        'service_provider_code',v_provider_code
      );
    v_ok := coalesce(v_quote->>'validation_status','ERROR') <> 'ERROR';
    v_resolution := v_resolution || jsonb_build_object(
      'customer_tier_source','AUTHORIZED_DATA_ENTRY_UPDATE_OVERRIDE',
      'resolved_customer_tier',v_requested_tier,
      'client_customer_tier_ignored',false,
      'client_customer_tier_used',true,
      'tier_override_applied',true,
      'tier_override_access',v_update_access
    );

    return v_result || jsonb_build_object(
      'ok',v_ok,
      'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
      'data',v_data,
      'server_resolution',v_resolution,
      'warnings',coalesce(v_result->'warnings','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'code','AUTHORIZED_TIER_OVERRIDE_APPLIED',
        'message','The merchant profile tier was overridden for this parcel by a user with Data Entry update access.'
      )),
      'errors',case when v_ok then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
        'code','FINANCIAL_VALIDATION_ERROR','message',v_quote->>'validation_message'
      )) end
    );
  end if;

  v_data := coalesce(v_result->'data','{}'::jsonb) || jsonb_build_object(
    'additional_customer_charge',0,
    'service_provider_code',v_provider_code
  );
  return v_result || jsonb_build_object(
    'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
    'data',v_data,
    'server_resolution',v_resolution || jsonb_build_object('tier_override_applied',false)
  );
end
$function$;
