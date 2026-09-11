-- Britium Express Financial V2 all-payment-type surcharge correction
-- Build: FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5_2026_08_03
-- Scope: replace the backend calculation function only; preserve tariffs, parcel rows,
-- merchant profiles, mutation mode and financial write gate.

rollback;
begin;

do $preflight$
begin
  if to_regprocedure('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)') is null then
    raise exception 'ABORT: be_calculate_parcel_financial_v2 is missing.';
  end if;
  if to_regprocedure('public.be_financial_v2_township_key_v61_4_1(text)') is null then
    raise exception 'ABORT: V61.4.1 township alias resolver is missing.';
  end if;
  if to_regclass('public.be_parcel_tariffs_v2') is null then
    raise exception 'ABORT: be_parcel_tariffs_v2 is missing.';
  end if;
  if to_regclass('public.be_data_entry_financial_v2_runtime_v58') is null then
    raise exception 'ABORT: Financial V2 runtime control is missing.';
  end if;
  if coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'') <> 'MUTATION_SHADOW' then
    raise exception 'ABORT: expected MUTATION_SHADOW before V61.5.';
  end if;
end
$preflight$;

create table if not exists public.be_financial_v2_function_backup_v61_5 (
  backup_id bigserial primary key,
  build text not null,
  function_signature text not null,
  function_definition text not null,
  definition_md5 text not null,
  backed_up_at timestamptz not null default now()
);

insert into public.be_financial_v2_function_backup_v61_5(
  build,function_signature,function_definition,definition_md5
)
select
  'PRE_FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5_2026_08_03',
  'public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)',
  pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure),
  md5(pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure))
where not exists (
  select 1
  from public.be_financial_v2_function_backup_v61_5
  where build='PRE_FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5_2026_08_03'
);

