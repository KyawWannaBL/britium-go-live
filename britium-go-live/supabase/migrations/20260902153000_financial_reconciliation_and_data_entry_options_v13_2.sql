begin;

-- V13.2 corrects receiver-paid delivery math. The receiver pays the delivery
-- amount declared by the merchant plus backend-calculated surcharges. A tariff
-- shortfall is a merchant settlement deduction; it must never be silently
-- added to the receiver's COD.
alter function public.be_calculate_parcel_financial_v2(
  text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer
) rename to be_calculate_parcel_financial_v2_v61_9_0_legacy;

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
as $function$
declare
  v_quote jsonb;
  v_type text := upper(btrim(coalesce(p_amount_entry_type,'')));
  v_backend_surcharges bigint := 0;
  v_net bigint := 0;
  v_effective bigint := 0;
  v_cod bigint := 0;
  v_difference bigint := 0;
  v_merchant_final bigint := 0;
  v_direction text := 'NO_ADJUSTMENT';
begin
  v_quote := public.be_calculate_parcel_financial_v2_v61_9_0_legacy(
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
    v_backend_surcharges := coalesce(nullif(v_quote->>'backend_calculated_delivery_surcharges','')::bigint,0);
    v_net := coalesce(nullif(v_quote->>'net_system_delivery_charge','')::bigint,0);
    v_effective := coalesce(p_delivery_charges,0) + v_backend_surcharges;

    v_cod := case
      when v_type = 'DELIVERY_CHARGE_ONLY'
        then v_effective + coalesce(p_additional_customer_charge,0)
      else coalesce(p_item_price,0) + v_effective + coalesce(p_additional_customer_charge,0)
    end;

    v_difference := v_effective - v_net;
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
      'merchant_settlement_adjustment', v_difference,
      'settlement_direction', v_direction,
      'merchant_final_settlement_amount', v_merchant_final,
      'validation_message', 'Ready. Receiver delivery equals the merchant-declared delivery amount plus backend-calculated surcharges. Any tariff shortfall is deducted from merchant settlement.',
      'calculation_version', 'PARCEL_FINANCIAL_V2_RECEIVER_PAID_DECLARED_DELIVERY_V61_9_1',
      'calculated_at', now()
    );
  end if;

  return v_quote;
end
$function$;

revoke all on function public.be_calculate_parcel_financial_v2_v61_9_0_legacy(
  text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer
) from public, anon, authenticated;
grant execute on function public.be_calculate_parcel_financial_v2_v61_9_0_legacy(
  text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer
) to service_role;
revoke all on function public.be_calculate_parcel_financial_v2(
  text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer
) from public, anon;
grant execute on function public.be_calculate_parcel_financial_v2(
  text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer
) to authenticated, service_role;

comment on function public.be_calculate_parcel_financial_v2(
  text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer
) is 'Canonical V61.9.1 parcel finance calculation. Receiver delivery is declared delivery plus backend surcharges; tariff shortfall is recovered from merchant settlement.';

-- Retain the old Data Entry implementation as an internal compatibility layer,
-- then enforce the retired inputs and authorized per-parcel tier override at a
-- narrow wrapper boundary. The save RPC calls this canonical name as well.
alter function public.be_data_entry_financial_v2_calculate(jsonb)
rename to be_data_entry_financial_v2_calculate_v61_3_3_legacy;

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
  v_quote jsonb;
  v_resolution jsonb;
  v_update_access jsonb;
  v_type text := upper(nullif(btrim(coalesce(p_payload->>'amount_entry_type','')),''));
  v_requested_tier text := upper(nullif(btrim(coalesce(p_payload->>'customer_tier','')),''));
  v_provider_code text := upper(nullif(btrim(coalesce(p_payload->>'service_provider_code','')),''));
  v_override_requested boolean := lower(coalesce(p_payload->>'customer_tier_override','false')) in ('true','1','yes','on');
  v_registered boolean := false;
  v_monthly integer := 0;
  v_additional bigint := 0;
  v_ok boolean := false;
