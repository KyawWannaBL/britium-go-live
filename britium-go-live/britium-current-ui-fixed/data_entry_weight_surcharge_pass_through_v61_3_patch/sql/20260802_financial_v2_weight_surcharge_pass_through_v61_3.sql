-- Britium Express Financial V2 V61.3
-- Confirmed business rule:
-- 1. For ITEM_PRICE_PLUS_DECLARED_DELIVERY and DELIVERY_CHARGE_ONLY,
--    customer-paid weight/CBM/other delivery surcharges are added to receiver COD.
-- 2. The same surcharges form part of Britium's delivery entitlement and therefore
--    must not be deducted from the merchant a second time.
-- 3. Example (Insein STANDARD): 50,000 + 6,000 + 3,500 = 59,500 COD;
--    Britium 4,500 + 3,500 = 8,000; merchant settlement = 51,500.
-- 4. Financial V2 mutation mode remains MUTATION_SHADOW. No production row is written.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

create temporary table if not exists pg_temp.be_v61_3_state (
  singleton boolean primary key default true,
  before_md5 text,
  after_md5 text,
  mutation_mode text,
  test_result jsonb
) on commit drop;
truncate pg_temp.be_v61_3_state;

insert into pg_temp.be_v61_3_state(singleton, before_md5, mutation_mode)
select
  true,
  md5(pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure)),
  coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton), 'MUTATION_SHADOW');

do $guard$
declare
  v_definition text;
  v_mode text;
begin
  if to_regprocedure('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)') is null then
    raise exception 'ABORT: required core Financial V2 calculation function is missing.';
  end if;

  select pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure)
  into v_definition;

  if v_definition not like '%PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3%'
     and (
       v_definition not like '%v_effective := p_delivery_charges;%'
       or v_definition not like '%v_cod := coalesce(p_item_price,0) + coalesce(p_delivery_charges,0) + coalesce(p_additional_customer_charge,0);%'
     ) then
    raise exception 'ABORT: the current Financial V2 core function is not the reviewed V58/V61 baseline. No function was changed.';
  end if;

  select mutation_mode into v_mode
  from public.be_data_entry_financial_v2_runtime_v58
  where singleton;

  if coalesce(v_mode, 'MUTATION_SHADOW') <> 'MUTATION_SHADOW' then
    raise exception 'ABORT: Financial V2 mutation mode is %, expected MUTATION_SHADOW.', v_mode;
  end if;
end
$guard$;

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

  select * into v_tariff
  from public.be_parcel_tariffs_v2 t
  where lower(btrim(t.township)) = lower(btrim(p_township))
    and t.customer_tier = v_tier
    and t.status = 'ACTIVE'
    and t.effective_from <= public.be_business_date()
    and (t.effective_to is null or t.effective_to >= public.be_business_date())
  order by t.effective_from desc
  limit 1;

  if not found then
    v_messages := array_append(v_messages, 'No exact active tariff exists for township and customer tier.');
    v_tariff.base_tariff := 0;
    v_tariff.included_kg := 0;
    v_tariff.extra_per_kg := 0;
    v_tariff.commitment_min_ways := 0;
    v_tariff.commitment_refund_per_way := 0;
  end if;

  v_chargeable := ceil(greatest(0::numeric, coalesce(p_actual_weight_kg,0)));
  v_extra := greatest(0::numeric, v_chargeable - coalesce(v_tariff.included_kg,0));
  v_weight_surcharge := ceil(v_extra * coalesce(v_tariff.extra_per_kg,0))::bigint;
  v_customer_delivery_surcharges := greatest(0::bigint,
    v_weight_surcharge
    + coalesce(p_cbm_surcharge,0)
    + coalesce(p_other_surcharge,0));

  v_gross := greatest(0::bigint,
    coalesce(v_tariff.base_tariff,0)
    + v_customer_delivery_surcharges);

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
      -- Confirmed V61.3 rule: receiver pays the merchant-declared delivery plus
      -- backend-calculated delivery surcharges. Britium retains the same surcharges.
      v_effective := coalesce(p_delivery_charges,0) + v_customer_delivery_surcharges;
      v_cod := coalesce(p_item_price,0) + v_effective + coalesce(p_additional_customer_charge,0);

    when 'TOTAL_AMOUNT_INCLUDING_DELIVERY' then
      if p_item_price is null then v_messages := array_append(v_messages, 'Item price is required.'); end if;
      if p_merchant_stated_total_amount is null then v_messages := array_append(v_messages, 'Merchant-stated total amount is required.'); end if;
      v_cod := coalesce(p_merchant_stated_total_amount,0);
      if v_cod < coalesce(p_item_price,0) + coalesce(p_additional_customer_charge,0) then
        v_messages := array_append(v_messages, 'Merchant-stated total cannot be below item price plus additional customer charge.');
      else
        v_effective := v_cod - coalesce(p_item_price,0) - coalesce(p_additional_customer_charge,0);
      end if;

    when 'DELIVERY_CHARGE_ONLY' then
      if p_delivery_charges is null then v_messages := array_append(v_messages, 'Merchant-declared delivery charge is required.'); end if;
      v_effective := coalesce(p_delivery_charges,0) + v_customer_delivery_surcharges;
      v_cod := v_effective + coalesce(p_additional_customer_charge,0);

    when 'EXACT_COLLECTION_AMOUNT' then
      if p_merchant_stated_total_amount is null then v_messages := array_append(v_messages, 'Merchant-stated total amount is required.'); end if;
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
    v_direction := case when v_type = 'EXACT_COLLECTION_AMOUNT' then 'BREAKDOWN_REQUIRED' else 'NO_ADJUSTMENT' end;
  elsif v_type = 'EXACT_COLLECTION_AMOUNT' then
    v_status := 'REVIEW';
    v_direction := 'BREAKDOWN_REQUIRED';
    v_messages := array['Authorized item and delivery breakdown is required before settlement.'];
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
    v_messages := case
      when v_type in ('ITEM_PRICE_PLUS_DECLARED_DELIVERY','DELIVERY_CHARGE_ONLY')
      then array['Ready. Customer-paid delivery surcharges are included in receiver collection and Britium entitlement without double-charging the merchant.']
      else array['Ready for receiver collection and merchant settlement.']
    end;
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
    'calculation_version', 'PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3',
    'calculated_at', now()
  );
