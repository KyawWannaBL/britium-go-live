-- Britium Express Financial V2 payment settlement correction
-- Build: FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1_2026_08_04
-- Scope: apply the approved settlement rules for total-including, exact and opaque COD.
-- Preserves tariff master, township wiring, historical rows, mutation mode and write gate.

rollback;
begin;

do $preflight$
begin
  if to_regprocedure('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)') is null then
    raise exception 'ABORT: be_calculate_parcel_financial_v2 is missing.';
  end if;
  if to_regprocedure('public.be_financial_v2_township_key_v61_4_1(text)') is null then
    raise exception 'ABORT: canonical township resolver is missing.';
  end if;
  if to_regprocedure('public.be_tariff_catalog_v61_7()') is null then
    raise exception 'ABORT: canonical tariff catalog V61.7 is missing.';
  end if;
  if to_regclass('public.be_parcel_tariffs_v2') is null then
    raise exception 'ABORT: be_parcel_tariffs_v2 is missing.';
  end if;
  if to_regclass('public.be_data_entry_financial_v2_runtime_v58') is null then
    raise exception 'ABORT: Financial V2 runtime control is missing.';
  end if;
  if coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'') <> 'MUTATION_SHADOW' then
    raise exception 'ABORT: expected MUTATION_SHADOW before V61.8.1.';
  end if;
end
$preflight$;

create table if not exists public.be_financial_v2_function_backup_v61_8_1 (
  backup_id bigserial primary key,
  build text not null,
  function_signature text not null,
  function_definition text not null,
  definition_md5 text not null,
  backed_up_at timestamptz not null default now()
);

insert into public.be_financial_v2_function_backup_v61_8_1(
  build,function_signature,function_definition,definition_md5
)
select
  'PRE_FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1_2026_08_04',
  'public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)',
  pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure),
  md5(pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure))
where not exists (
  select 1 from public.be_financial_v2_function_backup_v61_8_1
  where build='PRE_FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1_2026_08_04'
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
    when v_type in ('ITEM_PRICE_PLUS_DECLARED_DELIVERY','TOTAL_AMOUNT_INCLUDING_DELIVERY','DELIVERY_CHARGE_ONLY')
      then v_backend_delivery_surcharges
    else 0
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
      if p_delivery_charges is null then v_messages := array_append(v_messages, 'Merchant-declared delivery charge is required.'); end if;
      -- Approved business meaning: the operator enters item price and the
      -- merchant-declared delivery amount separately. Mandatory receiver-paid
      -- weight/CBM/other delivery surcharges are then added once.
      v_effective := coalesce(p_delivery_charges,0) + v_customer_delivery_surcharges;
      v_cod := coalesce(p_item_price,0) + v_effective + coalesce(p_additional_customer_charge,0);

    when 'DELIVERY_CHARGE_ONLY' then
      if p_delivery_charges is null then v_messages := array_append(v_messages, 'Merchant-declared delivery charge is required.'); end if;
      v_effective := coalesce(p_delivery_charges,0) + v_customer_delivery_surcharges;
      v_cod := v_effective + coalesce(p_additional_customer_charge,0);

    when 'EXACT_COLLECTION_AMOUNT' then
      if p_merchant_stated_total_amount is null then v_messages := array_append(v_messages, 'Merchant-stated exact collection amount is required.'); end if;
      -- The stated amount is collected exactly. Britium entitlement is not
      -- added to receiver COD; it is deducted from the gross collection when
      -- merchant settlement is calculated.
      v_cod := coalesce(p_merchant_stated_total_amount,0);
      v_effective := null;

    when 'OPAQUE_COD_COLLECTION' then
      if p_merchant_stated_total_amount is null then v_messages := array_append(v_messages, 'Opaque COD gross collection amount is required.'); end if;
      -- Opaque COD follows the same gross-minus-Britium settlement rule as
      -- exact collection: collect the stated gross and deduct the canonical
      -- Britium entitlement to determine the merchant payable amount.
      v_cod := coalesce(p_merchant_stated_total_amount,0);
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
    v_direction := 'NO_ADJUSTMENT';
  elsif v_type in ('EXACT_COLLECTION_AMOUNT','OPAQUE_COD_COLLECTION') then
    v_difference := null;
    v_adjustment := -v_net;
    v_merchant_final := v_cod - v_net
      + coalesce(p_other_merchant_credits,0)
      - coalesce(p_merchant_payable_charges,0);
    v_direction := case
      when v_merchant_final > 0 then 'CREDIT_TO_MERCHANT'
      when v_merchant_final < 0 then 'DEDUCT_FROM_MERCHANT'
      else 'NO_ADJUSTMENT'
    end;
    v_status := 'OK';
    v_messages := array[case
      when v_type = 'EXACT_COLLECTION_AMOUNT'
        then 'Ready. Exact receiver collection is preserved and Britium entitlement is deducted from the gross amount for merchant settlement.'
      else 'Ready. Opaque COD gross collection is preserved and Britium entitlement is deducted from the gross amount for merchant settlement.'
    end];
  else
    v_difference := coalesce(v_effective,0) - v_net;
    v_adjustment := v_difference;
    v_direction := case
      when v_difference > 0 then 'CREDIT_TO_MERCHANT'
      when v_difference < 0 then 'DEDUCT_FROM_MERCHANT'
      else 'NO_ADJUSTMENT'
    end;
    v_merchant_final := case
      when v_type = 'DELIVERY_CHARGE_ONLY' then 0
      else coalesce(p_item_price,0)
    end + v_difference
      + coalesce(p_other_merchant_credits,0)
      - coalesce(p_merchant_payable_charges,0);
    v_status := 'OK';
    v_messages := array['Ready. Collection-type ownership rules were applied without hidden-field carryover or duplicate surcharge collection.'];
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
    'calculation_version', 'PARCEL_FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1',
    'resolved_tariff_township', v_tariff.township,
    'resolved_township_key', public.be_financial_v2_township_key_v61_4_1(p_township),
    'calculated_at', now()
  );
