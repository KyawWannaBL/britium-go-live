-- Synchronize COD advance processing fee consistently through pickup,
-- data-entry parcel, and pre-dispatch finance; leave posted settlements untouched.
begin;

CREATE OR REPLACE FUNCTION public.be_parcel_cod_service_fee_sync_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cod numeric := greatest(coalesce(new.actual_collect,0),coalesce(new.cod_amount,0),0);
  v_policy jsonb;
  v_payment_type text;
begin
  -- A parcel inherits the approved payment arrangement from its pickup.
  select coalesce(
    nullif(btrim(p.payment_type),''),
    nullif(btrim(p.payment_method),''),
    nullif(btrim(p.payment_terms),''),
    'COD'
  ) into v_payment_type
  from public.be_portal_pickup_requests p
  where p.pickup_id = new.pickup_id
  limit 1;

  v_policy := public.be_finance_cod_policy_v2(coalesce(v_payment_type,'COD'),v_cod,1);
  new.cod_service_fee_rate := coalesce((v_policy->>'fee_rate')::numeric,0);
  new.cod_service_fee_amount := coalesce((v_policy->>'fee_amount')::numeric,0);
  new.cod_fee_policy_status := coalesce(v_policy->>'cod_policy_status','NOT_EVALUATED');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_finance_predispatch_sync_from_parcel_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_pickup public.be_portal_pickup_requests%rowtype;
  v_type text;
  v_cod numeric;
  v_policy jsonb;
  v_status text;
begin
  if new.delivery_way_id is null or btrim(new.delivery_way_id)='' then
    return new;
  end if;

  select * into v_pickup
  from public.be_portal_pickup_requests
  where pickup_id=new.pickup_id
  limit 1;

  v_type:=coalesce(
    nullif(btrim(v_pickup.payment_type),''),
    nullif(btrim(v_pickup.payment_method),''),
    nullif(btrim(v_pickup.payment_terms),''),
    'COD'
  );

  v_cod:=greatest(coalesce(new.actual_collect,0),coalesce(new.cod_amount,0),0);
  v_policy:=public.be_finance_cod_policy_v2(v_type,v_cod,1);
  v_status:=coalesce(v_policy->>'finance_status','NOT_REQUIRED');

  insert into public.be_finance_predispatch_reviews_v1(
    delivery_way_id,pickup_id,parcel_sequence,merchant_code,merchant_name,payment_type,
    declared_item_value,delivery_region,cod_requested,cod_policy_status,cod_service_fee_rate,
    cod_service_fee_amount,finance_status,finance_required,source_snapshot,created_at,updated_at
  ) values (
    new.delivery_way_id,new.pickup_id,new.parcel_sequence,
    coalesce(new.merchant_id,v_pickup.merchant_code),v_pickup.merchant_name,v_type,
    v_cod,new.delivery_region,coalesce((v_policy->>'cod_requested')::boolean,false),
    coalesce(v_policy->>'cod_policy_status','NOT_EVALUATED'),
    coalesce((v_policy->>'fee_rate')::numeric,0),
    coalesce((v_policy->>'fee_amount')::numeric,0),
    v_status,coalesce((v_policy->>'finance_required')::boolean,false),
    jsonb_build_object(
      'policy_version',v_policy->>'policy_version',
      'financial_validation_status',new.financial_validation_status,
      'cod_amount',new.cod_amount,
      'actual_collect',new.actual_collect,
      'delivery_fee',new.delivery_fee,
      'item_price',new.item_price,
      'merchant_stated_total_amount',new.merchant_stated_total_amount,
      'township',new.township,
      'delivery_region',new.delivery_region,
      'financial_quote',coalesce(new.financial_quote,'{}'::jsonb)
    ),now(),now()
  )
  on conflict (delivery_way_id) do update
  set pickup_id=excluded.pickup_id,
      parcel_sequence=excluded.parcel_sequence,
      merchant_code=excluded.merchant_code,
      merchant_name=excluded.merchant_name,
      payment_type=excluded.payment_type,
      declared_item_value=excluded.declared_item_value,
      delivery_region=excluded.delivery_region,
      cod_requested=excluded.cod_requested,
      cod_policy_status=excluded.cod_policy_status,
      cod_service_fee_rate=excluded.cod_service_fee_rate,
      cod_service_fee_amount=excluded.cod_service_fee_amount,
      finance_required=excluded.finance_required,
      source_snapshot=excluded.source_snapshot,
      finance_status=case
        when public.be_finance_predispatch_reviews_v1.finance_status in ('APPROVED','REJECTED','HELD')
             and public.be_finance_predispatch_reviews_v1.cod_policy_status=excluded.cod_policy_status
             and public.be_finance_predispatch_reviews_v1.declared_item_value=excluded.declared_item_value
          then public.be_finance_predispatch_reviews_v1.finance_status
        else excluded.finance_status
      end,
      reviewed_by=case
        when public.be_finance_predispatch_reviews_v1.cod_policy_status=excluded.cod_policy_status
             and public.be_finance_predispatch_reviews_v1.declared_item_value=excluded.declared_item_value
          then public.be_finance_predispatch_reviews_v1.reviewed_by else null end,
      reviewed_at=case
        when public.be_finance_predispatch_reviews_v1.cod_policy_status=excluded.cod_policy_status
             and public.be_finance_predispatch_reviews_v1.declared_item_value=excluded.declared_item_value
          then public.be_finance_predispatch_reviews_v1.reviewed_at else null end,
      review_note=case
        when public.be_finance_predispatch_reviews_v1.cod_policy_status=excluded.cod_policy_status
             and public.be_finance_predispatch_reviews_v1.declared_item_value=excluded.declared_item_value
          then public.be_finance_predispatch_reviews_v1.review_note else null end,
      updated_at=now();

  update public.be_portal_pickup_requests p
  set finance_pre_dispatch_status=case
      when exists(
        select 1 from public.be_finance_predispatch_reviews_v1 r
        where r.pickup_id=p.pickup_id
          and r.finance_status in ('PENDING_FINANCE','PENDING_VALUE','PENDING_DATA_ENTRY','HELD','REJECTED','NOT_ELIGIBLE')
      ) then 'REVIEW_REQUIRED'
      else 'CLEARED'
    end,
    cod_service_fee_amount=coalesce((
      select sum(r.cod_service_fee_amount)
      from public.be_finance_predispatch_reviews_v1 r
      where r.pickup_id=p.pickup_id
    ),0),
    cod_service_fee_rate=coalesce((
      select max(coalesce(r.cod_service_fee_rate,0))
      from public.be_finance_predispatch_reviews_v1 r
      where r.pickup_id=p.pickup_id
    ),0),
    cod_policy_status=coalesce((
      select case
        when bool_or(r.cod_policy_status='ADVANCE_SETTLEMENT_2_PERCENT_ABOVE_200000')
          then 'ADVANCE_SETTLEMENT_2_PERCENT_ABOVE_200000'
        when bool_or(r.cod_policy_status='COD_FEE_0_2_PERCENT_ABOVE_300000')
          then 'COD_FEE_0_2_PERCENT_ABOVE_300000'
        when bool_or(r.cod_policy_status='COD_FEE_FLAT_200_PER_PARCEL_100001_TO_300000')
          then 'COD_FEE_FLAT_200_PER_PARCEL_100001_TO_300000'
        when bool_or(r.cod_requested)
          then 'COD_FEE_FREE_0_TO_100000'
        else 'NOT_APPLICABLE'
      end
      from public.be_finance_predispatch_reviews_v1 r
      where r.pickup_id=p.pickup_id
    ),p.cod_policy_status),
    updated_at=now()
  where p.pickup_id=new.pickup_id;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_pickup_cod_policy_sync_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_type text := coalesce(
    nullif(btrim(new.payment_type),''),
    nullif(btrim(new.payment_method),''),
    nullif(btrim(new.payment_terms),''),
    'COD'
  );
  v_value numeric := greatest(
    coalesce(new.total_cod,0),
    coalesce(new.cod_amount,0),
    coalesce(new.declared_item_value,0),
    coalesce(nullif(new.metadata->>'declared_item_value','')::numeric,0),
    0
  );
  v_parcels integer := greatest(coalesce(new.parcel_count,new.expected_parcels,1),1);
  v_policy jsonb;
  v_review_count integer := 0;
  v_matching_count integer := 0;
  v_review_fee numeric;
  v_review_rate numeric;
  v_review_status text;
