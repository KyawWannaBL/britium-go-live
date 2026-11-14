begin;

-- Royal grants Britium a 15% partnered-business commission on the approved
-- normal township tariff. Customer collection remains unchanged.
create or replace function public.be_data_entry_royal_commission_v27(p_township text)
returns jsonb language plpgsql stable
set search_path to 'public','pg_temp'
as $function$
declare
  v_key text := public.be_data_entry_destination_key_v17(p_township);
  v_tariff bigint;
begin
  select t.standard_rate_mmk into v_tariff
  from public.be_data_entry_tariff_catalog t
  where t.is_active and upper(t.provider_code)='ROYAL EXPRESS'
    and (public.be_data_entry_destination_key_v17(t.destination_key)=v_key
      or public.be_data_entry_destination_key_v17(t.destination_name)=v_key)
  order by t.updated_at desc limit 1;
  return jsonb_build_object(
    'matched',v_tariff is not null,'normal_tariff_mmk',v_tariff,
    'commission_rate_percent',15,
    'commission_mmk',case when v_tariff is null then 0 else round(v_tariff::numeric*0.15)::bigint end,
    'rule','ROYAL_PARTNER_NORMAL_TARIFF_15_PERCENT');
end
$function$;

revoke all on function public.be_data_entry_royal_commission_v27(text) from public, anon, authenticated;
grant execute on function public.be_data_entry_royal_commission_v27(text) to service_role;

alter function public.be_data_entry_financial_v2_calculate(jsonb)
rename to be_data_entry_financial_v2_calculate_v21_legacy;

create or replace function public.be_data_entry_financial_v2_calculate(p_payload jsonb)
returns jsonb language plpgsql stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_result jsonb; v_data jsonb; v_reconciled jsonb; v_royal jsonb;
  v_type text := upper(nullif(btrim(coalesce(p_payload->>'amount_entry_type','')),''));
  v_provider text;
  v_merchant text := upper(btrim(coalesce(p_payload->>'merchant_id','')));
begin
  v_result := public.be_data_entry_financial_v2_calculate_v21_legacy(v_payload);
  if not coalesce((v_result->>'ok')::boolean,false)
     or v_type not in ('ITEM_PRICE_PLUS_DECLARED_DELIVERY','TOTAL_AMOUNT_INCLUDING_DELIVERY','DELIVERY_CHARGE_ONLY') then
    return v_result;
  end if;
  v_data := coalesce(v_result->'data','{}'::jsonb);
  v_provider := upper(btrim(coalesce(v_data->>'service_provider_code',p_payload->>'service_provider_code','')));
  if v_provider<>'ROYAL EXPRESS' or v_merchant='GSK' then return v_result; end if;

  v_royal := public.be_data_entry_royal_commission_v27(coalesce(nullif(v_data->>'township',''),p_payload->>'township'));
  if not coalesce((v_royal->>'matched')::boolean,false) then
    return v_result||jsonb_build_object(
      'build','DATA_ENTRY_ROYAL_PARTNER_COMMISSION_V27_20260905',
      'warnings',coalesce(v_result->'warnings','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'code','ROYAL_COMMISSION_TARIFF_NOT_FOUND',
        'message','The Royal township has no active approved tariff; Britium commission remains zero for review.')),
      'data',v_data||v_royal);
  end if;

  v_reconciled := public.be_reconcile_declared_delivery_v21(
    v_payload->>'merchant_id',v_type,
    coalesce(nullif(btrim(v_payload->>'item_price'),'')::bigint,0),
    coalesce(nullif(btrim(v_payload->>'delivery_charges'),'')::bigint,0),
    coalesce(nullif(v_data->>'backend_calculated_delivery_surcharges','')::bigint,0),
    (v_royal->>'commission_mmk')::bigint,
    coalesce(nullif(btrim(v_payload->>'merchant_payable_charges'),'')::bigint,0),
    coalesce(nullif(btrim(v_payload->>'other_merchant_credits'),'')::bigint,0));

  return v_result||jsonb_build_object(
    'build','DATA_ENTRY_ROYAL_PARTNER_COMMISSION_V27_20260905',
    'data',v_data||v_reconciled||v_royal||jsonb_build_object(
      'royal_partner_tariff_mmk',(v_royal->>'normal_tariff_mmk')::bigint,
      'royal_partner_commission_rate_percent',15,
      'royal_partner_commission_mmk',(v_royal->>'commission_mmk')::bigint,
      'britium_entitlement_rule','ROYAL_PARTNER_NORMAL_TARIFF_15_PERCENT',
      'calculation_version','DECLARED_DELIVERY_RECONCILIATION_ROYAL_V27',
      'validation_message','Ready. Royal Express commission is 15% of the approved normal township tariff and is recorded as Britium entitlement for this way.'));
end
$function$;

revoke all on function public.be_data_entry_financial_v2_calculate_v21_legacy(jsonb) from public, anon, authenticated;
grant execute on function public.be_data_entry_financial_v2_calculate_v21_legacy(jsonb) to service_role;
revoke all on function public.be_data_entry_financial_v2_calculate(jsonb) from public, anon;
grant execute on function public.be_data_entry_financial_v2_calculate(jsonb) to authenticated, service_role;

comment on function public.be_data_entry_financial_v2_calculate(jsonb) is
  'V27: Royal Express commission is 15% of the active normal township tariff; Calculate and Save use the same result.';

do $assertions$
declare v_royal jsonb;
begin
  v_royal := public.be_data_entry_royal_commission_v27('ကျိုက်ထို (Royal)');
  if not coalesce((v_royal->>'matched')::boolean,false)
     or (v_royal->>'normal_tariff_mmk')::bigint<>5000
     or (v_royal->>'commission_mmk')::bigint<>750 then
    raise exception 'V27 Royal commission assertion failed: %',v_royal;
  end if;
end
$assertions$;

notify pgrst, 'reload schema';
commit;