begin
  v_result := public.be_data_entry_financial_v2_calculate_v61_3_3_legacy(v_payload);
  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result;
  end if;

  if v_type = 'OPAQUE_COD_COLLECTION' then
    return v_result || jsonb_build_object(
      'ok',false,
      'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','OPAQUE_COD_RETIRED','field','amount_entry_type',
        'message','Unclassified COD collection is retired. Use Exact Collection Amount and enter the exact receiver total.'
      ))
    );
  end if;

  v_additional := coalesce(nullif(btrim(coalesce(p_payload->>'additional_customer_charge','')),'')::bigint,0);
  if v_additional <> 0 then
    return v_result || jsonb_build_object(
      'ok',false,
      'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','ADDITIONAL_CUSTOMER_CHARGE_RETIRED','field','additional_customer_charge',
        'message','Additional customer charge is retired for new Data Entry calculations and must be zero.'
      ))
    );
  end if;

  if v_provider_code is not null and not exists (
    select 1 from public.be_data_entry_service_providers p
    where p.provider_code=v_provider_code and p.is_active
  ) then
    return v_result || jsonb_build_object(
      'ok',false,
      'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','SERVICE_PROVIDER_INVALID','field','service_provider_code',
        'message','Select an active service provider.'
      ))
    );
  end if;

  v_resolution := coalesce(v_result->'server_resolution','{}'::jsonb);
  v_registered := coalesce(v_resolution->>'merchant_registration_status','')='REGISTERED_ACTIVE_PROFILE';
  v_monthly := coalesce(nullif(v_resolution->>'backend_monthly_ways','')::integer,0);

  if v_override_requested and v_registered then
    if v_requested_tier not in ('STANDARD','ROYAL','COMMITMENT') then
      return v_result || jsonb_build_object(
        'ok',false,
        'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
        'errors',jsonb_build_array(jsonb_build_object(
          'code','INVALID_TIER_OVERRIDE','field','customer_tier',
          'message','Tier override must be STANDARD, ROYAL, or COMMITMENT.'
        ))
      );
    end if;

    v_update_access := public.be_data_entry_require_access_v57('update',false);
    v_quote := public.be_calculate_parcel_financial_v2(
      nullif(btrim(v_payload->>'township'),''),
      v_requested_tier,
      v_type,
      nullif(btrim(v_payload->>'item_price'),'')::bigint,
      nullif(btrim(v_payload->>'delivery_charges'),'')::bigint,
      nullif(btrim(v_payload->>'merchant_stated_total_amount'),'')::bigint,
      0,
      coalesce(nullif(btrim(v_payload->>'cbm_surcharge'),'')::bigint,0),
      coalesce(nullif(btrim(v_payload->>'other_surcharge'),'')::bigint,0),
      coalesce(nullif(btrim(v_payload->>'merchant_payable_charges'),'')::bigint,0),
      coalesce(nullif(btrim(v_payload->>'other_merchant_credits'),'')::bigint,0),
      coalesce(nullif(btrim(v_payload->>'weight_kg'),'')::numeric,0),
      v_monthly
    );

    v_data := coalesce(v_result->'data','{}'::jsonb)
      || v_quote
      || jsonb_build_object(
        'customer_tier',v_requested_tier,
        'additional_customer_charge',0,
        'service_provider_code',v_provider_code
      );
    v_ok := coalesce(v_quote->>'validation_status','ERROR') <> 'ERROR';
    v_resolution := v_resolution || jsonb_build_object(
      'customer_tier_source','AUTHORIZED_DATA_ENTRY_UPDATE_OVERRIDE',
      'resolved_customer_tier',v_requested_tier,
      'client_customer_tier_ignored',false,
      'client_customer_tier_used',true,
      'tier_override_applied',true,
      'tier_override_access',v_update_access
    );

    return v_result || jsonb_build_object(
      'ok',v_ok,
      'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
      'data',v_data,
      'server_resolution',v_resolution,
      'warnings',coalesce(v_result->'warnings','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'code','AUTHORIZED_TIER_OVERRIDE_APPLIED',
        'message','The merchant profile tier was overridden for this parcel by a user with Data Entry update access.'
      )),
      'errors',case when v_ok then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
        'code','FINANCIAL_VALIDATION_ERROR','message',v_quote->>'validation_message'
      )) end
    );
  end if;

  v_data := coalesce(v_result->'data','{}'::jsonb) || jsonb_build_object(
    'additional_customer_charge',0,
    'service_provider_code',v_provider_code
  );
  return v_result || jsonb_build_object(
    'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
    'data',v_data,
    'server_resolution',v_resolution || jsonb_build_object('tier_override_applied',false)
  );
