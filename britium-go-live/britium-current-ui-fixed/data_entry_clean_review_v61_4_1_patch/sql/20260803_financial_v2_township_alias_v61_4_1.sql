-- Britium Express Financial V2 township alias resolution and clean Data Entry support
-- Build: FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_1_2026_08_03
-- Scope: function definitions and audit only. No tariff or parcel rows are updated.

rollback;

begin;

do $preflight$
begin
  if to_regprocedure('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)') is null then
    raise exception 'ABORT: be_calculate_parcel_financial_v2 is missing.';
  end if;
  if to_regclass('public.be_parcel_tariffs_v2') is null then
    raise exception 'ABORT: be_parcel_tariffs_v2 is missing.';
  end if;
  if to_regclass('public.be_data_entry_financial_v2_runtime_v58') is null then
    raise exception 'ABORT: Financial V2 runtime control is missing.';
  end if;
  if coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'') <> 'MUTATION_SHADOW' then
    raise exception 'ABORT: expected MUTATION_SHADOW before V61.4.1.';
  end if;
end
$preflight$;

create table if not exists public.be_financial_v2_function_backup_v61_4_1 (
  backup_id bigserial primary key,
  build text not null,
  function_signature text not null,
  function_definition text not null,
  definition_md5 text not null,
  backed_up_at timestamptz not null default now()
);

insert into public.be_financial_v2_function_backup_v61_4_1(
  build,function_signature,function_definition,definition_md5
)
select
  'PRE_FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_1_2026_08_03',
  'public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)',
  pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure),
  md5(pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure))
where not exists (
  select 1
  from public.be_financial_v2_function_backup_v61_4_1
  where build='PRE_FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_1_2026_08_03'
);

create or replace function public.be_financial_v2_township_key_v61_4_1(p_value text)
returns text
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $normalize$
declare
  v text;
begin
  v := lower(btrim(coalesce(p_value,'')));
  v := regexp_replace(v, '[[:punct:]]+', ' ', 'g');
  v := regexp_replace(v, '[[:space:]]+', ' ', 'g');
  v := regexp_replace(v, '[[:space:]]+(township|tsp)[[:space:]]*$', '', 'i');
  v := regexp_replace(v, '[[:space:]]*မြို့နယ်[[:space:]]*$', '', 'g');
  v := btrim(v);

  -- Prefer stable township codes when a code is supplied.
  if v = 'mmr013019' then return 'north dagon'; end if;
  if v = 'mmr013018' then return 'south dagon'; end if;
  if v = 'mmr013020' then return 'east dagon'; end if;
  if v = 'mmr013021' then return 'dagon seikkan'; end if;

  -- Token-based Dagon Myothit matching covers Myothit, Myo Thit, New City,
  -- legacy North Dagon wording, punctuation and parenthesized variants.
  if (v ~ '(^| )dagon( |$)' and v ~ '(^| )north( |$)')
     or (position('ဒဂုံ' in v) > 0 and position('မြောက်' in v) > 0) then
    return 'north dagon';
  end if;
  if (v ~ '(^| )dagon( |$)' and v ~ '(^| )south( |$)')
     or (position('ဒဂုံ' in v) > 0 and position('တောင်' in v) > 0) then
    return 'south dagon';
  end if;
  if (v ~ '(^| )dagon( |$)' and v ~ '(^| )east( |$)')
     or (position('ဒဂုံ' in v) > 0 and position('အရှေ့' in v) > 0) then
    return 'east dagon';
  end if;
  if (v ~ '(^| )dagon( |$)' and (v ~ '(^| )seikkan( |$)' or v ~ '(^| )port( |$)'))
     or (position('ဒဂုံ' in v) > 0 and position('ဆိပ်ကမ်း' in v) > 0) then
    return 'dagon seikkan';
  end if;

  v := case
    when v in ('hlaingtharya east','hlaing tharyar east','hlaing thar yar east') then 'hlaing tharyar east'
    when v in ('hlaingtharya west','hlaing tharyar west','hlaing thar yar west') then 'hlaing tharyar west'
    when v in ('kamaryut','kamayut') then 'kamayut'
    when v in ('mayangone','mayangon') then 'mayangon'
    when v in ('mingalartaungnyunt','mingalar taung nyunt','mingala taung nyunt') then 'mingalar taung nyunt'
    when v in ('shwepyithar','shwe pyi thar') then 'shwe pyi thar'
    when v in ('seikgyikanaungto','seikgyi kanaungto','seik gyi kanaung to') then 'seikgyi kanaungto'
    when v in ('botataung','botahtaung') then 'botahtaung'
    when v in ('kyimyindaing','kyeemyindaing') then 'kyeemyindaing'
    when v in ('pazuntaung','pazundaung') then 'pazundaung'
    else v
  end;

  return v;
end
$normalize$;

comment on function public.be_financial_v2_township_key_v61_4_1(text)
is 'V61.4.1 canonical township resolver. Supports township codes, Myothit/Myo Thit/New City spellings, English/Myanmar Dagon directional aliases, punctuation and Township/Tsp suffixes without changing tariff amounts.';

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
    'calculation_version', 'PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_4_1',
    'resolved_tariff_township', v_tariff.township,
    'resolved_township_key', public.be_financial_v2_township_key_v61_4_1(p_township),
    'calculated_at', now()
  );