end
$function$;

comment on function public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)
is 'V61.3: receiver COD includes customer-paid weight/CBM/other delivery surcharges for item+delivery and delivery-only types; Britium retains those surcharges without double-deducting the merchant.';

do $verify$
declare
  v_result jsonb;
  v_mode text;
  v_definition text;
begin
  v_result := public.be_calculate_parcel_financial_v2(
    'Insein', 'STANDARD', 'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    50000, 6000, 56000, 0, 0, 0, 0, 0, 10, 0
  );

  if coalesce((v_result->>'base_tariff')::bigint,-1) <> 4500 then
    raise exception 'ABORT: expected Insein STANDARD base tariff 4500, received %.', v_result->>'base_tariff';
  end if;
  if coalesce((v_result->>'included_kg')::numeric,-1) <> 3 then
    raise exception 'ABORT: expected included weight 3 kg, received %.', v_result->>'included_kg';
  end if;
  if coalesce((v_result->>'extra_kg')::numeric,-1) <> 7 then
    raise exception 'ABORT: expected extra weight 7 kg, received %.', v_result->>'extra_kg';
  end if;
  if coalesce((v_result->>'weight_surcharge')::bigint,-1) <> 3500 then
    raise exception 'ABORT: expected weight surcharge 3500, received %.', v_result->>'weight_surcharge';
  end if;
  if coalesce((v_result->>'cod_amount')::bigint,-1) <> 59500 then
    raise exception 'ABORT: expected receiver COD 59500, received %.', v_result->>'cod_amount';
  end if;
  if coalesce((v_result->>'net_system_delivery_charge')::bigint,-1) <> 8000 then
    raise exception 'ABORT: expected Britium entitlement 8000, received %.', v_result->>'net_system_delivery_charge';
  end if;
  if coalesce((v_result->>'effective_declared_delivery_charge')::bigint,-1) <> 9500 then
    raise exception 'ABORT: expected customer delivery component 9500, received %.', v_result->>'effective_declared_delivery_charge';
  end if;
  if coalesce((v_result->>'delivery_difference')::bigint,-999999) <> 1500 then
    raise exception 'ABORT: expected merchant delivery margin 1500, received %.', v_result->>'delivery_difference';
  end if;
  if coalesce(v_result->>'settlement_direction','') <> 'CREDIT_TO_MERCHANT' then
    raise exception 'ABORT: expected CREDIT_TO_MERCHANT, received %.', v_result->>'settlement_direction';
  end if;
  if coalesce((v_result->>'merchant_final_settlement_amount')::bigint,-1) <> 51500 then
    raise exception 'ABORT: expected merchant settlement 51500, received %.', v_result->>'merchant_final_settlement_amount';
  end if;
  if coalesce(v_result->>'calculation_version','') <> 'PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3' then
    raise exception 'ABORT: incorrect calculation version %.', v_result->>'calculation_version';
  end if;

  select mutation_mode into v_mode
  from public.be_data_entry_financial_v2_runtime_v58
  where singleton;
  if coalesce(v_mode,'') <> 'MUTATION_SHADOW' then
    raise exception 'ABORT: mutation mode changed unexpectedly to %.', v_mode;
  end if;

  select pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure)
  into v_definition;
  if v_definition not like '%PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3%'
     or v_definition not like '%v_effective := coalesce(p_delivery_charges,0) + v_customer_delivery_surcharges;%'
     or v_definition not like '%v_cod := coalesce(p_item_price,0) + v_effective + coalesce(p_additional_customer_charge,0);%' then
    raise exception 'ABORT: deployed function source is missing V61.3 pass-through controls.';
  end if;

  update pg_temp.be_v61_3_state
  set after_md5 = md5(v_definition), test_result = v_result
  where singleton;
