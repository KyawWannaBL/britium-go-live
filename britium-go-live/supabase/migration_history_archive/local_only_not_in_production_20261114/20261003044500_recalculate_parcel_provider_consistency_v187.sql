-- Keep existing-parcel recalculation consistent with the provider-aware Data Entry engine.
-- Royal Express: Britium entitlement = 15% of approved normal township tariff.
-- GSK: Britium entitlement = 45% of OS-set delivery price.
-- This migration changes calculation logic only; it does not bulk-recalculate historical parcels.

create or replace function public.be_recalculate_parcel_financial_v2(
  p_parcel_id text,
  p_actor uuid default null::uuid,
  p_authorized_by uuid default null::uuid,
  p_reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_parcel public.parcels%rowtype;
  v_profile public.be_merchant_financial_profiles_v2%rowtype;
  v_monthly integer := 0;
  v_result jsonb;
  v_previous_input jsonb;
  v_previous_calculated jsonb;
  v_type text;
  v_royal jsonb;
  v_reconciled jsonb;
begin
  select * into v_parcel
  from public.parcels
  where id::text = p_parcel_id
  for update;

  if not found then raise exception 'Parcel % not found', p_parcel_id; end if;

  if upper(coalesce(v_parcel.status,'')) in ('DELIVERED','SETTLED','COD_SETTLED')
     or v_parcel.financial_settled_at is not null then
    raise exception 'Delivered or settled parcel financials cannot be edited directly; create an adjustment transaction';
  end if;

  if v_parcel.financial_locked_at is not null and p_authorized_by is null then
    raise exception 'Financial recalculation after lock/printing requires authorization';
  end if;

  select * into v_profile
  from public.be_merchant_financial_profiles_v2
  where merchant_id = v_parcel.merchant_id::text
    and is_active
    and effective_from <= public.be_business_date()
    and (effective_to is null or effective_to >= public.be_business_date())
  limit 1;

  if not found then
    raise exception 'No active merchant financial profile exists for merchant %', v_parcel.merchant_id;
  end if;

  select count(*)::integer into v_monthly
  from public.parcels p
  where p.merchant_id::text = v_parcel.merchant_id::text
    and date_trunc('month', coalesce(p.created_at, now())) = date_trunc('month', coalesce(v_parcel.created_at, now()))
    and upper(coalesce(p.status,'')) not in ('CANCELLED','FAILED');

  v_previous_input := jsonb_build_object(
    'item_price', v_parcel.item_price,
    'delivery_charges', v_parcel.delivery_charges,
    'weight_kg', v_parcel.weight_kg,
    'amount_entry_type', v_parcel.amount_entry_type,
    'merchant_stated_total_amount', v_parcel.merchant_stated_total_amount,
    'additional_customer_charge', v_parcel.additional_customer_charge,
    'cbm_surcharge', v_parcel.cbm_surcharge,
    'other_surcharge', v_parcel.other_surcharge,
    'merchant_payable_charges', v_parcel.merchant_payable_charges,
    'other_merchant_credits', v_parcel.other_merchant_credits
  );

  v_previous_calculated := jsonb_build_object(
    'cod_amount', v_parcel.cod_amount,
    'net_system_delivery_charge', v_parcel.net_system_delivery_charge,
    'delivery_difference', v_parcel.delivery_difference,
    'settlement_direction', v_parcel.settlement_direction,
    'merchant_final_settlement_amount', v_parcel.merchant_final_settlement_amount,
    'validation_status', v_parcel.validation_status,
    'calculation_version', v_parcel.calculation_version,
    'calculated_at', v_parcel.calculated_at
  );

  v_result := public.be_calculate_parcel_financial_v2(
    v_parcel.township::text,
    v_profile.customer_tier,
    v_parcel.amount_entry_type::text,
    v_parcel.item_price::bigint,
    v_parcel.delivery_charges::bigint,
    v_parcel.merchant_stated_total_amount::bigint,
    v_parcel.additional_customer_charge::bigint,
    v_parcel.cbm_surcharge::bigint,
    v_parcel.other_surcharge::bigint,
    v_parcel.merchant_payable_charges::bigint,
    v_parcel.other_merchant_credits::bigint,
    v_parcel.weight_kg::numeric,
    v_monthly
  );

  if v_result->>'validation_status' = 'ERROR' then
    raise exception 'Parcel financial validation failed: %', v_result->>'validation_message';
  end if;

  v_type := upper(btrim(coalesce(v_parcel.amount_entry_type,'')));

  if v_type in ('ITEM_PRICE_PLUS_DECLARED_DELIVERY','TOTAL_AMOUNT_INCLUDING_DELIVERY','DELIVERY_CHARGE_ONLY') then
    if upper(btrim(coalesce(v_parcel.merchant_id,''))) = 'GSK' then
      v_reconciled := public.be_reconcile_declared_delivery_v21(
        v_parcel.merchant_id::text,
        v_type,
        coalesce(v_parcel.item_price,0)::bigint,
        coalesce(v_parcel.delivery_charges,0)::bigint,
        coalesce(nullif(v_result->>'backend_calculated_delivery_surcharges','')::bigint,0),
        coalesce(nullif(v_result->>'net_system_delivery_charge','')::bigint,0),
        coalesce(v_parcel.merchant_payable_charges,0)::bigint,
        coalesce(v_parcel.other_merchant_credits,0)::bigint
      );

      v_result := v_result || v_reconciled || jsonb_build_object(
        'calculation_version','PARCEL_RECALC_GSK_45_PERCENT_V187',
        'validation_message','Ready. GSK Britium entitlement is 45% of the OS-set delivery price; receiver COD and merchant settlement are reconciled once.'
      );
    else
      v_royal := public.be_data_entry_royal_commission_v27(v_parcel.township::text);

      if coalesce((v_royal->>'matched')::boolean,false) then
        v_reconciled := public.be_reconcile_declared_delivery_v21(
          v_parcel.merchant_id::text,
          v_type,
          coalesce(v_parcel.item_price,0)::bigint,
          coalesce(v_parcel.delivery_charges,0)::bigint,
          coalesce(nullif(v_result->>'backend_calculated_delivery_surcharges','')::bigint,0),
          coalesce(nullif(v_royal->>'commission_mmk','')::bigint,0),
          coalesce(v_parcel.merchant_payable_charges,0)::bigint,
          coalesce(v_parcel.other_merchant_credits,0)::bigint
        );

        v_result := v_result || v_reconciled || v_royal || jsonb_build_object(
          'royal_partner_tariff_mmk',coalesce(nullif(v_royal->>'normal_tariff_mmk','')::bigint,0),
          'royal_partner_commission_rate_percent',15,
          'royal_partner_commission_mmk',coalesce(nullif(v_royal->>'commission_mmk','')::bigint,0),
          'britium_entitlement_rule','ROYAL_PARTNER_NORMAL_TARIFF_15_PERCENT',
          'calculation_version','PARCEL_RECALC_ROYAL_15_PERCENT_V187',
          'validation_message','Ready. Royal Express Britium entitlement is 15% of the approved normal township tariff; receiver COD and merchant settlement are reconciled once.'
        );
      end if;
    end if;
  end if;

  update public.parcels set
    customer_tier = v_profile.customer_tier,
    monthly_ways = v_monthly,
    cod_amount = (v_result->>'cod_amount')::bigint,
    tariff_zone = v_result->>'tariff_zone',
    tariff_zone_code = v_result->>'tariff_zone_code',
    base_tariff = (v_result->>'base_tariff')::bigint,
    included_kg = (v_result->>'included_kg')::numeric,
    extra_per_kg = (v_result->>'extra_per_kg')::bigint,
    commitment_min_ways = (v_result->>'commitment_min_ways')::integer,
    commitment_refund_per_way = (v_result->>'commitment_refund_per_way')::bigint,
    chargeable_weight_kg = (v_result->>'chargeable_weight_kg')::numeric,
    extra_kg = (v_result->>'extra_kg')::numeric,
    weight_surcharge = (v_result->>'weight_surcharge')::bigint,
    gross_system_delivery_charge = (v_result->>'gross_system_delivery_charge')::bigint,
    commitment_refund = (v_result->>'commitment_refund')::bigint,
    net_system_delivery_charge = (v_result->>'net_system_delivery_charge')::bigint,
    effective_declared_delivery_charge = nullif(v_result->>'effective_declared_delivery_charge','')::bigint,
    delivery_difference = nullif(v_result->>'delivery_difference','')::bigint,
    settlement_direction = v_result->>'settlement_direction',
    merchant_settlement_adjustment = nullif(v_result->>'merchant_settlement_adjustment','')::bigint,
    merchant_final_settlement_amount = nullif(v_result->>'merchant_final_settlement_amount','')::bigint,
    validation_status = v_result->>'validation_status',
    validation_message = v_result->>'validation_message',
    calculation_version = v_result->>'calculation_version',
    calculated_at = coalesce(nullif(v_result->>'calculated_at','')::timestamptz, now()),
    entered_by = coalesce(entered_by, p_actor),
    authorized_by = p_authorized_by
  where id::text = p_parcel_id;

  insert into public.be_parcel_financial_audit_v2 (
    parcel_id, way_id, previous_input_values, new_input_values,
    previous_calculated_values, new_calculated_values,
    employee_id, authorization_employee_id, reason, calculation_version
  ) values (
    p_parcel_id, v_parcel.way_id::text, v_previous_input, v_previous_input,
    v_previous_calculated, v_result,
    p_actor, p_authorized_by, p_reason, v_result->>'calculation_version'
  );

  return v_result;
end
$function$;