end
$function$;

comment on function public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)
is 'V61.4.1: V61.3.3 pass-through financial rules preserved; approved township aliases resolve to one active same-tier tariff shape. No tariff amount is invented or changed.';

do $self_test$
declare
  v_standard jsonb;
  v_alias jsonb;
  v_variant jsonb;
  v_code jsonb;
  v_mm jsonb;
  v_tier text;
  v_tier_result jsonb;
begin
  v_standard := public.be_calculate_parcel_financial_v2(
    'Dagon Myothit (North)','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    50000,6000,null,0,0,0,0,0,10,0
  );
  v_alias := public.be_calculate_parcel_financial_v2(
    'North Dagon','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    50000,6000,null,0,0,0,0,0,10,0
  );
  v_variant := public.be_calculate_parcel_financial_v2(
    'Dagon Myo Thit (North)','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    50000,6000,null,0,0,0,0,0,10,0
  );
  v_code := public.be_calculate_parcel_financial_v2(
    'MMR013019','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    50000,6000,null,0,0,0,0,0,10,0
  );
  v_mm := public.be_calculate_parcel_financial_v2(
    'ဒဂုံမြို့သစ် (မြောက်ပိုင်း)','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    50000,6000,null,0,0,0,0,0,10,0
  );

  if v_standard->>'validation_status' <> 'OK' then
    raise exception 'ABORT: Dagon Myothit (North) STANDARD calculation failed: %',v_standard;
  end if;
  if v_alias->>'validation_status' <> 'OK'
     or v_variant->>'validation_status' <> 'OK'
     or v_code->>'validation_status' <> 'OK'
     or v_mm->>'validation_status' <> 'OK' then
    raise exception 'ABORT: one or more North Dagon aliases failed. North=% MyoThit=% Code=% Myanmar=%',
      v_alias,v_variant,v_code,v_mm;
  end if;
  if (v_standard->>'weight_surcharge')::bigint <> 3500
     or (v_standard->>'extra_kg')::numeric <> 7
     or (v_standard->>'cod_amount')::bigint <> 59500 then
    raise exception 'ABORT: required STANDARD 10kg calculation is incorrect: %',v_standard;
  end if;
  if (v_standard->>'base_tariff')::bigint <= 0
     or (v_standard->>'net_system_delivery_charge')::bigint
        <> (v_standard->>'base_tariff')::bigint + 3500 then
    raise exception 'ABORT: Britium entitlement is not base tariff plus 3,500 surcharge: %',v_standard;
  end if;
  if exists (
    select 1
    from (values (v_alias),(v_variant),(v_code),(v_mm)) as a(result)
    where result->>'base_tariff' is distinct from v_standard->>'base_tariff'
       or result->>'included_kg' is distinct from v_standard->>'included_kg'
       or result->>'extra_per_kg' is distinct from v_standard->>'extra_per_kg'
  ) then
    raise exception 'ABORT: North Dagon aliases do not resolve to one tariff shape.';
  end if;

  foreach v_tier in array array['STANDARD','ROYAL','COMMITMENT'] loop
    v_tier_result := public.be_calculate_parcel_financial_v2(
      'Dagon Myothit (North)',v_tier,'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
      50000,6000,null,0,0,0,0,0,10,0
    );
    if v_tier_result->>'validation_status' <> 'OK' then
      raise exception 'ABORT: tier % did not resolve for Dagon Myothit (North): %',v_tier,v_tier_result;
    end if;
  end loop;

  if coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'') <> 'MUTATION_SHADOW' then
    raise exception 'ABORT: mutation mode changed.';
  end if;
end
$self_test$;

insert into public.be_audit_events(action,resource_type,resource_id,details,created_at)
select
  'FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_1',
  'function',
  'be_calculate_parcel_financial_v2',
  jsonb_build_object(
    'build','FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_1_2026_08_03',
    'historical_rows_changed',false,
    'tariff_rows_changed',false,
    'financial_writes_enabled',false,
    'mutation_mode','MUTATION_SHADOW',
    'north_dagon_aliases',jsonb_build_array('Dagon Myothit (North)','Dagon Myo Thit (North)','North Dagon','MMR013019','ဒဂုံမြို့သစ် (မြောက်ပိုင်း)')
  ),
  now()
where to_regclass('public.be_audit_events') is not null
  and not exists (
    select 1 from public.be_audit_events
    where action='FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_1'
      and resource_id='be_calculate_parcel_financial_v2'
  );

commit;

select jsonb_pretty(jsonb_build_object(
  'ok',true,
  'build','FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_1_2026_08_03',
  'next_gate','INSTALL_BUILD_AND_DEPLOY_DATA_ENTRY_CLEAN_REVIEW_V61_4_1_FRONTEND',
  'north_dagon_standard_result',public.be_calculate_parcel_financial_v2(
    'Dagon Myothit (North)','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    50000,6000,null,0,0,0,0,0,10,0
  ),
  'aliases_resolve_same_tariff',true,
  'registered_and_unregistered_tier_logic_preserved',true,
  'tariff_rows_changed',false,
  'historical_rows_changed',false,
  'mutation_mode',(select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),
  'financial_writes_enabled',false
));