create or replace function public.be_calculate_parcel_financial_v2(
  p_township text,
  p_customer_tier text,
  p_amount_entry_type text,
  p_item_price bigint default null::bigint,
  p_delivery_charges bigint default null::bigint,
  p_merchant_stated_total_amount bigint default null::bigint,
  p_additional_customer_charge bigint default 0,
  p_cbm_surcharge bigint default 0,
  p_other_surcharge bigint default 0,
  p_merchant_payable_charges bigint default 0,
  p_other_merchant_credits bigint default 0,
  p_actual_weight_kg numeric default 0,
  p_merchant_monthly_ways integer default 0
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tariff public.be_parcel_tariffs_v2%rowtype;
  v_tier text := upper(btrim(coalesce(p_customer_tier, '')));
  v_type text := upper(btrim(coalesce(p_amount_entry_type, '')));
  v_messages text[] := array[]::text[];
  v_chargeable numeric(10,3);
  v_extra numeric(10,3);
  v_weight_surcharge bigint;
  v_backend_delivery_surcharges bigint;
  v_customer_delivery_surcharges bigint;
  v_gross bigint;
  v_commitment_refund bigint;
  v_net bigint;
  v_effective bigint;
  v_cod bigint := 0;
  v_difference bigint;
  v_direction text;
  v_adjustment bigint;
  v_merchant_final bigint;
  v_status text;
  v_candidate_count integer := 0;
  v_shape_count integer := 0;
begin
  if nullif(btrim(coalesce(p_township, '')), '') is null then
    v_messages := array_append(v_messages, 'Township is required.');
  end if;
  if v_tier not in ('STANDARD','ROYAL','COMMITMENT') then
    v_messages := array_append(v_messages, 'A valid backend-resolved customer tier is required.');
  end if;
  if v_type not in (
    'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    'TOTAL_AMOUNT_INCLUDING_DELIVERY',
    'DELIVERY_CHARGE_ONLY',
    'EXACT_COLLECTION_AMOUNT',
    'OPAQUE_COD_COLLECTION',
    'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT'
  ) then
    v_messages := array_append(v_messages, 'Invalid amount entry type.');
  end if;

  if coalesce(p_additional_customer_charge,0) < 0
     or coalesce(p_cbm_surcharge,0) < 0
     or coalesce(p_other_surcharge,0) < 0
     or coalesce(p_merchant_payable_charges,0) < 0
     or coalesce(p_other_merchant_credits,0) < 0
     or coalesce(p_actual_weight_kg,0) < 0
     or coalesce(p_merchant_monthly_ways,0) < 0
     or (p_item_price is not null and p_item_price < 0)
     or (p_delivery_charges is not null and p_delivery_charges < 0)
     or (p_merchant_stated_total_amount is not null and p_merchant_stated_total_amount < 0) then
    v_messages := array_append(v_messages, 'Financial and weight inputs must be non-negative.');
  end if;

  select
    count(*)::integer,
    count(distinct concat_ws(
      '|',
      t.base_tariff::text,
      t.included_kg::text,
      t.extra_per_kg::text,
      t.commitment_min_ways::text,
      t.commitment_refund_per_way::text,
      coalesce(t.tariff_zone,''),
      coalesce(t.tariff_zone_code,'')
    ))::integer
  into v_candidate_count, v_shape_count
  from public.be_parcel_tariffs_v2 t
  where public.be_financial_v2_township_key_v61_4_1(t.township) = public.be_financial_v2_township_key_v61_4_1(p_township)
    and t.customer_tier = v_tier
    and t.status = 'ACTIVE'
    and t.effective_from <= public.be_business_date()
    and (t.effective_to is null or t.effective_to >= public.be_business_date());

  if v_candidate_count = 0 then
    v_messages := array_append(v_messages, 'No active tariff exists for the selected township and customer tier.');
    v_tariff.base_tariff := 0;
    v_tariff.included_kg := 0;
    v_tariff.extra_per_kg := 0;
    v_tariff.commitment_min_ways := 0;
    v_tariff.commitment_refund_per_way := 0;
  elsif v_shape_count <> 1 then
    v_messages := array_append(v_messages, 'Conflicting active tariff configurations exist for the selected township and customer tier.');
    v_tariff.base_tariff := 0;
    v_tariff.included_kg := 0;
    v_tariff.extra_per_kg := 0;
    v_tariff.commitment_min_ways := 0;
    v_tariff.commitment_refund_per_way := 0;
  else
    select * into v_tariff
    from public.be_parcel_tariffs_v2 t
    where public.be_financial_v2_township_key_v61_4_1(t.township) = public.be_financial_v2_township_key_v61_4_1(p_township)
      and t.customer_tier = v_tier
      and t.status = 'ACTIVE'
      and t.effective_from <= public.be_business_date()
      and (t.effective_to is null or t.effective_to >= public.be_business_date())
    order by t.effective_from desc, t.updated_at desc, t.id desc
    limit 1;
  end if;

  v_chargeable := ceil(greatest(0::numeric, coalesce(p_actual_weight_kg,0)));
  v_extra := greatest(0::numeric, v_chargeable - coalesce(v_tariff.included_kg,0));
  v_weight_surcharge := ceil(v_extra * coalesce(v_tariff.extra_per_kg,0))::bigint;
  v_backend_delivery_surcharges := greatest(0::bigint,
    v_weight_surcharge + coalesce(p_cbm_surcharge,0) + coalesce(p_other_surcharge,0));

  -- Receiver-paid collection types add backend-calculated weight/CBM/other
  -- delivery surcharges to the customer's collection. When the merchant pays
  -- delivery, the same surcharge remains Britium entitlement but is recovered
  -- from merchant settlement instead of the receiver.
  v_customer_delivery_surcharges := case
    when v_type = 'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT' then 0
    else v_backend_delivery_surcharges
  end;

  v_gross := greatest(0::bigint, coalesce(v_tariff.base_tariff,0) + v_backend_delivery_surcharges);
  v_commitment_refund := case
    when v_tier = 'COMMITMENT'
      and coalesce(p_merchant_monthly_ways,0) >= coalesce(v_tariff.commitment_min_ways,0)
    then coalesce(v_tariff.commitment_refund_per_way,0)
    else 0
  end;
  v_net := greatest(0::bigint, v_gross - v_commitment_refund);

  case v_type
    when 'ITEM_PRICE_PLUS_DECLARED_DELIVERY' then
      if p_item_price is null then v_messages := array_append(v_messages, 'Item price is required.'); end if;
      if p_delivery_charges is null then v_messages := array_append(v_messages, 'Merchant-declared delivery charge is required.'); end if;
      v_effective := coalesce(p_delivery_charges,0) + v_customer_delivery_surcharges;
      v_cod := coalesce(p_item_price,0) + v_effective + coalesce(p_additional_customer_charge,0);

    when 'TOTAL_AMOUNT_INCLUDING_DELIVERY' then
      if p_item_price is null then v_messages := array_append(v_messages, 'Item price is required.'); end if;
      if p_merchant_stated_total_amount is null then v_messages := array_append(v_messages, 'Merchant-stated total amount is required.'); end if;
      if coalesce(p_merchant_stated_total_amount,0) < coalesce(p_item_price,0) then
        v_messages := array_append(v_messages, 'Merchant-stated total cannot be below item price.');
      else
        v_effective := coalesce(p_merchant_stated_total_amount,0) - coalesce(p_item_price,0) + v_customer_delivery_surcharges;
      end if;
      v_cod := coalesce(p_merchant_stated_total_amount,0) + v_customer_delivery_surcharges + coalesce(p_additional_customer_charge,0);

    when 'DELIVERY_CHARGE_ONLY' then
      if p_delivery_charges is null then v_messages := array_append(v_messages, 'Merchant-declared delivery charge is required.'); end if;
      v_effective := coalesce(p_delivery_charges,0) + v_customer_delivery_surcharges;
      v_cod := v_effective + coalesce(p_additional_customer_charge,0);

    when 'EXACT_COLLECTION_AMOUNT' then
      if p_merchant_stated_total_amount is null then v_messages := array_append(v_messages, 'Merchant-stated total amount is required.'); end if;
      v_cod := coalesce(p_merchant_stated_total_amount,0) + v_customer_delivery_surcharges + coalesce(p_additional_customer_charge,0);
      v_effective := null;

    when 'OPAQUE_COD_COLLECTION' then
      if p_merchant_stated_total_amount is null then v_messages := array_append(v_messages, 'Contracted opaque COD amount is required.'); end if;
      v_cod := coalesce(p_merchant_stated_total_amount,0) + v_customer_delivery_surcharges + coalesce(p_additional_customer_charge,0);
      v_effective := null;

    when 'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT' then
      if p_item_price is null then v_messages := array_append(v_messages, 'Item price is required.'); end if;
      v_effective := 0;
      v_cod := coalesce(p_item_price,0) + coalesce(p_additional_customer_charge,0);

    else
      null;
  end case;

  if cardinality(v_messages) > 0 then
    v_status := 'ERROR';
    v_direction := case
      when v_type = 'EXACT_COLLECTION_AMOUNT' then 'BREAKDOWN_REQUIRED'
      when v_type = 'OPAQUE_COD_COLLECTION' then 'OPAQUE_SERVICE_FEE'
      else 'NO_ADJUSTMENT'
    end;
  elsif v_type = 'EXACT_COLLECTION_AMOUNT' then
    v_status := 'REVIEW';
    v_direction := 'BREAKDOWN_REQUIRED';
    v_messages := array['Receiver collection includes the mandatory delivery surcharge. An accepted item/delivery breakdown is required before normal merchant settlement.'];
  elsif v_type = 'OPAQUE_COD_COLLECTION' then
    v_status := 'REVIEW';
    v_direction := 'OPAQUE_SERVICE_FEE';
    v_messages := array['Receiver collection includes the mandatory delivery surcharge. Merchant payout requires the approved opaque-COD contract fee rule.'];
  else
    v_difference := coalesce(v_effective,0) - v_net;
    v_adjustment := v_difference;
    v_direction := case
      when v_difference > 0 then 'CREDIT_TO_MERCHANT'
      when v_difference < 0 then 'DEDUCT_FROM_MERCHANT'
      else 'NO_ADJUSTMENT'
    end;
    v_merchant_final := coalesce(p_item_price,0) + v_difference
      + coalesce(p_other_merchant_credits,0)
      - coalesce(p_merchant_payable_charges,0);
    v_status := 'OK';
    v_messages := array['Ready. Weight, CBM and approved delivery surcharges are included once according to delivery-charge ownership.'];
  end if;

  return jsonb_build_object(
    'tariff_zone', v_tariff.tariff_zone,
    'tariff_zone_code', v_tariff.tariff_zone_code,
    'base_tariff', v_tariff.base_tariff,
    'included_kg', v_tariff.included_kg,
    'extra_per_kg', v_tariff.extra_per_kg,
    'commitment_min_ways', v_tariff.commitment_min_ways,
    'commitment_refund_per_way', v_tariff.commitment_refund_per_way,
    'chargeable_weight_kg', v_chargeable,
    'extra_kg', v_extra,
    'weight_surcharge', v_weight_surcharge,
    'backend_calculated_delivery_surcharges', v_backend_delivery_surcharges,
    'customer_payable_delivery_surcharges', v_customer_delivery_surcharges,
    'gross_system_delivery_charge', v_gross,
    'commitment_refund', v_commitment_refund,
    'net_system_delivery_charge', v_net,
    'britium_delivery_entitlement', v_net,
    'effective_declared_delivery_charge', v_effective,
    'customer_payable_delivery_component', v_effective,
    'cod_amount', v_cod,
    'delivery_difference', v_difference,
    'merchant_settlement_adjustment', v_adjustment,
    'settlement_direction', v_direction,
    'merchant_final_settlement_amount', v_merchant_final,
    'validation_status', v_status,
    'validation_message', array_to_string(v_messages, ' '),
    'calculation_version', 'PARCEL_FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5',
    'resolved_tariff_township', v_tariff.township,
    'resolved_township_key', public.be_financial_v2_township_key_v61_4_1(p_township),
    'calculated_at', now()
  );
end
$function$;

comment on function public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)
is 'V61.5 all-payment-type matrix. Standard 10 kg uses 3 kg included and 7 kg x 500 MMK surcharge. Customer-paid methods add delivery surcharges once to COD; merchant-paid delivery recovers Britium entitlement from merchant settlement.';

