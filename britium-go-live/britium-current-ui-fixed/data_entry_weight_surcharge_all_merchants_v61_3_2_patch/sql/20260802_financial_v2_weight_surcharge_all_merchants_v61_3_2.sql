-- Britium Express Financial V2 V61.3.2
-- Paste the CONTENTS of this file into Supabase SQL Editor. Do not paste the file path.
-- Scope:
--   * Preserve the V61.3 receiver-COD weight/CBM/other-surcharge pass-through rule.
--   * Apply tariff calculation to registered and truly unregistered merchants.
--   * Registered active profile: backend profile tier overrides client input.
--   * Truly unregistered merchant: Data Entry selects STANDARD, ROYAL, or COMMITMENT.
--   * Existing inactive/expired/blocked profile: remains blocked and is not treated as unregistered.
--   * Financial V2 remains MUTATION_SHADOW; no historical business row is changed.

rollback;
begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

drop table if exists pg_temp.be_v61_3_2_state;
create temporary table pg_temp.be_v61_3_2_state (
  singleton boolean primary key default true,
  core_before_md5 text,
  schema_before_md5 text,
  wrapper_before_md5 text,
  core_after_md5 text,
  schema_after_md5 text,
  wrapper_after_md5 text,
  mutation_mode text,
  standard_result jsonb,
  royal_result jsonb,
  commitment_result jsonb,
  unregistered_result jsonb,
  tariff_rows_repaired integer default 0,
  tariff_resolution_mode text default 'EXISTING_OR_CONTROLLED_4500_BAND_REPAIR'
) on commit preserve rows;

insert into pg_temp.be_v61_3_2_state(singleton,core_before_md5,schema_before_md5,wrapper_before_md5,mutation_mode)
select true,
  md5(pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure)),
  md5(pg_get_functiondef('public.be_data_entry_financial_v2_schema()'::regprocedure)),
  md5(pg_get_functiondef('public.be_data_entry_financial_v2_calculate(jsonb)'::regprocedure)),
  coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'MUTATION_SHADOW');

do $guard$
declare
  v_mode text;
  v_core text;
begin
  if to_regprocedure('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)') is null
     or to_regprocedure('public.be_data_entry_financial_v2_schema()') is null
     or to_regprocedure('public.be_data_entry_financial_v2_calculate(jsonb)') is null then
    raise exception 'ABORT: required Financial V2 functions are missing.';
  end if;
  select mutation_mode into v_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton;
  if coalesce(v_mode,'MUTATION_SHADOW') <> 'MUTATION_SHADOW' then
    raise exception 'ABORT: Financial V2 mutation mode is %, expected MUTATION_SHADOW.',v_mode;
  end if;
  select pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure) into v_core;
  if v_core not like '%PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3%'
     and (v_core not like '%v_effective := p_delivery_charges;%'
       or v_core not like '%v_cod := coalesce(p_item_price,0) + coalesce(p_delivery_charges,0) + coalesce(p_additional_customer_charge,0);%') then
    raise exception 'ABORT: the current core function is not an approved V58/V61.3 baseline.';
  end if;
end
$guard$;

