-- Controlled rollback for V61.3.3. Use only after a confirmed regression and only in MUTATION_SHADOW.
begin;
do $guard$ declare v_mode text; begin
  select mutation_mode into v_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton;
  if coalesce(v_mode,'') <> 'MUTATION_SHADOW' then raise exception 'ABORT: rollback allowed only in MUTATION_SHADOW.'; end if;
end $guard$;

-- Restore only exact Insein tariff rows from the V61.3.3 backup.
do $restore_tariff$
begin
  if to_regclass('public.backup_be_parcel_tariffs_v61_3_3_20260802') is not null then
    delete from public.be_parcel_tariffs_v2 t
    where public.be_financial_v2_township_key_v61_3_3(t.township)='insein';

    insert into public.be_parcel_tariffs_v2(
      id,township,customer_tier,tariff_zone,tariff_zone_code,base_tariff,included_kg,
      extra_per_kg,commitment_min_ways,commitment_refund_per_way,note,status,
      effective_from,effective_to,created_at,updated_at
    )
    select id,township,customer_tier,tariff_zone,tariff_zone_code,base_tariff,included_kg,
      extra_per_kg,commitment_min_ways,commitment_refund_per_way,note,status,
      effective_from,effective_to,created_at,updated_at
    from public.backup_be_parcel_tariffs_v61_3_3_20260802
    order by id
    on conflict (id) do update set
      township=excluded.township,customer_tier=excluded.customer_tier,
      tariff_zone=excluded.tariff_zone,tariff_zone_code=excluded.tariff_zone_code,
      base_tariff=excluded.base_tariff,included_kg=excluded.included_kg,
      extra_per_kg=excluded.extra_per_kg,commitment_min_ways=excluded.commitment_min_ways,
      commitment_refund_per_way=excluded.commitment_refund_per_way,note=excluded.note,
      status=excluded.status,effective_from=excluded.effective_from,effective_to=excluded.effective_to,
      created_at=excluded.created_at,updated_at=excluded.updated_at;
  end if;
end
$restore_tariff$;

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
create or replace function public.be_data_entry_financial_v2_schema()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_access jsonb;
  v_fields jsonb;