end
$function$;



comment on function public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)
is 'V61.8.1 approved payment settlement: item-plus-delivery and total-including accept item plus declared delivery and add receiver-paid surcharge once; delivery-only returns declared delivery plus surcharge; exact and opaque preserve gross collection and settle merchant as gross minus Britium entitlement.';

do $self_test$
declare
  v_item_delivery jsonb;
  v_total jsonb;
  v_delivery_only jsonb;
  v_exact jsonb;
  v_opaque jsonb;
  v_merchant_pays jsonb;
begin
  v_item_delivery := public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,null,0,0,0,0,0,10,0);
  v_total := public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','TOTAL_AMOUNT_INCLUDING_DELIVERY',50000,6000,null,0,0,0,0,0,10,0);
  v_delivery_only := public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','DELIVERY_CHARGE_ONLY',50000,6000,56000,0,0,0,0,0,10,0);
  v_exact := public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','EXACT_COLLECTION_AMOUNT',50000,6000,56000,0,0,0,0,0,10,0);
  v_opaque := public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','OPAQUE_COD_COLLECTION',50000,6000,56000,0,0,0,0,0,10,0);
  v_merchant_pays := public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',50000,6000,56000,0,0,0,0,0,10,0);

  if (v_item_delivery->>'cod_amount')::bigint <> 59500
     or (v_item_delivery->>'weight_surcharge')::bigint <> 3500
     or (v_item_delivery->>'merchant_final_settlement_amount')::bigint <> 52000 then
    raise exception 'ABORT: item-plus-delivery result incorrect: %', v_item_delivery;
  end if;
  if (v_total->>'cod_amount')::bigint <> 59500
     or (v_total->>'customer_payable_delivery_surcharges')::bigint <> 3500
     or (v_total->>'net_system_delivery_charge')::bigint <> 7500
     or (v_total->>'merchant_final_settlement_amount')::bigint <> 52000 then
    raise exception 'ABORT: total-including-delivery result incorrect: %', v_total;
  end if;
  if (v_delivery_only->>'cod_amount')::bigint <> 9500
     or (v_delivery_only->>'merchant_final_settlement_amount')::bigint <> 2000 then
    raise exception 'ABORT: delivery-only result incorrect or stale item leaked: %', v_delivery_only;
  end if;
  if v_exact->>'validation_status' <> 'OK'
     or (v_exact->>'cod_amount')::bigint <> 56000
     or (v_exact->>'net_system_delivery_charge')::bigint <> 7500
     or (v_exact->>'merchant_final_settlement_amount')::bigint <> 48500
     or (v_exact->>'customer_payable_delivery_surcharges')::bigint <> 0 then
    raise exception 'ABORT: exact-collection result incorrect: %', v_exact;
  end if;
  if v_opaque->>'validation_status' <> 'OK'
     or (v_opaque->>'cod_amount')::bigint <> 56000
     or (v_opaque->>'net_system_delivery_charge')::bigint <> 7500
     or (v_opaque->>'merchant_final_settlement_amount')::bigint <> 48500
     or (v_opaque->>'customer_payable_delivery_surcharges')::bigint <> 0 then
    raise exception 'ABORT: opaque-COD result incorrect: %', v_opaque;
  end if;
  if (v_merchant_pays->>'cod_amount')::bigint <> 50000
     or (v_merchant_pays->>'merchant_final_settlement_amount')::bigint <> 42500 then
    raise exception 'ABORT: merchant-pays result incorrect: %', v_merchant_pays;
  end if;
  if coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'') <> 'MUTATION_SHADOW' then
    raise exception 'ABORT: mutation mode changed.';
  end if;