end
$function$;

revoke all on function public.be_data_entry_financial_v2_calculate_v61_3_3_legacy(jsonb)
from public, anon, authenticated;
grant execute on function public.be_data_entry_financial_v2_calculate_v61_3_3_legacy(jsonb)
to service_role;
revoke all on function public.be_data_entry_financial_v2_calculate(jsonb) from public, anon;
grant execute on function public.be_data_entry_financial_v2_calculate(jsonb) to authenticated, service_role;

comment on function public.be_data_entry_financial_v2_calculate(jsonb) is
  'V13.2 Data Entry finance boundary: retired opaque/additional receiver charges, canonical settlement math, and update-authorized per-parcel tier override.';

-- Royal and DK already have active tariff routes. Add the missing GRS provider
-- to the authoritative provider master without inventing an unapproved rate.
insert into public.be_data_entry_service_providers(
  provider_code,display_name,provider_type,is_active,updated_at
) values ('GRS','GRS','OUTSOURCE',true,now())
on conflict(provider_code) do update set
  display_name=excluded.display_name,
  provider_type=excluded.provider_type,
  is_active=true,
  updated_at=now();

create or replace function public.be_data_entry_service_provider_options_v13()
returns jsonb
language sql
stable
security invoker
set search_path=public,pg_temp
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider_code',p.provider_code,
    'display_name',p.display_name,
    'provider_type',p.provider_type,
    'active_tariff_count',coalesce(c.active_tariff_count,0)
  ) order by case p.provider_code
      when 'BRITIUM' then 0 when 'ROYAL EXPRESS' then 1
      when 'DK DELIVERY' then 2 when 'GRS' then 3 else 4 end,
      p.display_name
  ),'[]'::jsonb)
  from public.be_data_entry_service_providers p
  left join lateral (
    select count(*)::integer as active_tariff_count
    from public.be_data_entry_tariff_catalog t
    where t.provider_code=p.provider_code and t.is_active
  ) c on true
  where p.is_active and auth.uid() is not null;
$function$;

revoke all on function public.be_data_entry_service_provider_options_v13() from public, anon;
grant execute on function public.be_data_entry_service_provider_options_v13() to authenticated, service_role;