begin
  v_access := public.be_data_entry_require_access_v57('view', false);
  v_fields := jsonb_build_array(
      jsonb_build_object('name','id','section','Parcel Identity','ownership','SERVER','editable',false,'data_type','uuid','required',false,'source','parcels.id'),
      jsonb_build_object('name','way_id','section','Parcel Identity','ownership','SERVER','editable',false,'data_type','text','required',false,'source','parcels.way_id'),
      jsonb_build_object('name','customer_id','section','Parcel Identity','ownership','INPUT','editable',true,'data_type','text','required',false,'source','client selection; validated on mutation'),
      jsonb_build_object('name','merchant_id','section','Parcel Identity','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client selection; profile resolved by backend'),
      jsonb_build_object('name','status','section','Parcel Identity','ownership','INPUT','editable',true,'data_type','text','required',false,'source','operational status when permitted'),
      jsonb_build_object('name','recipient_name','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input'),
      jsonb_build_object('name','recipient_phone','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input'),
      jsonb_build_object('name','township','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input; exact tariff lookup'),
      jsonb_build_object('name','delivery_address','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input'),
      jsonb_build_object('name','item_price','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input by amount-entry type'),
      jsonb_build_object('name','delivery_charges','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','merchant-declared delivery charge'),
      jsonb_build_object('name','cod_amount','section','Collection Instructions','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend amount-entry calculation'),
      jsonb_build_object('name','weight_kg','section','Weight & Tariff','ownership','INPUT','editable',true,'data_type','numeric','required',true,'source','client input'),
      jsonb_build_object('name','created_at','section','Audit Information','ownership','SERVER','editable',false,'data_type','timestamptz','required',false,'source','database timestamp'),
      jsonb_build_object('name','updated_at','section','Audit Information','ownership','SERVER','editable',false,'data_type','timestamptz','required',false,'source','database timestamp'),
      jsonb_build_object('name','environment','section','Parcel Identity','ownership','SERVER','editable',false,'data_type','text','required',true,'source','PRODUCTION'),
      jsonb_build_object('name','customer_tier','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','text','required',true,'source','active approved merchant profile'),
      jsonb_build_object('name','monthly_ways','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','integer','required',true,'source','backend parcel count'),
      jsonb_build_object('name','amount_entry_type','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client selection'),
      jsonb_build_object('name','merchant_stated_total_amount','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input by amount-entry type'),
      jsonb_build_object('name','additional_customer_charge','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input'),
      jsonb_build_object('name','cbm_surcharge','section','Weight & Tariff','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input'),
      jsonb_build_object('name','other_surcharge','section','Weight & Tariff','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input'),
      jsonb_build_object('name','merchant_payable_charges','section','Merchant Settlement','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','approved client input'),
      jsonb_build_object('name','other_merchant_credits','section','Merchant Settlement','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','approved client input'),
      jsonb_build_object('name','remarks','section','Audit Information','ownership','INPUT','editable',true,'data_type','text','required',false,'source','client input'),
      jsonb_build_object('name','entered_by','section','Audit Information','ownership','SERVER','editable',false,'data_type','uuid','required',true,'source','auth.uid()'),
      jsonb_build_object('name','authorized_by','section','Audit Information','ownership','SERVER','editable',false,'data_type','uuid','required',false,'source','set by authorized mutation'),
      jsonb_build_object('name','tariff_zone','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','text','required',true,'source','active tariff'),
      jsonb_build_object('name','tariff_zone_code','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','text','required',true,'source','active tariff'),
      jsonb_build_object('name','base_tariff','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','active tariff'),
      jsonb_build_object('name','included_kg','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','numeric','required',true,'source','active tariff'),
      jsonb_build_object('name','extra_per_kg','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','active tariff'),
      jsonb_build_object('name','commitment_min_ways','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','integer','required',true,'source','active tariff'),
      jsonb_build_object('name','commitment_refund_per_way','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','active tariff'),
      jsonb_build_object('name','chargeable_weight_kg','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','numeric','required',true,'source','backend calculation'),
      jsonb_build_object('name','extra_kg','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','numeric','required',true,'source','backend calculation'),
      jsonb_build_object('name','weight_surcharge','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','backend calculation'),
      jsonb_build_object('name','gross_system_delivery_charge','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','backend calculation'),
      jsonb_build_object('name','commitment_refund','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','backend calculation'),
      jsonb_build_object('name','net_system_delivery_charge','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','backend calculation'),
      jsonb_build_object('name','effective_declared_delivery_charge','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend calculation'),
      jsonb_build_object('name','delivery_difference','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend calculation'),
      jsonb_build_object('name','settlement_direction','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','text','required',true,'source','backend calculation'),
      jsonb_build_object('name','merchant_settlement_adjustment','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend calculation'),
      jsonb_build_object('name','merchant_final_settlement_amount','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend calculation'),
      jsonb_build_object('name','validation_status','section','Validation','ownership','SERVER','editable',false,'data_type','text','required',true,'source','backend validation'),
      jsonb_build_object('name','validation_message','section','Validation','ownership','SERVER','editable',false,'data_type','text','required',true,'source','backend validation'),
      jsonb_build_object('name','calculation_version','section','Validation','ownership','SERVER','editable',false,'data_type','text','required',true,'source','backend version'),
      jsonb_build_object('name','calculated_at','section','Validation','ownership','SERVER','editable',false,'data_type','timestamptz','required',true,'source','backend timestamp')
  );

  return jsonb_build_object(
    'ok', true,
    'build', 'DATA_ENTRY_FINANCIAL_V2_READONLY_V58_2A_2026_07_31',
    'generated_at', now(),
    'data', jsonb_build_object(
      'schema_version', 'FINANCIAL_V2_SCHEMA_2026_07_31',
      'field_count', jsonb_array_length(v_fields),
      'environment', 'PRODUCTION',
      'mutation_rpcs_activated', false,
      'fields', v_fields
    ),
    'access', v_access
  );