end
$self_test$;

insert into public.be_audit_events(action,resource_type,resource_id,details,created_at)
select
  'FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1',
  'function',
  'be_calculate_parcel_financial_v2',
  jsonb_build_object(
    'build','FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1_2026_08_04',
    'total_including_adds_receiver_surcharge_once',true,
    'exact_gross_minus_britium',true,
    'opaque_gross_minus_britium',true,
    'delivery_only_stale_item_blocked',true,
    'tariff_rows_changed',false,
    'historical_rows_changed',false,
    'financial_writes_enabled',false,
    'mutation_mode','MUTATION_SHADOW'
  ),
  now()
where to_regclass('public.be_audit_events') is not null
  and not exists (
    select 1 from public.be_audit_events
    where action='FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1'
      and resource_id='be_calculate_parcel_financial_v2'
  );

commit;

select jsonb_pretty(jsonb_build_object(
  'ok',true,
  'build','FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1_2026_08_04',
  'next_gate','INSTALL_BUILD_AND_DEPLOY_DATA_ENTRY_PAYMENT_SETTLEMENT_V61_8_1_FRONTEND',
  'results',jsonb_build_object(
    'ITEM_PRICE_PLUS_DECLARED_DELIVERY',public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,null,0,0,0,0,0,10,0),
    'TOTAL_AMOUNT_INCLUDING_DELIVERY',public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','TOTAL_AMOUNT_INCLUDING_DELIVERY',50000,6000,null,0,0,0,0,0,10,0),
    'DELIVERY_CHARGE_ONLY',public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','DELIVERY_CHARGE_ONLY',50000,6000,56000,0,0,0,0,0,10,0),
    'EXACT_COLLECTION_AMOUNT',public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','EXACT_COLLECTION_AMOUNT',50000,6000,56000,0,0,0,0,0,10,0),
    'OPAQUE_COD_COLLECTION',public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','OPAQUE_COD_COLLECTION',50000,6000,56000,0,0,0,0,0,10,0),
    'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',50000,6000,56000,0,0,0,0,0,10,0)
  ),
  'tariff_rows_changed',false,
  'historical_rows_changed',false,
  'mutation_mode',(select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),
  'financial_writes_enabled',false
));
