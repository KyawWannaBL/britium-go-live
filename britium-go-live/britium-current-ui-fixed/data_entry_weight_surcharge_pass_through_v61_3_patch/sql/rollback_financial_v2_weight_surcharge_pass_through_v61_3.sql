-- Rollback V61.3 core calculation only.
-- Restores the reviewed pre-V61.3 Financial V2 formula.
-- Use only after a confirmed V61.3 regression.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $guard$
declare v_definition text;
begin
  select pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure) into v_definition;
  if v_definition not like '%PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3%' then
    raise exception 'ABORT: V61.3 calculation is not active. Rollback not applied.';
  end if;
  if coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'') <> 'MUTATION_SHADOW' then
    raise exception 'ABORT: rollback requires MUTATION_SHADOW mode.';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.be_calculate_parcel_financial_v2(p_township text, p_customer_tier text, p_amount_entry_type text, p_item_price bigint DEFAULT NULL::bigint, p_delivery_charges bigint DEFAULT NULL::bigint, p_merchant_stated_total_amount bigint DEFAULT NULL::bigint, p_additional_customer_charge bigint DEFAULT 0, p_cbm_surcharge bigint DEFAULT 0, p_other_surcharge bigint DEFAULT 0, p_merchant_payable_charges bigint DEFAULT 0, p_other_merchant_credits bigint DEFAULT 0, p_actual_weight_kg numeric DEFAULT 0, p_merchant_monthly_ways integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tariff public.be_parcel_tariffs_v2%rowtype;
  v_tier text := upper(btrim(coalesce(p_customer_tier, '')));
  v_type text := upper(btrim(coalesce(p_amount_entry_type, '')));
  v_messages text[] := array[]::text[];
  v_chargeable numeric(10,3);
  v_extra numeric(10,3);
  v_weight_surcharge bigint;
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
  v_gross := greatest(0::bigint,
    coalesce(v_tariff.base_tariff,0)
    + v_weight_surcharge
    + coalesce(p_cbm_surcharge,0)
    + coalesce(p_other_surcharge,0));
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
      v_effective := p_delivery_charges;
      v_cod := coalesce(p_item_price,0) + coalesce(p_delivery_charges,0) + coalesce(p_additional_customer_charge,0);
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
      v_effective := p_delivery_charges;
      v_cod := coalesce(p_delivery_charges,0) + coalesce(p_additional_customer_charge,0);
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
    v_direction := case when v_difference > 0 then 'CREDIT_TO_MERCHANT'
                        when v_difference < 0 then 'DEDUCT_FROM_MERCHANT'
                        else 'NO_ADJUSTMENT' end;
    v_merchant_final := coalesce(p_item_price,0) + v_difference
      + coalesce(p_other_merchant_credits,0) - coalesce(p_merchant_payable_charges,0);
    v_status := 'OK';
    v_messages := array['Ready for receiver collection and merchant settlement.'];
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
    'gross_system_delivery_charge', v_gross,
    'commitment_refund', v_commitment_refund,
    'net_system_delivery_charge', v_net,
    'effective_declared_delivery_charge', v_effective,
    'cod_amount', v_cod,
    'delivery_difference', v_difference,
    'merchant_settlement_adjustment', v_adjustment,
    'settlement_direction', v_direction,
    'merchant_final_settlement_amount', v_merchant_final,
    'validation_status', v_status,
    'validation_message', array_to_string(v_messages, ' '),
    'calculation_version', 'PARCEL_FINANCIAL_V2',
    'calculated_at', now()
  );
end
$function$
;

comment on function public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)
is 'Pre-V61.3 Financial V2 calculation restored by controlled rollback.';

insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details,upload_code,event_type,entity_type,entity_id,payload)
values(auth.uid(),null,current_user,'FINANCIAL_V2_WEIGHT_SURCHARGE_PASS_THROUGH_ROLLED_BACK','FUNCTION','be_calculate_parcel_financial_v2',
  jsonb_build_object('request_id','FINANCIAL-V2-WEIGHT-PASS-THROUGH-ROLLBACK-20260802','reason','Controlled V61.3 rollback','mutation_mode','MUTATION_SHADOW'),
  'FINANCIAL-V2-WEIGHT-PASS-THROUGH-ROLLBACK-20260802','FINANCIAL_V2_CONTROL','FUNCTION','be_calculate_parcel_financial_v2',
  jsonb_build_object('build','FINANCIAL_V2_WEIGHT_SURCHARGE_PASS_THROUGH_V61_3_ROLLBACK_2026_08_02','historical_rows_changed',false,'financial_v2_mutation_mode_changed',false));

commit;

select jsonb_pretty(jsonb_build_object(
 'ok',true,
 'build','FINANCIAL_V2_WEIGHT_SURCHARGE_PASS_THROUGH_V61_3_ROLLBACK_2026_08_02',
 'calculation_version','PARCEL_FINANCIAL_V2',
 'mutation_mode',(select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),
 'historical_rows_changed',false,
 'financial_writes_enabled',false
));