end
$function$;
create or replace function public.be_data_entry_financial_v2_calculate(p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_access jsonb;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_merchant_id text := upper(nullif(btrim(coalesce(p_payload ->> 'merchant_id','')),''));
  v_township text := nullif(btrim(coalesce(p_payload ->> 'township','')), '');
  v_amount_type text := upper(nullif(btrim(coalesce(p_payload ->> 'amount_entry_type','')),''));
  v_profile public.be_merchant_financial_profiles_v2%rowtype;
  v_monthly integer := 0;
  v_quote jsonb;
  v_row jsonb;
  v_errors text[] := array[]::text[];
  v_item_price bigint;
  v_delivery_charges bigint;
  v_stated_total bigint;
  v_additional bigint := 0;
  v_cbm bigint := 0;
  v_other bigint := 0;
  v_merchant_charges bigint := 0;
  v_merchant_credits bigint := 0;
  v_weight numeric := 0;
  v_text text;
begin
  v_access := public.be_data_entry_require_access_v57('create', false);

  if v_merchant_id is null then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_FINANCIAL_V2_READONLY_V58_2A_2026_07_31',
      'generated_at', now(),
      'errors', jsonb_build_array(jsonb_build_object(
        'code','MERCHANT_ID_REQUIRED','field','merchant_id','message','Merchant ID is required.'
      )),
      'access', v_access
    );
  end if;

  select * into v_profile
  from public.be_merchant_financial_profiles_v2 m
  where upper(btrim(m.merchant_id)) = v_merchant_id
    and m.is_active
    and m.effective_from <= public.be_business_date()
    and (m.effective_to is null or m.effective_to >= public.be_business_date())
  order by m.effective_from desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_FINANCIAL_V2_READONLY_V58_2A_2026_07_31',
      'generated_at', now(),
      'errors', jsonb_build_array(jsonb_build_object(
        'code','MERCHANT_FINANCIAL_PROFILE_REQUIRED',
        'field','merchant_id',
        'message','No active approved Financial V2 merchant profile exists for this merchant.'
      )),
      'data', jsonb_build_object('merchant_id',v_merchant_id),
      'access', v_access
    );
  end if;

  v_text := nullif(btrim(v_payload ->> 'item_price'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then
    v_errors := array_append(v_errors,'item_price must be a non-negative whole number.');
  else v_item_price := v_text::bigint; end if;

  v_text := nullif(btrim(v_payload ->> 'delivery_charges'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then
    v_errors := array_append(v_errors,'delivery_charges must be a non-negative whole number.');
  else v_delivery_charges := v_text::bigint; end if;

  v_text := nullif(btrim(v_payload ->> 'merchant_stated_total_amount'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then
    v_errors := array_append(v_errors,'merchant_stated_total_amount must be a non-negative whole number.');
  else v_stated_total := v_text::bigint; end if;

  v_text := nullif(btrim(v_payload ->> 'additional_customer_charge'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then v_errors := array_append(v_errors,'additional_customer_charge is invalid.');
  else v_additional := coalesce(v_text::bigint,0); end if;

  v_text := nullif(btrim(v_payload ->> 'cbm_surcharge'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then v_errors := array_append(v_errors,'cbm_surcharge is invalid.');
  else v_cbm := coalesce(v_text::bigint,0); end if;

  v_text := nullif(btrim(v_payload ->> 'other_surcharge'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then v_errors := array_append(v_errors,'other_surcharge is invalid.');
  else v_other := coalesce(v_text::bigint,0); end if;

  v_text := nullif(btrim(v_payload ->> 'merchant_payable_charges'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then v_errors := array_append(v_errors,'merchant_payable_charges is invalid.');
  else v_merchant_charges := coalesce(v_text::bigint,0); end if;

  v_text := nullif(btrim(v_payload ->> 'other_merchant_credits'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then v_errors := array_append(v_errors,'other_merchant_credits is invalid.');
  else v_merchant_credits := coalesce(v_text::bigint,0); end if;

  v_text := nullif(btrim(v_payload ->> 'weight_kg'),'');
  if v_text is not null and v_text !~ '^[0-9]+([.][0-9]+)?$' then v_errors := array_append(v_errors,'weight_kg must be a non-negative number.');
  else v_weight := coalesce(v_text::numeric,0); end if;

  select count(*)::integer into v_monthly
  from public.parcels p
  where upper(btrim(coalesce(p.merchant_id,''))) = v_merchant_id
    and date_trunc('month', coalesce(p.created_at,now()) at time zone 'Asia/Yangon')
        = date_trunc('month', public.be_business_date()::timestamp)
    and upper(coalesce(p.status,'')) not in ('CANCELLED','FAILED');

  v_quote := public.be_calculate_parcel_financial_v2(
    v_township,
    v_profile.customer_tier,
    v_amount_type,
    v_item_price,
    v_delivery_charges,
    v_stated_total,
    v_additional,
    v_cbm,
    v_other,
    v_merchant_charges,
    v_merchant_credits,
    v_weight,
    v_monthly
  );

  if cardinality(v_errors) > 0 then
    v_quote := v_quote || jsonb_build_object(
      'validation_status','ERROR',
      'validation_message',
        array_to_string(v_errors,' ') || case
          when nullif(v_quote ->> 'validation_message','') is null then ''
          else ' ' || (v_quote ->> 'validation_message')
        end
    );
  end if;

  v_row := jsonb_build_object(
    'id', nullif(btrim(v_payload ->> 'id'), ''),
    'way_id', nullif(btrim(v_payload ->> 'way_id'), ''),
    'customer_id', nullif(btrim(v_payload ->> 'customer_id'), ''),
    'merchant_id', v_merchant_id,
    'status', lower(coalesce(nullif(btrim(v_payload ->> 'status'), ''), 'registered')),
    'recipient_name', nullif(btrim(v_payload ->> 'recipient_name'), ''),
    'recipient_phone', nullif(btrim(v_payload ->> 'recipient_phone'), ''),
    'township', v_township,
    'delivery_address', nullif(btrim(v_payload ->> 'delivery_address'), ''),
    'item_price', v_item_price,
    'delivery_charges', v_delivery_charges,
    'cod_amount', nullif(v_quote ->> 'cod_amount', '')::bigint,
    'weight_kg', v_weight,
    'created_at', nullif(btrim(v_payload ->> 'created_at'), ''),
    'updated_at', nullif(btrim(v_payload ->> 'updated_at'), ''),
    'environment', 'PRODUCTION',
    'customer_tier', v_profile.customer_tier,
    'monthly_ways', v_monthly,
    'amount_entry_type', v_amount_type,
    'merchant_stated_total_amount', v_stated_total,
    'additional_customer_charge', v_additional,
    'cbm_surcharge', v_cbm,
    'other_surcharge', v_other,
    'merchant_payable_charges', v_merchant_charges,
    'other_merchant_credits', v_merchant_credits,
    'remarks', nullif(btrim(v_payload ->> 'remarks'), ''),
    'entered_by', nullif(v_access ->> 'actor_user_id', ''),
    'authorized_by', null,
    'tariff_zone', v_quote ->> 'tariff_zone',
    'tariff_zone_code', v_quote ->> 'tariff_zone_code',
    'base_tariff', nullif(v_quote ->> 'base_tariff', '')::bigint,
    'included_kg', nullif(v_quote ->> 'included_kg', '')::numeric,
    'extra_per_kg', nullif(v_quote ->> 'extra_per_kg', '')::bigint,
    'commitment_min_ways', nullif(v_quote ->> 'commitment_min_ways', '')::integer,
    'commitment_refund_per_way', nullif(v_quote ->> 'commitment_refund_per_way', '')::bigint,
    'chargeable_weight_kg', nullif(v_quote ->> 'chargeable_weight_kg', '')::numeric,
    'extra_kg', nullif(v_quote ->> 'extra_kg', '')::numeric,
    'weight_surcharge', nullif(v_quote ->> 'weight_surcharge', '')::bigint,
    'gross_system_delivery_charge', nullif(v_quote ->> 'gross_system_delivery_charge', '')::bigint,
    'commitment_refund', nullif(v_quote ->> 'commitment_refund', '')::bigint,
    'net_system_delivery_charge', nullif(v_quote ->> 'net_system_delivery_charge', '')::bigint,
    'effective_declared_delivery_charge', nullif(v_quote ->> 'effective_declared_delivery_charge', '')::bigint,
    'delivery_difference', nullif(v_quote ->> 'delivery_difference', '')::bigint,
    'settlement_direction', v_quote ->> 'settlement_direction',
    'merchant_settlement_adjustment', nullif(v_quote ->> 'merchant_settlement_adjustment', '')::bigint,
    'merchant_final_settlement_amount', nullif(v_quote ->> 'merchant_final_settlement_amount', '')::bigint,
    'validation_status', v_quote ->> 'validation_status',
    'validation_message', v_quote ->> 'validation_message',
    'calculation_version', v_quote ->> 'calculation_version',
    'calculated_at', nullif(v_quote ->> 'calculated_at', '')::timestamptz
  );

  return jsonb_build_object(
    'ok', coalesce(v_quote ->> 'validation_status','ERROR') <> 'ERROR',
    'build', 'DATA_ENTRY_FINANCIAL_V2_READONLY_V58_2A_2026_07_31',
    'generated_at', now(),
    'data', v_row,
    'warnings', case when v_quote ->> 'validation_status' = 'REVIEW'
      then jsonb_build_array(jsonb_build_object(
        'code','FINANCIAL_REVIEW_REQUIRED','message',v_quote ->> 'validation_message'
      )) else '[]'::jsonb end,
    'errors', case when v_quote ->> 'validation_status' = 'ERROR'
      then jsonb_build_array(jsonb_build_object(
        'code','FINANCIAL_VALIDATION_ERROR','message',v_quote ->> 'validation_message'
      )) else '[]'::jsonb end,
    'server_resolution', jsonb_build_object(
      'customer_tier_source','be_merchant_financial_profiles_v2',
      'resolved_customer_tier',v_profile.customer_tier,
      'backend_monthly_ways',v_monthly,
      'client_customer_tier_ignored',v_payload ? 'customer_tier',
      'calculation_source','be_calculate_parcel_financial_v2'
    ),
    'access', v_access
  );
end
$function$;
drop function if exists public.be_financial_v2_township_key_v61_3_3(text);
commit;
select jsonb_pretty(jsonb_build_object('ok',true,'build','ROLLBACK_FINANCIAL_V2_V61_3_3_TO_V61_3_V58_WRAPPER','mutation_mode',(select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'financial_writes_enabled',false));