end
$verify$;

insert into public.be_audit_events(
  actor_id, actor_email, actor_role, action, resource_type, resource_id,
  details, upload_code, event_type, entity_type, entity_id, payload
)
select
  auth.uid(),
  null,
  current_user,
  'FINANCIAL_V2_WEIGHT_SURCHARGE_PASS_THROUGH_DEPLOYED',
  'FUNCTION',
  'be_calculate_parcel_financial_v2',
  jsonb_build_object(
    'request_id','FINANCIAL-V2-WEIGHT-PASS-THROUGH-20260802',
    'confirmed_rule','Receiver pays merchant-declared delivery plus backend weight/CBM/other delivery surcharges; Britium retains base tariff plus the same surcharges; merchant is not double-charged.',
    'example',jsonb_build_object(
      'township','Insein','item_price',50000,'merchant_declared_delivery',6000,
      'weight_kg',10,'weight_surcharge',3500,'receiver_cod',59500,
      'britium_entitlement',8000,'merchant_settlement',51500
    ),
    'mutation_mode','MUTATION_SHADOW',
    'production_writes_enabled',false
  ),
  'FINANCIAL-V2-WEIGHT-PASS-THROUGH-20260802',
  'FINANCIAL_V2_CONTROL',
  'FUNCTION',
  'be_calculate_parcel_financial_v2',
  jsonb_build_object(
    'build','FINANCIAL_V2_WEIGHT_SURCHARGE_PASS_THROUGH_V61_3_2026_08_02',
    'before_md5',(select before_md5 from pg_temp.be_v61_3_state where singleton),
    'after_md5',(select after_md5 from pg_temp.be_v61_3_state where singleton),
    'test_result',(select test_result from pg_temp.be_v61_3_state where singleton),
    'historical_rows_changed',false,
    'financial_v2_mutation_mode_changed',false
  )
where not exists (
  select 1 from public.be_audit_events a
  where a.upload_code = 'FINANCIAL-V2-WEIGHT-PASS-THROUGH-20260802'
     or a.details->>'request_id' = 'FINANCIAL-V2-WEIGHT-PASS-THROUGH-20260802'
     or a.payload->>'request_id' = 'FINANCIAL-V2-WEIGHT-PASS-THROUGH-20260802'
);

commit;

select jsonb_pretty(jsonb_build_object(
  'ok', true,
  'build', 'FINANCIAL_V2_WEIGHT_SURCHARGE_PASS_THROUGH_V61_3_2026_08_02',
  'calculation_version', 'PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3',
  'confirmed_example', jsonb_build_object(
    'township','Insein',
    'item_price',50000,
    'merchant_declared_delivery_charge',6000,
    'chargeable_weight_kg',10,
    'included_kg',3,
    'extra_kg',7,
    'extra_per_kg',500,
    'weight_surcharge',3500,
    'receiver_cod',59500,
    'britium_base_tariff',4500,
    'britium_total_entitlement',8000,
    'merchant_delivery_margin',1500,
    'merchant_final_settlement',51500
  ),
  'receiver_collection_rule', 'ITEM + MERCHANT_DECLARED_DELIVERY + CUSTOMER_PAID_WEIGHT_CBM_OTHER_SURCHARGES + APPROVED_ADDITIONAL_CUSTOMER_CHARGE',
  'merchant_settlement_rule', 'ITEM + (CUSTOMER_DELIVERY_COMPONENT - BRITIUM_NET_ENTITLEMENT) + OTHER_MERCHANT_CREDITS - MERCHANT_PAYABLE_CHARGES',
  'mutation_mode', (select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),
  'financial_writes_enabled', false,
  'historical_rows_changed', false,
  'next_gate', 'DEPLOY_V61_3_FRONTEND_AND_BROWSER_VERIFY_59500_8000_51500'
));
