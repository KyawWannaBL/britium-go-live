alter function public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)
rename to be_calculate_parcel_financial_v2_v61_8_2_legacy;

create or replace function public.be_calculate_parcel_financial_v2(
  p_township text,
  p_customer_tier text,
  p_amount_entry_type text,
  p_item_price bigint default null,
  p_delivery_charges bigint default null,
  p_merchant_stated_total_amount bigint default null,
  p_additional_customer_charge bigint default 0,
  p_cbm_surcharge bigint default 0,
  p_other_surcharge bigint default 0,
  p_merchant_payable_charges bigint default 0,
  p_other_merchant_credits bigint default 0,
  p_actual_weight_kg numeric default 0,
  p_merchant_monthly_ways integer default 0
) returns jsonb
language plpgsql
stable
set search_path to 'public','pg_temp'
as $$
declare
  v_quote jsonb;
  v_type text := upper(btrim(coalesce(p_amount_entry_type,'')));
  v_base bigint := 0;
  v_backend_surcharges bigint := 0;
  v_net bigint := 0;
  v_effective bigint := 0;
  v_cod bigint := 0;
  v_difference bigint := 0;
  v_adjustment bigint := 0;
  v_merchant_final bigint := 0;
  v_direction text := 'NO_ADJUSTMENT';
begin
  v_quote := public.be_calculate_parcel_financial_v2_v61_8_2_legacy(
    p_township,
    p_customer_tier,
    p_amount_entry_type,
    p_item_price,
    p_delivery_charges,
    p_merchant_stated_total_amount,
    p_additional_customer_charge,
    p_cbm_surcharge,
    p_other_surcharge,
    p_merchant_payable_charges,
    p_other_merchant_credits,
    p_actual_weight_kg,
    p_merchant_monthly_ways
  );

  if coalesce(v_quote->>'validation_status','ERROR') <> 'ERROR'
     and v_type in (
       'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
       'TOTAL_AMOUNT_INCLUDING_DELIVERY',
       'DELIVERY_CHARGE_ONLY'
     ) then
    v_base := coalesce(nullif(v_quote->>'base_tariff','')::bigint,0);
    v_backend_surcharges := coalesce(nullif(v_quote->>'backend_calculated_delivery_surcharges','')::bigint,0);
    v_net := coalesce(nullif(v_quote->>'net_system_delivery_charge','')::bigint,0);

    v_effective := greatest(coalesce(p_delivery_charges,0), v_base) + v_backend_surcharges;

    v_cod := case
      when v_type = 'DELIVERY_CHARGE_ONLY'
        then v_effective + coalesce(p_additional_customer_charge,0)
      else coalesce(p_item_price,0) + v_effective + coalesce(p_additional_customer_charge,0)
    end;

    v_difference := v_effective - v_net;
    v_adjustment := v_difference;
    v_merchant_final := case
      when v_type = 'DELIVERY_CHARGE_ONLY' then 0
      else coalesce(p_item_price,0)
    end
      + v_difference
      + coalesce(p_other_merchant_credits,0)
      - coalesce(p_merchant_payable_charges,0);

    v_direction := case
      when v_difference > 0 then 'CREDIT_TO_MERCHANT'
      when v_difference < 0 then 'DEDUCT_FROM_MERCHANT'
      else 'NO_ADJUSTMENT'
    end;

    v_quote := v_quote || jsonb_build_object(
      'customer_payable_delivery_surcharges', v_backend_surcharges,
      'effective_declared_delivery_charge', v_effective,
      'customer_payable_delivery_component', v_effective,
      'cod_amount', v_cod,
      'delivery_difference', v_difference,
      'merchant_settlement_adjustment', v_adjustment,
      'settlement_direction', v_direction,
      'merchant_final_settlement_amount', v_merchant_final,
      'validation_message', 'Ready. Receiver collection includes the authoritative township tariff and delivery surcharges; Britium entitlement is separated from merchant settlement.',
      'calculation_version', 'PARCEL_FINANCIAL_V2_RECEIVER_PAID_SYSTEM_DELIVERY_V61_9_0',
      'calculated_at', now()
    );
  end if;

  return v_quote;
end
$$;;