-- Normalize only harmless township suffix/spacing differences. This does not authorize fuzzy tariff matching.
create or replace function public.be_financial_v2_township_key_v61_3_2(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $normalize$
  select lower(
    regexp_replace(
      regexp_replace(
        btrim(coalesce(p_value,'')),
        '[[:space:]]+(township|tsp[.]?)[[:space:]]*$',
        '',
        'i'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  )
$normalize$;

comment on function public.be_financial_v2_township_key_v61_3_2(text)
is 'V61.3.2 deterministic township-key normalization: trims spacing and Township/Tsp suffix only.';

-- Persist a narrow backup only for exact Insein tariff rows touched by this migration.
create table if not exists public.backup_be_parcel_tariffs_v61_3_2_20260802
as
select t.*, now()::timestamptz as backed_up_at, null::text as backup_reason
from public.be_parcel_tariffs_v2 t
where false;

insert into public.backup_be_parcel_tariffs_v61_3_2_20260802(
  id,township,customer_tier,tariff_zone,tariff_zone_code,base_tariff,included_kg,
  extra_per_kg,commitment_min_ways,commitment_refund_per_way,note,status,
  effective_from,effective_to,created_at,updated_at,backed_up_at,backup_reason
)
select
  t.id,t.township,t.customer_tier,t.tariff_zone,t.tariff_zone_code,t.base_tariff,t.included_kg,
  t.extra_per_kg,t.commitment_min_ways,t.commitment_refund_per_way,t.note,t.status,
  t.effective_from,t.effective_to,t.created_at,t.updated_at,now(),'PRE_V61_3_2_INSEIN_TARIFF_REPAIR'
from public.be_parcel_tariffs_v2 t
where public.be_financial_v2_township_key_v61_3_2(t.township)='insein'
  and not exists(
    select 1 from public.backup_be_parcel_tariffs_v61_3_2_20260802 b where b.id=t.id
  );

-- Controlled tariff repair:
-- * Reuse an existing active Insein alias when present.
-- * Otherwise create exact Insein rows by copying the active tier-specific 4,500-MMK band.
-- * STANDARD must remain 4,500 base / 3 kg included / 500 per extra kg.
-- * ROYAL and COMMITMENT copy their own active tier parameters; no cross-tier fallback is allowed.
do $tariff_repair$
declare
  v_tier text;
  v_existing_count integer;
  v_peer_count integer;
  v_shape_count integer;
  v_template public.be_parcel_tariffs_v2%rowtype;
  v_repaired integer := 0;
begin
  foreach v_tier in array array['STANDARD','ROYAL','COMMITMENT'] loop
    select count(*) into v_existing_count
    from public.be_parcel_tariffs_v2 t
    where public.be_financial_v2_township_key_v61_3_2(t.township)='insein'
      and t.customer_tier=v_tier
      and t.status='ACTIVE'
      and t.effective_from <= public.be_business_date()
      and (t.effective_to is null or t.effective_to >= public.be_business_date());

    if v_existing_count > 1 then
      raise exception 'ABORT: ambiguous active Insein tariff aliases for tier % (% rows).',v_tier,v_existing_count;
    elsif v_existing_count = 1 then
      continue;
    end if;

    -- Prefer known Yangon 4,500-MMK peer townships from the approved township reference.
    select count(*) into v_peer_count
    from public.be_parcel_tariffs_v2 t
    where t.customer_tier=v_tier
      and t.status='ACTIVE'
      and t.effective_from <= public.be_business_date()
      and (t.effective_to is null or t.effective_to >= public.be_business_date())
      and t.base_tariff=4500
      and public.be_financial_v2_township_key_v61_3_2(t.township) in (
        'mingaladon','shwepyithar','hlaingtharya (east)','hlaingtharya (west)',
        'hlaing thar yar (east)','hlaing thar yar (west)'
      );

    if v_peer_count > 0 then
      select count(distinct (t.base_tariff,t.included_kg,t.extra_per_kg,t.commitment_min_ways,t.commitment_refund_per_way))
      into v_shape_count
      from public.be_parcel_tariffs_v2 t
      where t.customer_tier=v_tier
        and t.status='ACTIVE'
        and t.effective_from <= public.be_business_date()
        and (t.effective_to is null or t.effective_to >= public.be_business_date())
        and t.base_tariff=4500
        and public.be_financial_v2_township_key_v61_3_2(t.township) in (
          'mingaladon','shwepyithar','hlaingtharya (east)','hlaingtharya (west)',
          'hlaing thar yar (east)','hlaing thar yar (west)'
        );

      if v_shape_count <> 1 then
        raise exception 'ABORT: known Yangon 4,500-MMK peers have % financial shapes for tier %. No tariff was guessed.',v_shape_count,v_tier;
      end if;

      select * into v_template
      from public.be_parcel_tariffs_v2 t
      where t.customer_tier=v_tier
        and t.status='ACTIVE'
        and t.effective_from <= public.be_business_date()
        and (t.effective_to is null or t.effective_to >= public.be_business_date())
        and t.base_tariff=4500
        and public.be_financial_v2_township_key_v61_3_2(t.township) in (
          'mingaladon','shwepyithar','hlaingtharya (east)','hlaingtharya (west)',
          'hlaing thar yar (east)','hlaing thar yar (west)'
        )
      order by
        case public.be_financial_v2_township_key_v61_3_2(t.township)
          when 'mingaladon' then 1 when 'shwepyithar' then 2
          when 'hlaingtharya (east)' then 3 when 'hlaingtharya (west)' then 4
          else 9 end,
        t.effective_from desc,t.id
      limit 1;
    else
      -- Fallback is allowed only when every active 4,500-MMK row in the tier has one financial shape.
      select count(distinct (t.base_tariff,t.included_kg,t.extra_per_kg,t.commitment_min_ways,t.commitment_refund_per_way))
      into v_shape_count
      from public.be_parcel_tariffs_v2 t
      where t.customer_tier=v_tier
        and t.status='ACTIVE'
        and t.effective_from <= public.be_business_date()
        and (t.effective_to is null or t.effective_to >= public.be_business_date())
        and t.base_tariff=4500;

      if v_shape_count <> 1 then
        raise exception 'ABORT: no safe unique 4,500-MMK tariff template exists for tier % (financial shapes=%). No tariff was guessed.',v_tier,v_shape_count;
      end if;

      select * into v_template
      from public.be_parcel_tariffs_v2 t
      where t.customer_tier=v_tier
        and t.status='ACTIVE'
        and t.effective_from <= public.be_business_date()
        and (t.effective_to is null or t.effective_to >= public.be_business_date())
        and t.base_tariff=4500
      order by t.effective_from desc,t.id
      limit 1;
    end if;

    if not found then
      raise exception 'ABORT: active 4,500-MMK tariff template is missing for tier %. No tariff was guessed.',v_tier;
    end if;

    if v_tier='STANDARD' and (
      v_template.base_tariff<>4500 or v_template.included_kg<>3 or v_template.extra_per_kg<>500
    ) then
      raise exception 'ABORT: STANDARD 4,500-MMK template conflicts with confirmed rule. base=%, included_kg=%, extra_per_kg=%.',
        v_template.base_tariff,v_template.included_kg,v_template.extra_per_kg;
    end if;

    insert into public.be_parcel_tariffs_v2(
      township,customer_tier,tariff_zone,tariff_zone_code,base_tariff,included_kg,
      extra_per_kg,commitment_min_ways,commitment_refund_per_way,note,status,
      effective_from,effective_to,created_at,updated_at
    ) values (
      'Insein',v_tier,v_template.tariff_zone,v_template.tariff_zone_code,4500,
      v_template.included_kg,v_template.extra_per_kg,v_template.commitment_min_ways,
      v_template.commitment_refund_per_way,
      concat_ws(' | ',nullif(v_template.note,''),'V61.3.2 controlled Insein tariff repair copied from active tier-specific 4,500-MMK band'),
      'ACTIVE',public.be_business_date(),null,now(),now()
    )
    on conflict (township,customer_tier,effective_from) do update set
      tariff_zone=excluded.tariff_zone,
      tariff_zone_code=excluded.tariff_zone_code,
      base_tariff=excluded.base_tariff,
      included_kg=excluded.included_kg,
      extra_per_kg=excluded.extra_per_kg,
      commitment_min_ways=excluded.commitment_min_ways,
      commitment_refund_per_way=excluded.commitment_refund_per_way,
      note=excluded.note,
      status='ACTIVE',
      effective_to=null,
      updated_at=now();

    v_repaired := v_repaired + 1;
  end loop;

  update pg_temp.be_v61_3_2_state
  set tariff_rows_repaired=v_repaired
  where singleton;
end
$tariff_repair$;

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
  where public.be_financial_v2_township_key_v61_3_2(t.township) = public.be_financial_v2_township_key_v61_3_2(p_township)
    and t.customer_tier = v_tier
    and t.status = 'ACTIVE'
    and t.effective_from <= public.be_business_date()
    and (t.effective_to is null or t.effective_to >= public.be_business_date())
  order by t.effective_from desc
  limit 1;

  if not found then
    v_messages := array_append(v_messages, 'No unambiguous active tariff exists for township and customer tier.');
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
    'calculation_version', 'PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3_2',
    'calculated_at', now()
  );
end
$function$;

comment on function public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)
is 'V61.3.2: tier-specific STANDARD/ROYAL/COMMITMENT tariff calculation for registered and truly unregistered merchants; receiver COD includes customer-paid weight/CBM/other delivery surcharges for item+delivery and delivery-only types.';

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
      jsonb_build_object('name','township','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input; deterministic normalized township tariff lookup'),
      jsonb_build_object('name','delivery_address','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input'),
      jsonb_build_object('name','item_price','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input by amount-entry type'),
      jsonb_build_object('name','delivery_charges','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','merchant-declared delivery charge'),
      jsonb_build_object('name','cod_amount','section','Collection Instructions','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend amount-entry calculation'),
      jsonb_build_object('name','weight_kg','section','Weight & Tariff','ownership','INPUT','editable',true,'data_type','numeric','required',true,'source','client input'),
      jsonb_build_object('name','created_at','section','Audit Information','ownership','SERVER','editable',false,'data_type','timestamptz','required',false,'source','database timestamp'),
      jsonb_build_object('name','updated_at','section','Audit Information','ownership','SERVER','editable',false,'data_type','timestamptz','required',false,'source','database timestamp'),
      jsonb_build_object('name','environment','section','Parcel Identity','ownership','SERVER','editable',false,'data_type','text','required',true,'source','PRODUCTION'),
      jsonb_build_object('name','customer_tier','section','Weight & Tariff','ownership','INPUT','editable',true,'data_type','text','required',true,'source','registered merchant: active approved profile overrides; truly unregistered merchant: operator selects STANDARD, ROYAL, or COMMITMENT'),
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
    'build', 'DATA_ENTRY_FINANCIAL_V2_ALL_MERCHANTS_V61_3_2_2026_08_02',
    'generated_at', now(),
    'data', jsonb_build_object(
      'schema_version', 'FINANCIAL_V2_SCHEMA_V61_3_2_2026_08_02',
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
  v_profile_found boolean := false;
  v_any_profile_exists boolean := false;
  v_requested_tier text := upper(nullif(btrim(coalesce(p_payload ->> 'customer_tier','')),''));
  v_resolved_tier text;
  v_tier_source text;
  v_registration_status text;
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
      'build', 'DATA_ENTRY_FINANCIAL_V2_ALL_MERCHANTS_V61_3_2_2026_08_02',
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

  v_profile_found := found;

  if v_profile_found then
    v_resolved_tier := upper(btrim(coalesce(v_profile.customer_tier,'')));
    if v_resolved_tier not in ('STANDARD','ROYAL','COMMITMENT') then
      return jsonb_build_object(
        'ok', false,
        'build', 'DATA_ENTRY_FINANCIAL_V2_ALL_MERCHANTS_V61_3_2_2026_08_02',
        'generated_at', now(),
        'errors', jsonb_build_array(jsonb_build_object(
          'code','INVALID_REGISTERED_MERCHANT_TIER',
          'field','customer_tier',
          'message','The active merchant profile does not contain STANDARD, ROYAL, or COMMITMENT.'
        )),
        'data', jsonb_build_object('merchant_id',v_merchant_id),
        'access', v_access
      );
    end if;
    v_tier_source := 'ACTIVE_APPROVED_MERCHANT_PROFILE';
    v_registration_status := 'REGISTERED_ACTIVE_PROFILE';
  else
    select exists(
      select 1
      from public.be_merchant_financial_profiles_v2 m
      where upper(btrim(m.merchant_id)) = v_merchant_id
    ) into v_any_profile_exists;

    if v_any_profile_exists then
      return jsonb_build_object(
        'ok', false,
        'build', 'DATA_ENTRY_FINANCIAL_V2_ALL_MERCHANTS_V61_3_2_2026_08_02',
        'generated_at', now(),
        'errors', jsonb_build_array(jsonb_build_object(
          'code','MERCHANT_PROFILE_INACTIVE_OR_BLOCKED',
          'field','merchant_id',
          'message','This merchant has a Financial V2 profile but it is inactive, expired, or blocked. It is not treated as unregistered.'
        )),
        'data', jsonb_build_object('merchant_id',v_merchant_id),
        'access', v_access
      );
    end if;

    if v_requested_tier not in ('STANDARD','ROYAL','COMMITMENT') then
      return jsonb_build_object(
        'ok', false,
        'build', 'DATA_ENTRY_FINANCIAL_V2_ALL_MERCHANTS_V61_3_2_2026_08_02',
        'generated_at', now(),
        'errors', jsonb_build_array(jsonb_build_object(
          'code','UNREGISTERED_MERCHANT_TIER_REQUIRED',
          'field','customer_tier',
          'message','For a truly unregistered merchant, select STANDARD, ROYAL, or COMMITMENT before calculation.'
        )),
        'data', jsonb_build_object('merchant_id',v_merchant_id),
        'access', v_access
      );
    end if;

    v_resolved_tier := v_requested_tier;
    v_tier_source := 'UNREGISTERED_MERCHANT_OPERATOR_SELECTION';
    v_registration_status := 'UNREGISTERED';
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
  where upper(btrim(coalesce(p.merchant_id::text,''))) = v_merchant_id
    and date_trunc('month', coalesce(p.created_at,now()) at time zone 'Asia/Yangon')
        = date_trunc('month', public.be_business_date()::timestamp)
    and upper(coalesce(p.status,'')) not in ('CANCELLED','FAILED');

  v_quote := public.be_calculate_parcel_financial_v2(
    v_township,
    v_resolved_tier,
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
    'customer_tier', v_resolved_tier,
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
    'build', 'DATA_ENTRY_FINANCIAL_V2_ALL_MERCHANTS_V61_3_2_2026_08_02',
    'generated_at', now(),
    'data', v_row,
    'warnings',
      (case when v_quote ->> 'validation_status' = 'REVIEW'
        then jsonb_build_array(jsonb_build_object(
          'code','FINANCIAL_REVIEW_REQUIRED','message',v_quote ->> 'validation_message'
        )) else '[]'::jsonb end)
      ||
      (case when not v_profile_found
        then jsonb_build_array(jsonb_build_object(
          'code','UNREGISTERED_MERCHANT_TIER_USED',
          'message','The merchant has no Financial V2 profile. The selected STANDARD, ROYAL, or COMMITMENT tier was used for this calculation.'
        )) else '[]'::jsonb end),
    'errors', case when v_quote ->> 'validation_status' = 'ERROR'
      then jsonb_build_array(jsonb_build_object(
        'code','FINANCIAL_VALIDATION_ERROR','message',v_quote ->> 'validation_message'
      )) else '[]'::jsonb end,
    'server_resolution', jsonb_build_object(
      'merchant_registration_status',v_registration_status,
      'customer_tier_source',v_tier_source,
      'resolved_customer_tier',v_resolved_tier,
      'backend_monthly_ways',v_monthly,
      'client_customer_tier_ignored',v_profile_found and (v_payload ? 'customer_tier'),
      'client_customer_tier_used',not v_profile_found,
      'inactive_or_blocked_profile_preserved',true,
      'calculation_source','be_calculate_parcel_financial_v2'
    ),
    'access', v_access
  );
end
$function$;

revoke all on function public.be_data_entry_financial_v2_schema() from public, anon;
revoke all on function public.be_data_entry_financial_v2_calculate(jsonb) from public, anon;
grant execute on function public.be_data_entry_financial_v2_schema() to authenticated, service_role;
grant execute on function public.be_data_entry_financial_v2_calculate(jsonb) to authenticated, service_role;

do $verify$
declare
  v_tier text;
  v_tariff public.be_parcel_tariffs_v2%rowtype;
  v_result jsonb;
  v_expected_extra numeric;
  v_expected_weight bigint;
  v_expected_surcharges bigint;
  v_expected_gross bigint;
  v_expected_refund bigint;
  v_expected_net bigint;
  v_expected_cod bigint;
  v_expected_difference bigint;
  v_expected_merchant bigint;
  v_schema jsonb;
  v_unregistered jsonb;
  v_core_def text;
  v_schema_def text;
  v_wrapper_def text;
begin
  foreach v_tier in array array['STANDARD','ROYAL','COMMITMENT'] loop
    select * into v_tariff
    from public.be_parcel_tariffs_v2 t
    where public.be_financial_v2_township_key_v61_3_2(t.township)='insein'
      and t.customer_tier=v_tier
      and t.status='ACTIVE'
      and t.effective_from <= public.be_business_date()
      and (t.effective_to is null or t.effective_to >= public.be_business_date())
    order by t.effective_from desc
    limit 1;
    if not found then raise exception 'ABORT: controlled Insein tariff resolution failed for tier % after deterministic alias/repair checks.',v_tier; end if;

    v_result := public.be_calculate_parcel_financial_v2(
      'Insein',v_tier,'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
      50000,6000,56000,0,0,0,0,0,10,0
    );
    v_expected_extra := greatest(0::numeric,ceil(10::numeric)-coalesce(v_tariff.included_kg,0));
    v_expected_weight := ceil(v_expected_extra*coalesce(v_tariff.extra_per_kg,0))::bigint;
    v_expected_surcharges := v_expected_weight;
    v_expected_gross := coalesce(v_tariff.base_tariff,0)+v_expected_surcharges;
    v_expected_refund := case when v_tier='COMMITMENT' and 0>=coalesce(v_tariff.commitment_min_ways,0) then coalesce(v_tariff.commitment_refund_per_way,0) else 0 end;
    v_expected_net := greatest(0::bigint,v_expected_gross-v_expected_refund);
    v_expected_cod := 50000+6000+v_expected_surcharges;
    v_expected_difference := 6000+v_expected_surcharges-v_expected_net;
    v_expected_merchant := 50000+v_expected_difference;

    if v_result->>'validation_status' <> 'OK'
       or (v_result->>'base_tariff')::bigint <> v_tariff.base_tariff
       or (v_result->>'weight_surcharge')::bigint <> v_expected_weight
       or (v_result->>'cod_amount')::bigint <> v_expected_cod
       or (v_result->>'net_system_delivery_charge')::bigint <> v_expected_net
       or (v_result->>'merchant_final_settlement_amount')::bigint <> v_expected_merchant
       or v_result->>'calculation_version' <> 'PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3_2' then
      raise exception 'ABORT: tier % verification failed: %',v_tier,v_result;
    end if;

    if v_tier='STANDARD' then update pg_temp.be_v61_3_2_state set standard_result=v_result where singleton;
    elsif v_tier='ROYAL' then update pg_temp.be_v61_3_2_state set royal_result=v_result where singleton;
    else update pg_temp.be_v61_3_2_state set commitment_result=v_result where singleton;
    end if;
  end loop;

  v_schema := public.be_data_entry_financial_v2_schema();
  if (v_schema #>> '{data,field_count}')::integer <> 50
     or not exists (
       select 1 from jsonb_array_elements(v_schema #> '{data,fields}') f
       where f->>'name'='customer_tier'
         and (f->>'editable')::boolean
         and f->>'ownership'='INPUT'
     ) then
    raise exception 'ABORT: schema does not expose the controlled customer-tier selector.';
  end if;

  perform set_config('request.jwt.claim.role','service_role',true);
  if exists(select 1 from public.be_merchant_financial_profiles_v2 where upper(btrim(merchant_id))='UNREGISTERED_V61_3_2_TEST') then
    raise exception 'ABORT: reserved unregistered test merchant ID already exists.';
  end if;
  v_unregistered := public.be_data_entry_financial_v2_calculate(jsonb_build_object(
    'merchant_id','UNREGISTERED_V61_3_2_TEST',
    'customer_tier','STANDARD',
    'township','Insein',
    'amount_entry_type','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    'item_price',50000,
    'delivery_charges',6000,
    'merchant_stated_total_amount',56000,
    'additional_customer_charge',0,
    'cbm_surcharge',0,
    'other_surcharge',0,
    'merchant_payable_charges',0,
    'other_merchant_credits',0,
    'weight_kg',10
  ));
  if not coalesce((v_unregistered->>'ok')::boolean,false)
     or v_unregistered #>> '{data,customer_tier}' <> 'STANDARD'
     or v_unregistered #>> '{server_resolution,merchant_registration_status}' <> 'UNREGISTERED'
     or v_unregistered #>> '{server_resolution,customer_tier_source}' <> 'UNREGISTERED_MERCHANT_OPERATOR_SELECTION' then
    raise exception 'ABORT: unregistered merchant calculation failed: %',v_unregistered;
  end if;
  update pg_temp.be_v61_3_2_state set unregistered_result=v_unregistered where singleton;

  select pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure),
         pg_get_functiondef('public.be_data_entry_financial_v2_schema()'::regprocedure),
         pg_get_functiondef('public.be_data_entry_financial_v2_calculate(jsonb)'::regprocedure)
    into v_core_def,v_schema_def,v_wrapper_def;
  if v_core_def not like '%PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3_2%'
     or v_schema_def not like '%FINANCIAL_V2_SCHEMA_V61_3_2_2026_08_02%'
     or v_wrapper_def not like '%UNREGISTERED_MERCHANT_OPERATOR_SELECTION%'
     or v_wrapper_def not like '%MERCHANT_PROFILE_INACTIVE_OR_BLOCKED%'
     or v_core_def not like '%be_financial_v2_township_key_v61_3_2%' then
    raise exception 'ABORT: deployed source markers are incomplete.';
  end if;
  update pg_temp.be_v61_3_2_state
  set core_after_md5=md5(v_core_def),schema_after_md5=md5(v_schema_def),wrapper_after_md5=md5(v_wrapper_def)
  where singleton;
end
$verify$;

insert into public.be_audit_events(
  actor_id,actor_email,actor_role,action,resource_type,resource_id,
  details,upload_code,event_type,entity_type,entity_id,payload
)
select auth.uid(),null,current_user,
  'FINANCIAL_V2_ALL_MERCHANT_TIER_SUPPORT_DEPLOYED','FUNCTION_SET','FINANCIAL_V2_V61_3_2',
  jsonb_build_object(
    'request_id','FINANCIAL-V2-ALL-MERCHANTS-V61-3-2-20260802',
    'registered_rule','Active approved profile tier overrides client input.',
    'unregistered_rule','Truly unregistered merchant requires operator selection of STANDARD, ROYAL, or COMMITMENT.',
    'blocked_rule','Existing inactive, expired, or blocked profile remains blocked.',
    'tariff_repair_rule','Insein resolves by deterministic suffix normalization or a controlled tier-specific 4,500-MMK band copy; no cross-tier fallback.',
    'surcharge_rule','Receiver COD and Britium entitlement both include customer-paid weight/CBM/other delivery surcharges for item+delivery and delivery-only types.',
    'mutation_mode','MUTATION_SHADOW','production_writes_enabled',false
  ),
  'FINANCIAL-V2-ALL-MERCHANTS-V61-3-2-20260802','FINANCIAL_V2_CONTROL','FUNCTION_SET','FINANCIAL_V2_V61_3_2',
  jsonb_build_object(
    'build','FINANCIAL_V2_ALL_MERCHANTS_V61_3_2_2026_08_02',
    'core_before_md5',(select core_before_md5 from pg_temp.be_v61_3_2_state where singleton),
    'core_after_md5',(select core_after_md5 from pg_temp.be_v61_3_2_state where singleton),
    'schema_before_md5',(select schema_before_md5 from pg_temp.be_v61_3_2_state where singleton),
    'schema_after_md5',(select schema_after_md5 from pg_temp.be_v61_3_2_state where singleton),
    'wrapper_before_md5',(select wrapper_before_md5 from pg_temp.be_v61_3_2_state where singleton),
    'wrapper_after_md5',(select wrapper_after_md5 from pg_temp.be_v61_3_2_state where singleton),
    'tariff_rows_repaired',(select tariff_rows_repaired from pg_temp.be_v61_3_2_state where singleton),
    'historical_rows_changed',false,'financial_v2_mutation_mode_changed',false
  )
where not exists(
  select 1 from public.be_audit_events a
  where a.upload_code='FINANCIAL-V2-ALL-MERCHANTS-V61-3-2-20260802'
     or a.details->>'request_id'='FINANCIAL-V2-ALL-MERCHANTS-V61-3-2-20260802'
);

commit;

select jsonb_pretty(jsonb_build_object(
  'ok',true,
  'build','FINANCIAL_V2_ALL_MERCHANTS_V61_3_2_2026_08_02',
  'calculation_version','PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3_2',
  'registered_merchants_supported',true,
  'unregistered_merchants_supported',true,
  'allowed_tiers',jsonb_build_array('STANDARD','ROYAL','COMMITMENT'),
  'inactive_or_blocked_profiles_preserved',true,
  'insein_tariff_tiers_active',(select count(distinct customer_tier) from public.be_parcel_tariffs_v2 t where public.be_financial_v2_township_key_v61_3_2(t.township)='insein' and t.status='ACTIVE' and t.effective_from<=public.be_business_date() and (t.effective_to is null or t.effective_to>=public.be_business_date())),
  'tariff_rows_repaired',(select tariff_rows_repaired from pg_temp.be_v61_3_2_state where singleton),
  'standard_result',(select standard_result from pg_temp.be_v61_3_2_state where singleton),
  'royal_result',(select royal_result from pg_temp.be_v61_3_2_state where singleton),
  'commitment_result',(select commitment_result from pg_temp.be_v61_3_2_state where singleton),
  'unregistered_result',(select unregistered_result from pg_temp.be_v61_3_2_state where singleton),
  'mutation_mode',(select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),
  'financial_writes_enabled',false,
  'historical_rows_changed',false,
  'next_gate','RUN_V61_3_2_SQL_VERIFIER_THEN_INSTALL_BUILD_AND_DEPLOY_FRONTEND'
));