create or replace function public.be_data_entry_merchant_tier_access_v13(p_merchant_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $function$
declare
  v_merchant_id text := upper(nullif(btrim(coalesce(p_merchant_id,'')),''));
  v_create_access jsonb := public.be_data_entry_actor_access_v57('create',false);
  v_update_access jsonb := public.be_data_entry_actor_access_v57('update',false);
  v_profile_tier text;
  v_registered boolean := false;
  v_any_profile boolean := false;
  v_rules jsonb := '{}'::jsonb;
begin
  if not coalesce((v_create_access->>'allowed')::boolean,false) then
    return jsonb_build_object(
      'ok',false,'message','Data Entry create access is required.','access',v_create_access
    );
  end if;
  if v_merchant_id is null then
    return jsonb_build_object('ok',false,'message','Merchant ID is required.','access',v_create_access);
  end if;

  select upper(btrim(m.customer_tier)) into v_profile_tier
  from public.be_merchant_financial_profiles_v2 m
  where upper(btrim(m.merchant_id))=v_merchant_id
    and m.is_active
    and m.effective_from<=public.be_business_date()
    and (m.effective_to is null or m.effective_to>=public.be_business_date())
  order by m.effective_from desc,m.updated_at desc nulls last
  limit 1;
  v_registered := found;

  select exists(
    select 1 from public.be_merchant_financial_profiles_v2 m
    where upper(btrim(m.merchant_id))=v_merchant_id
  ) into v_any_profile;
  if v_any_profile and not v_registered then
    return jsonb_build_object(
      'ok',false,
      'message','This merchant profile is inactive, expired, or blocked and cannot be overridden from Data Entry.',
      'merchant_id',v_merchant_id,
      'access',v_create_access
    );
  end if;

  select coalesce(jsonb_object_agg(r.customer_tier,r.rule),'{}'::jsonb)
  into v_rules
  from (
    select t.customer_tier,jsonb_build_object(
      'included_kg',min(t.included_kg),
      'extra_per_kg',min(t.extra_per_kg),
      'commitment_min_ways',max(t.commitment_min_ways),
      'commitment_refund_per_way',max(t.commitment_refund_per_way)
    ) as rule
    from public.be_parcel_tariffs_v2 t
    where t.status='ACTIVE'
      and t.effective_from<=public.be_business_date()
      and (t.effective_to is null or t.effective_to>=public.be_business_date())
    group by t.customer_tier
  ) r;

  return jsonb_build_object(
    'ok',true,
    'build','DATA_ENTRY_MERCHANT_TIER_ACCESS_V13_20260902',
    'merchant_id',v_merchant_id,
    'registered',v_registered,
    'profile_tier',v_profile_tier,
    'resolved_customer_tier',coalesce(v_profile_tier,'STANDARD'),
    'can_override_profile_tier',v_registered and coalesce((v_update_access->>'allowed')::boolean,false),
    'can_select_tier',(not v_registered) or coalesce((v_update_access->>'allowed')::boolean,false),
    'tier_rules',v_rules,
    'create_access',v_create_access,
    'update_access',v_update_access
  );
end
$function$;

revoke all on function public.be_data_entry_merchant_tier_access_v13(text) from public, anon;
grant execute on function public.be_data_entry_merchant_tier_access_v13(text) to authenticated, service_role;

-- Capture the unlocked registered rows whose receiver COD was inflated by the
-- retired tariff floor, then reproject all sources through the corrected core.
create temporary table be_financial_formula_repair_v13 on commit drop as
select
  pr.source_kind,
  pr.source_row_id,
  pr.delivery_way_id,
  pr.calculation as before_calculation
from public.be_finance_calculation_projection_v4 pr
where pr.amount_entry_type in (
  'ITEM_PRICE_PLUS_DECLARED_DELIVERY','TOTAL_AMOUNT_INCLUDING_DELIVERY','DELIVERY_CHARGE_ONLY'
)
and coalesce((pr.calculation->>'effective_declared_delivery_charge')::bigint,0) >
  coalesce(case when pr.source_kind='PARCEL'
    then (select p.delivery_charges::bigint from public.parcels p where p.id=pr.source_row_id)
    else (select coalesce(w.delivery_fee_os,w.deli_fee_os)::bigint from public.delivery_waybills w where w.id=pr.source_row_id)
  end,0)
  + coalesce((pr.calculation->>'backend_calculated_delivery_surcharges')::bigint,0)
and (
  (pr.source_kind='PARCEL' and exists (
    select 1 from public.parcels p
    where p.id=pr.source_row_id
      and upper(coalesce(p.status,''))='REGISTERED'
      and p.financial_locked_at is null
      and p.financial_settlement_batch_id is null
      and p.financial_settled_at is null
      and not exists (
        select 1 from public.be_finance_settlement_batch_items_v3 i
        where i.parcel_id=p.id and i.active
      )
  ))
  or
  (pr.source_kind='DELIVERY_WAYBILL' and exists (
    select 1 from public.delivery_waybills w
    where w.id=pr.source_row_id
      and upper(coalesce(nullif(w.overall_status,''),nullif(w.operation_status,''),nullif(w.status,''),''))='REGISTERED'
  ))
);

do $block$
begin
  perform public.be_finance_project_source_v4(p.source_kind,p.source_row_id)
  from public.be_finance_calculation_projection_v4 p;
end
$block$;

update public.parcels p set
  cod_amount=nullif(pr.calculation->>'cod_amount','')::integer,
  collect_amount=nullif(pr.calculation->>'cod_amount','')::numeric,
  total_price=nullif(pr.calculation->>'cod_amount','')::integer,
  effective_declared_delivery_charge=nullif(pr.calculation->>'effective_declared_delivery_charge','')::bigint,
  delivery_difference=nullif(pr.calculation->>'delivery_difference','')::bigint,
  settlement_direction=pr.calculation->>'settlement_direction',
  merchant_settlement_adjustment=nullif(pr.calculation->>'merchant_settlement_adjustment','')::bigint,
  merchant_final_settlement_amount=nullif(pr.calculation->>'merchant_final_settlement_amount','')::bigint,
  validation_status=pr.calculation->>'validation_status',
  validation_message=pr.calculation->>'validation_message',
  calculation_version=pr.calculation->>'calculation_version',
  calculated_at=nullif(pr.calculation->>'calculated_at','')::timestamptz,
  updated_at=now()
from public.be_finance_calculation_projection_v4 pr
join be_financial_formula_repair_v13 r
  on r.source_kind=pr.source_kind and r.source_row_id=pr.source_row_id
where r.source_kind='PARCEL' and p.id=r.source_row_id;

update public.be_data_entry_parcel_details d set
  cod_amount=nullif(pr.calculation->>'cod_amount','')::numeric,
  effective_declared_delivery_charge=nullif(pr.calculation->>'effective_declared_delivery_charge','')::bigint,
  delivery_difference=nullif(pr.calculation->>'delivery_difference','')::bigint,
  settlement_direction=pr.calculation->>'settlement_direction',
  merchant_settlement_adjustment=nullif(pr.calculation->>'merchant_settlement_adjustment','')::bigint,
  merchant_final_settlement_amount=nullif(pr.calculation->>'merchant_final_settlement_amount','')::bigint,
  financial_validation_status=pr.calculation->>'validation_status',
  financial_validation_message=pr.calculation->>'validation_message',
  financial_calculation_version=pr.calculation->>'calculation_version',
  financial_calculated_at=nullif(pr.calculation->>'calculated_at','')::timestamptz,
  financial_quote=pr.calculation,
  updated_at=now()
from public.be_finance_calculation_projection_v4 pr
join be_financial_formula_repair_v13 r
  on r.source_kind=pr.source_kind and r.source_row_id=pr.source_row_id
where upper(btrim(d.delivery_way_id))=pr.delivery_way_id;

update public.be_data_entry_register_rows d set
  cod_os=nullif(pr.calculation->>'cod_amount','')::numeric,
  final_cod=nullif(pr.calculation->>'cod_amount','')::numeric,
  finance_cod=nullif(pr.calculation->>'cod_amount','')::numeric,
  raw_row=coalesce(d.raw_row,'{}'::jsonb) || pr.calculation,
  updated_at=now()
from public.be_finance_calculation_projection_v4 pr
join be_financial_formula_repair_v13 r
  on r.source_kind=pr.source_kind and r.source_row_id=pr.source_row_id
where upper(btrim(d.delivery_way_id))=pr.delivery_way_id;

update public.delivery_waybills w set
  cod_amount=nullif(pr.calculation->>'cod_amount','')::numeric,
  final_cod=nullif(pr.calculation->>'cod_amount','')::numeric,
  cod_os=nullif(pr.calculation->>'cod_amount','')::numeric,
  finance_cod=nullif(pr.calculation->>'cod_amount','')::numeric,
  raw_row=coalesce(w.raw_row,'{}'::jsonb) || pr.calculation,
  updated_at=now()
from public.be_finance_calculation_projection_v4 pr
join be_financial_formula_repair_v13 r
  on r.source_kind=pr.source_kind and r.source_row_id=pr.source_row_id
where r.source_kind='DELIVERY_WAYBILL' and w.id=r.source_row_id;

do $block$
begin
  perform public.be_finance_project_source_v4(p.source_kind,p.source_row_id)
  from public.be_finance_calculation_projection_v4 p;
end
$block$;

insert into public.be_audit_events(
  action,resource_type,resource_id,details,upload_code,event_type,entity_type,entity_id,payload
)
select
  'FINANCIAL_FORMULA_RECONCILED_V13_2',
  r.source_kind,
  r.delivery_way_id,
  jsonb_build_object(
    'reason','Removed receiver COD tariff floor; tariff shortfall now deducts from merchant settlement.',
    'before_calculation',r.before_calculation,
    'after_calculation',pr.calculation
  ),
  'DATA_ENTRY_FINANCE_RECONCILIATION_V13_2_20260902',
  'FINANCIAL_FORMULA_RECONCILED',
  r.source_kind,
  r.delivery_way_id,
  jsonb_build_object('source_row_id',r.source_row_id,'source_kind',r.source_kind)
from be_financial_formula_repair_v13 r
join public.be_finance_calculation_projection_v4 pr
  on pr.source_kind=r.source_kind and pr.source_row_id=r.source_row_id;

-- Migration-time invariants: a below-tariff declaration must remain in COD as
-- declared, exact collection is unchanged, and every repaired projection must
-- carry the corrected formula version and identity.
do $block$
declare
  v_township text;
  v_tier text;
  v_new jsonb;
  v_old jsonb;
  v_surcharges bigint;
begin
  select t.township,t.customer_tier into v_township,v_tier
  from public.be_parcel_tariffs_v2 t
  where t.status='ACTIVE'
    and t.effective_from<=public.be_business_date()
    and (t.effective_to is null or t.effective_to>=public.be_business_date())
  order by t.id
  limit 1;

  if v_township is not null then
    v_new := public.be_calculate_parcel_financial_v2(
      v_township,v_tier,'ITEM_PRICE_PLUS_DECLARED_DELIVERY',10000,0,null,0,0,0,0,0,0,0
    );
    v_surcharges := coalesce((v_new->>'backend_calculated_delivery_surcharges')::bigint,0);
    if (v_new->>'cod_amount')::bigint <> 10000+v_surcharges
       or (v_new->>'effective_declared_delivery_charge')::bigint <> v_surcharges
       or v_new->>'calculation_version' <> 'PARCEL_FINANCIAL_V2_RECEIVER_PAID_DECLARED_DELIVERY_V61_9_1' then
      raise exception 'V61.9.1 below-tariff receiver calculation invariant failed: %',v_new;
    end if;

    v_new := public.be_calculate_parcel_financial_v2(
      v_township,v_tier,'EXACT_COLLECTION_AMOUNT',null,null,25000,0,0,0,0,0,0,0
    );
    v_old := public.be_calculate_parcel_financial_v2_v61_9_0_legacy(
      v_township,v_tier,'EXACT_COLLECTION_AMOUNT',null,null,25000,0,0,0,0,0,0,0
    );
    if v_new <> v_old then
      raise exception 'Exact collection behavior changed unexpectedly.';
    end if;
  end if;

  if exists (
    select 1
    from be_financial_formula_repair_v13 r
    join public.be_finance_calculation_projection_v4 pr
      on pr.source_kind=r.source_kind and pr.source_row_id=r.source_row_id
    where pr.calculation->>'calculation_version' <> 'PARCEL_FINANCIAL_V2_RECEIVER_PAID_DECLARED_DELIVERY_V61_9_1'
  ) then
    raise exception 'One or more eligible financial projections were not reconciled to V61.9.1.';
  end if;
end
$block$;

commit;