do $self_test$
declare
  v_item_delivery jsonb;
  v_total jsonb;
  v_delivery_only jsonb;
  v_exact jsonb;
  v_opaque jsonb;
  v_merchant_pays jsonb;
begin
  v_item_delivery := public.be_calculate_parcel_financial_v2('Dagon Myothit (North)','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,null,0,0,0,0,0,10,0);
  v_total := public.be_calculate_parcel_financial_v2('Dagon Myothit (North)','STANDARD','TOTAL_AMOUNT_INCLUDING_DELIVERY',50000,null,56000,0,0,0,0,0,10,0);
  v_delivery_only := public.be_calculate_parcel_financial_v2('Dagon Myothit (North)','STANDARD','DELIVERY_CHARGE_ONLY',null,6000,null,0,0,0,0,0,10,0);
  v_exact := public.be_calculate_parcel_financial_v2('Dagon Myothit (North)','STANDARD','EXACT_COLLECTION_AMOUNT',null,null,56000,0,0,0,0,0,10,0);
  v_opaque := public.be_calculate_parcel_financial_v2('Dagon Myothit (North)','STANDARD','OPAQUE_COD_COLLECTION',null,null,56000,0,0,0,0,0,10,0);
  v_merchant_pays := public.be_calculate_parcel_financial_v2('Dagon Myothit (North)','STANDARD','ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',50000,null,null,0,0,0,0,0,10,0);

  if (v_item_delivery->>'extra_kg')::numeric <> 7
     or (v_item_delivery->>'weight_surcharge')::bigint <> 3500
     or (v_item_delivery->>'cod_amount')::bigint <> 59500
     or (v_item_delivery->>'net_system_delivery_charge')::bigint <> 7500
     or (v_item_delivery->>'merchant_final_settlement_amount')::bigint <> 52000 then
    raise exception 'ABORT: item plus delivery result is incorrect: %', v_item_delivery;
  end if;
  if (v_total->>'cod_amount')::bigint <> 59500
     or (v_total->>'merchant_final_settlement_amount')::bigint <> 52000 then
    raise exception 'ABORT: total including delivery result is incorrect: %', v_total;
  end if;
  if (v_delivery_only->>'cod_amount')::bigint <> 9500
     or (v_delivery_only->>'merchant_final_settlement_amount')::bigint <> 2000 then
    raise exception 'ABORT: delivery-only result is incorrect: %', v_delivery_only;
  end if;
  if v_exact->>'validation_status' <> 'REVIEW'
     or v_exact->>'settlement_direction' <> 'BREAKDOWN_REQUIRED'
     or (v_exact->>'cod_amount')::bigint <> 59500 then
    raise exception 'ABORT: exact-collection result is incorrect: %', v_exact;
  end if;
  if v_opaque->>'validation_status' <> 'REVIEW'
     or v_opaque->>'settlement_direction' <> 'OPAQUE_SERVICE_FEE'
     or (v_opaque->>'cod_amount')::bigint <> 59500 then
    raise exception 'ABORT: opaque-COD result is incorrect: %', v_opaque;
  end if;
  if (v_merchant_pays->>'cod_amount')::bigint <> 50000
     or (v_merchant_pays->>'customer_payable_delivery_surcharges')::bigint <> 0
     or (v_merchant_pays->>'weight_surcharge')::bigint <> 3500
     or (v_merchant_pays->>'net_system_delivery_charge')::bigint <> 7500
     or (v_merchant_pays->>'merchant_final_settlement_amount')::bigint <> 42500 then
    raise exception 'ABORT: merchant-pays-delivery result is incorrect: %', v_merchant_pays;
  end if;
  if coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'') <> 'MUTATION_SHADOW' then
    raise exception 'ABORT: mutation mode changed.';
  end if;
