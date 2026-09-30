begin;

create or replace function public.be_finance_predispatch_sync_from_parcel_v1()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
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
      'policy_version','COD_FEE_2026_09_30',
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
    cod_service_fee_rate=case
      when exists(
        select 1 from public.be_finance_predispatch_reviews_v1 r
        where r.pickup_id=p.pickup_id and coalesce(r.cod_service_fee_rate,0)>0
      ) then 0.002 else 0 end,
    cod_policy_status=coalesce((
      select case
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
$$;

create or replace function public.be_finance_merchant_settlement_report_v1(
  p_from date,
  p_to date,
  p_merchant text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if not public.be_accounting_can_v1('financial_reports') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  return jsonb_build_object(
    'ok',true,'from',p_from,'to',p_to,
    'policy_version','COD_FEE_2026_09_30',
    'summary',coalesce((
      select jsonb_build_object(
        'parcel_count',count(*),
        'gross_cod',coalesce(sum(coalesce(d.cod_amount,0)),0),
        'delivery_fee',coalesce(sum(coalesce(d.delivery_fee,0)),0),
        'cod_service_fee',coalesce(sum(coalesce(d.cod_service_fee_amount,0)),0),
        'calculated_merchant_net',coalesce(sum(greatest(
          coalesce(d.cod_amount,0)-coalesce(d.delivery_fee,0)-coalesce(d.cod_service_fee_amount,0),0
        )),0)
      )
      from public.be_data_entry_parcel_details d
      where coalesce(d.saved_at,d.created_at)::date between p_from and p_to
        and (
          nullif(btrim(coalesce(p_merchant,'')),'') is null
          or coalesce(d.merchant_id,'') ilike '%'||p_merchant||'%'
        )
    ),'{}'::jsonb),
    'rows',coalesce((
      select jsonb_agg(to_jsonb(q) order by q.activity_date desc,q.delivery_way_id)
      from (
        select
          coalesce(d.saved_at,d.created_at)::date as activity_date,
          d.delivery_way_id,d.pickup_id,d.merchant_id,
          p.merchant_name,
          coalesce(p.payment_type,p.payment_method,p.payment_terms) as payment_type,
          d.township,d.delivery_region,
          coalesce(d.item_price,d.merchant_stated_total_amount::numeric,d.cod_amount,0) as declared_item_value,
          coalesce(d.cod_amount,0) as gross_cod,
          coalesce(d.delivery_fee,0) as delivery_fee,
          coalesce(d.cod_service_fee_rate,0) as cod_service_fee_rate,
          coalesce(d.cod_service_fee_amount,0) as cod_service_fee,
          greatest(
            coalesce(d.cod_amount,0)-coalesce(d.delivery_fee,0)-coalesce(d.cod_service_fee_amount,0),0
          ) as calculated_merchant_net,
          coalesce(d.cod_fee_policy_status,'NOT_APPLICABLE') as cod_policy_status,
          coalesce(r.finance_status,'NOT_REQUIRED') as finance_status,
          s.settlement_status,s.settlement_reference,s.settled_amount,s.settled_at
        from public.be_data_entry_parcel_details d
        left join public.be_portal_pickup_requests p on p.pickup_id=d.pickup_id
        left join public.be_finance_predispatch_reviews_v1 r on r.delivery_way_id=d.delivery_way_id
        left join public.be_finance_cod_settlements_v48 s on s.delivery_way_id=d.delivery_way_id
        where coalesce(d.saved_at,d.created_at)::date between p_from and p_to
          and (
            nullif(btrim(coalesce(p_merchant,'')),'') is null
            or coalesce(d.merchant_id,'') ilike '%'||p_merchant||'%'
            or coalesce(p.merchant_name,'') ilike '%'||p_merchant||'%'
          )
        order by activity_date desc,d.delivery_way_id
      ) q
    ),'[]'::jsonb)
  );
end;
$$;

update public.be_finance_predispatch_reviews_v1 r
set
  declared_item_value=greatest(coalesce(d.actual_collect,0),coalesce(d.cod_amount,0),0),
  cod_requested=coalesce((public.be_finance_cod_policy_v2(
    coalesce(nullif(p.payment_type,''),nullif(p.payment_method,''),nullif(p.payment_terms,''),'COD'),
    greatest(coalesce(d.actual_collect,0),coalesce(d.cod_amount,0),0),1
  )->>'cod_requested')::boolean,false),
  cod_policy_status=coalesce(public.be_finance_cod_policy_v2(
    coalesce(nullif(p.payment_type,''),nullif(p.payment_method,''),nullif(p.payment_terms,''),'COD'),
    greatest(coalesce(d.actual_collect,0),coalesce(d.cod_amount,0),0),1
  )->>'cod_policy_status','NOT_EVALUATED'),
  cod_service_fee_rate=coalesce((public.be_finance_cod_policy_v2(
    coalesce(nullif(p.payment_type,''),nullif(p.payment_method,''),nullif(p.payment_terms,''),'COD'),
    greatest(coalesce(d.actual_collect,0),coalesce(d.cod_amount,0),0),1
  )->>'fee_rate')::numeric,0),
  cod_service_fee_amount=coalesce((public.be_finance_cod_policy_v2(
    coalesce(nullif(p.payment_type,''),nullif(p.payment_method,''),nullif(p.payment_terms,''),'COD'),
    greatest(coalesce(d.actual_collect,0),coalesce(d.cod_amount,0),0),1
  )->>'fee_amount')::numeric,0),
  finance_required=coalesce((public.be_finance_cod_policy_v2(
    coalesce(nullif(p.payment_type,''),nullif(p.payment_method,''),nullif(p.payment_terms,''),'COD'),
    greatest(coalesce(d.actual_collect,0),coalesce(d.cod_amount,0),0),1
  )->>'finance_required')::boolean,false),
  finance_status=case
    when r.finance_status in ('APPROVED','REJECTED','HELD') then r.finance_status
    else coalesce(public.be_finance_cod_policy_v2(
      coalesce(nullif(p.payment_type,''),nullif(p.payment_method,''),nullif(p.payment_terms,''),'COD'),
      greatest(coalesce(d.actual_collect,0),coalesce(d.cod_amount,0),0),1
    )->>'finance_status','NOT_REQUIRED')
  end,
  source_snapshot=coalesce(r.source_snapshot,'{}'::jsonb)
    || jsonb_build_object('policy_version','COD_FEE_2026_09_30'),
  updated_at=now()
from public.be_data_entry_parcel_details d
left join public.be_portal_pickup_requests p on p.pickup_id=d.pickup_id
where d.delivery_way_id=r.delivery_way_id;

commit;
