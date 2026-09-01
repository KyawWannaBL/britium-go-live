
do $migration$
declare
  v_oid oid := to_regprocedure(
    'public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'
  )::oid;
  v_definition text;
  v_old text :=
    'v_customer_delivery_surcharges := case' || E'\r\n' ||
    '    when v_type in (''ITEM_PRICE_PLUS_DECLARED_DELIVERY'',''TOTAL_AMOUNT_INCLUDING_DELIVERY'',''DELIVERY_CHARGE_ONLY'')' || E'\r\n' ||
    '      then v_backend_delivery_surcharges' || E'\r\n' ||
    '    else 0' || E'\r\n' ||
    '  end;';
  v_new text :=
    '-- Merchant-declared delivery is the complete receiver-facing amount.' || E'\r\n' ||
    '  -- Backend tariff shortfalls are recovered from merchant settlement.' || E'\r\n' ||
    '  v_customer_delivery_surcharges := 0;';
begin
  if v_oid is null then
    raise exception 'Target financial calculation function was not found';
  end if;

  v_definition := pg_get_functiondef(v_oid);

  if strpos(v_definition, v_old) = 0 then
    raise exception 'Expected surcharge-calculation block was not found; migration stopped safely';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  v_definition := replace(
    v_definition,
    'PARCEL_FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1',
    'PARCEL_FINANCIAL_V2_DECLARED_DELIVERY_SETTLEMENT_V61_8_2'
  );

  execute v_definition;
end
$migration$;

comment on function public.be_calculate_parcel_financial_v2(
  text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer
) is
'Merchant-declared delivery is the complete receiver-facing amount. Britium tariff shortfalls are deducted from merchant settlement.';
;