end
$self_test$;

insert into public.be_audit_events(action,resource_type,resource_id,details,created_at)
select
  'FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5',
  'function',
  'be_calculate_parcel_financial_v2',
  jsonb_build_object(
    'build','FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5_2026_08_03',
    'all_six_amount_types_supported',true,
    'standard_10kg_extra_kg',7,
    'standard_10kg_weight_surcharge',3500,
    'tariff_rows_changed',false,
    'historical_rows_changed',false,
    'financial_writes_enabled',false,
    'mutation_mode','MUTATION_SHADOW'
  ),
  now()
where to_regclass('public.be_audit_events') is not null
  and not exists (
    select 1 from public.be_audit_events
    where action='FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5'
      and resource_id='be_calculate_parcel_financial_v2'
  );

commit;

select jsonb_pretty(jsonb_build_object(
  'ok',true,
  'build','FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5_2026_08_03',
  'next_gate','INSTALL_BUILD_AND_DEPLOY_DATA_ENTRY_MINIMAL_PAYMENT_MATRIX_V61_5_FRONTEND',
  'standard_10kg_item_plus_delivery',public.be_calculate_parcel_financial_v2('Dagon Myothit (North)','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,null,0,0,0,0,0,10,0),
  'all_six_amount_types_supported',true,
  'tariff_rows_changed',false,
  'historical_rows_changed',false,
  'mutation_mode',(select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),
  'financial_writes_enabled',false
));
