begin;

-- Receiver collection is the item price plus the OS-declared delivery price.
-- The gap between that price and Britium's entitlement belongs only in the
-- merchant settlement; it must not be added to receiver COD a second time.
create or replace function public.be_reconcile_declared_delivery_v21(
  p_merchant_id text,
  p_amount_entry_type text,
  p_item_price bigint,
  p_delivery_charges bigint,
  p_backend_surcharges bigint,
  p_standard_britium_entitlement bigint,
  p_merchant_payable_charges bigint default 0,
  p_other_merchant_credits bigint default 0
) returns jsonb
language plpgsql
immutable
set search_path to 'public','pg_temp'
as $function$
declare
  v_type text := upper(btrim(coalesce(p_amount_entry_type,'')));
  v_receiver_delivery bigint := coalesce(p_delivery_charges,0) + coalesce(p_backend_surcharges,0);
  v_britium_entitlement bigint;
  v_difference bigint;
  v_cod bigint;
  v_settlement bigint;
begin
  v_britium_entitlement := case
    when upper(btrim(coalesce(p_merchant_id,''))) = 'GSK'
      then round(coalesce(p_delivery_charges,0)::numeric * 0.45)::bigint
    else coalesce(p_standard_britium_entitlement,0)
  end;

  v_difference := v_receiver_delivery - v_britium_entitlement;
  v_cod := case
    when v_type = 'DELIVERY_CHARGE_ONLY' then v_receiver_delivery
    else coalesce(p_item_price,0) + v_receiver_delivery
  end;
  v_settlement := case
    when v_type = 'DELIVERY_CHARGE_ONLY' then 0
    else coalesce(p_item_price,0)
  end + v_difference
    + coalesce(p_other_merchant_credits,0)
    - coalesce(p_merchant_payable_charges,0);

  return jsonb_build_object(
    'cod_amount',v_cod,
    'customer_payable_delivery_component',v_receiver_delivery,
    'effective_declared_delivery_charge',v_receiver_delivery,
    'net_system_delivery_charge',v_britium_entitlement,
    'delivery_difference',v_difference,
    'merchant_settlement_adjustment',v_difference,
    'merchant_final_settlement_amount',v_settlement,
    'settlement_direction',case
      when v_difference > 0 then 'CREDIT_TO_MERCHANT'
      when v_difference < 0 then 'DEDUCT_FROM_MERCHANT'
      else 'NO_ADJUSTMENT'
    end,
    'britium_entitlement_rule',case
      when upper(btrim(coalesce(p_merchant_id,''))) = 'GSK' then 'GSK_OS_SET_PRICE_45_PERCENT'
      else 'STANDARD_TARIFF'
    end,
    'calculation_version','DECLARED_DELIVERY_RECONCILIATION_V21'
  );
end
$function$;

revoke all on function public.be_reconcile_declared_delivery_v21(
  text,text,bigint,bigint,bigint,bigint,bigint,bigint
) from public, anon, authenticated;
grant execute on function public.be_reconcile_declared_delivery_v21(
  text,text,bigint,bigint,bigint,bigint,bigint,bigint
) to service_role;

alter function public.be_data_entry_financial_v2_calculate(jsonb)
rename to be_data_entry_financial_v2_calculate_v19_legacy;

create or replace function public.be_data_entry_financial_v2_calculate(p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_result jsonb;
  v_data jsonb;
  v_reconciled jsonb;
  v_type text := upper(nullif(btrim(coalesce(p_payload->>'amount_entry_type','')),''));
begin
  v_result := public.be_data_entry_financial_v2_calculate_v19_legacy(v_payload);
  if not coalesce((v_result->>'ok')::boolean,false)
     or v_type not in (
       'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
       'TOTAL_AMOUNT_INCLUDING_DELIVERY',
       'DELIVERY_CHARGE_ONLY'
     ) then
    return v_result;
  end if;

  v_data := coalesce(v_result->'data','{}'::jsonb);
  v_reconciled := public.be_reconcile_declared_delivery_v21(
    v_payload->>'merchant_id',
    v_type,
    coalesce(nullif(btrim(v_payload->>'item_price'),'')::bigint,0),
    coalesce(nullif(btrim(v_payload->>'delivery_charges'),'')::bigint,0),
    coalesce(nullif(v_data->>'backend_calculated_delivery_surcharges','')::bigint,0),
    coalesce(nullif(v_data->>'net_system_delivery_charge','')::bigint,0),
    coalesce(nullif(btrim(v_payload->>'merchant_payable_charges'),'')::bigint,0),
    coalesce(nullif(btrim(v_payload->>'other_merchant_credits'),'')::bigint,0)
  );

  return v_result || jsonb_build_object(
    'build','DATA_ENTRY_DECLARED_DELIVERY_RECONCILIATION_V21_20260904',
    'data',v_data || v_reconciled || jsonb_build_object(
      'validation_message','Ready. Receiver COD uses item price plus the OS-set delivery price and explicit surcharges only. The delivery difference is applied once, to merchant settlement.'
    )
  );
end
$function$;

revoke all on function public.be_data_entry_financial_v2_calculate_v19_legacy(jsonb)
from public, anon, authenticated;
grant execute on function public.be_data_entry_financial_v2_calculate_v19_legacy(jsonb)
to service_role;
revoke all on function public.be_data_entry_financial_v2_calculate(jsonb)
from public, anon;
grant execute on function public.be_data_entry_financial_v2_calculate(jsonb)
to authenticated, service_role;

comment on function public.be_data_entry_financial_v2_calculate(jsonb) is
  'V21 Data Entry finance boundary: declared delivery is collected once; settlement receives the declared-versus-Britium difference; GSK Britium entitlement is 45% of OS-set delivery.';

do $assertions$
declare
  v_standard jsonb;
  v_gsk jsonb;
begin
  v_standard := public.be_reconcile_declared_delivery_v21(
    'OTHER','ITEM_PRICE_PLUS_DECLARED_DELIVERY',28700,5000,0,4000,0,0
  );
  if (v_standard->>'cod_amount')::bigint <> 33700
     or (v_standard->>'net_system_delivery_charge')::bigint <> 4000
     or (v_standard->>'merchant_final_settlement_amount')::bigint <> 29700 then
    raise exception 'V21 standard merchant reconciliation assertion failed: %',v_standard;
  end if;

  v_gsk := public.be_reconcile_declared_delivery_v21(
    'GSK','ITEM_PRICE_PLUS_DECLARED_DELIVERY',28700,5000,0,4000,0,0
  );
  if (v_gsk->>'cod_amount')::bigint <> 33700
     or (v_gsk->>'net_system_delivery_charge')::bigint <> 2250
     or (v_gsk->>'merchant_final_settlement_amount')::bigint <> 31450 then
    raise exception 'V21 GSK reconciliation assertion failed: %',v_gsk;
  end if;
end
$assertions$;

commit;