begin
  v_policy := public.be_finance_cod_policy_v2(v_type,v_value,v_parcels);

  -- Once reviewed parcel amounts exist, never replace their per-parcel
  -- fee total with a fee derived from a pickup's aggregate COD.
  -- Only use review rows when ALL rows match the current payment type.
  if tg_op='UPDATE' and nullif(btrim(new.pickup_id),'') is not null then
    select count(*),
           count(*) filter (where
             upper(replace(replace(btrim(coalesce(r.payment_type,'')),' ','_'),'-','_'))
             = upper(replace(replace(btrim(v_type),' ','_'),'-','_'))),
           coalesce(sum(coalesce(r.cod_service_fee_amount,0)),0),
           coalesce(max(coalesce(r.cod_service_fee_rate,0)),0),
           case
             when bool_or(r.cod_policy_status='ADVANCE_SETTLEMENT_2_PERCENT_ABOVE_200000')
               then 'ADVANCE_SETTLEMENT_2_PERCENT_ABOVE_200000'
             when bool_or(r.cod_policy_status='COD_FEE_0_2_PERCENT_ABOVE_300000')
               then 'COD_FEE_0_2_PERCENT_ABOVE_300000'
             when bool_or(r.cod_policy_status='COD_FEE_FLAT_200_PER_PARCEL_100001_TO_300000')
               then 'COD_FEE_FLAT_200_PER_PARCEL_100001_TO_300000'
             when bool_or(r.cod_requested) then 'COD_FEE_FREE_0_TO_100000'
             else 'NOT_APPLICABLE'
           end
      into v_review_count,v_matching_count,v_review_fee,v_review_rate,v_review_status
    from public.be_finance_predispatch_reviews_v1 r
    where r.pickup_id=new.pickup_id;
  end if;

  if v_review_count>0 and v_review_count=v_matching_count then
    new.cod_policy_status := coalesce(v_review_status,'NOT_EVALUATED');
    new.cod_service_fee_rate := v_review_rate;
    new.cod_service_fee_amount := v_review_fee;
  else
    new.cod_policy_status := coalesce(v_policy->>'cod_policy_status','NOT_EVALUATED');
    new.cod_service_fee_rate := coalesce((v_policy->>'fee_rate')::numeric,0);
    new.cod_service_fee_amount := coalesce((v_policy->>'fee_amount')::numeric,0);
  end if;
  new.finance_pre_dispatch_status := coalesce(v_policy->>'finance_status','NOT_REQUIRED');
  new.metadata := coalesce(new.metadata,'{}'::jsonb)
    || jsonb_build_object('cod_fee_policy',v_policy);

  return new;
end;
$function$;

-- Security: event hooks are trigger-only, never standalone public RPCs.
revoke all on function public.be_parcel_cod_service_fee_sync_v1() from public,anon,authenticated;
revoke all on function public.be_finance_predispatch_sync_from_parcel_v1() from public,anon,authenticated;
revoke all on function public.be_pickup_cod_policy_sync_v1() from public,anon,authenticated;

commit;
