-- Finance COD dispatch clearance V1
-- Yangon COD <= 200,000 MMK: standard COD / auto-approved.
-- Yangon COD > 200,000 MMK: 2% service fee + Finance pre-dispatch approval.
-- COD outside Yangon: not eligible.
-- Dispatch release blocks any COD parcel that has not cleared Finance.

create or replace function public.be_dispatch_validate_release_v39(p_way_ids text[])
returns jsonb
language plpgsql
stable
security definer
set search_path='public','auth','pg_temp'
as $$
declare
  v_missing_scan text[] := '{}'::text[];
  v_not_ready text[] := '{}'::text[];
  v_rto text[] := '{}'::text[];
  v_finance_blocked text[] := '{}'::text[];
  v_total integer := 0;
begin
  if p_way_ids is null or coalesce(array_length(p_way_ids,1),0)=0 then
    return jsonb_build_object(
      'ok',false,'message','No parcel rows were supplied for dispatch release','total',0,
      'missing_dispatch_scan','[]'::jsonb,'not_warehouse_ready','[]'::jsonb,
      'rto_rows','[]'::jsonb,'finance_blocked','[]'::jsonb
    );
  end if;

  select count(*)::integer into v_total
  from (select distinct nullif(btrim(x),'') way_id from unnest(p_way_ids) x) q
  where q.way_id is not null;

  select coalesce(array_agg(q.way_id order by q.way_id),'{}'::text[]) into v_missing_scan
  from (select distinct nullif(btrim(x),'') way_id from unnest(p_way_ids) x) q
  where q.way_id is not null
    and not exists (
      select 1 from public.be_dispatch_scans_v39 s
      where s.delivery_way_id=q.way_id and s.scan_status='SCANNED'
    );

  select coalesce(array_agg(q.way_id order by q.way_id),'{}'::text[]) into v_not_ready
  from (select distinct nullif(btrim(x),'') way_id from unnest(p_way_ids) x) q
  where q.way_id is not null
    and not exists (
      select 1 from public.be_warehouse_receipts_v36 r
      where r.delivery_way_id=q.way_id
        and r.warehouse_status='WAREHOUSE_READY'
        and r.discrepancy_code is null
    );

  select coalesce(array_agg(q.way_id order by q.way_id),'{}'::text[]) into v_rto
  from (select distinct nullif(btrim(x),'') way_id from unnest(p_way_ids) x) q
  where q.way_id is not null
    and exists (
      select 1 from public.be_delivery_attempt_state_v39 a
      where a.delivery_way_id=q.way_id and a.last_status='RTO'
    );

  select coalesce(array_agg(q.way_id order by q.way_id),'{}'::text[]) into v_finance_blocked
  from (select distinct nullif(btrim(x),'') way_id from unnest(p_way_ids) x) q
  where q.way_id is not null
    and (
      exists (
        select 1
        from public.be_finance_predispatch_reviews_v1 f
        where f.delivery_way_id=q.way_id
          and coalesce(f.finance_status,'') not in ('APPROVED','AUTO_APPROVED','NOT_REQUIRED','CLEARED')
      )
      or exists (
        select 1
        from public.be_data_entry_parcel_details d
        left join public.be_portal_pickup_requests p on p.pickup_id=d.pickup_id
        where d.delivery_way_id=q.way_id
          and upper(replace(replace(btrim(coalesce(p.payment_type,p.payment_method,p.payment_terms,'')),' ','_'),'-','_'))='COD'
          and not exists (
            select 1 from public.be_finance_predispatch_reviews_v1 f2
            where f2.delivery_way_id=q.way_id
          )
      )
    );

  return jsonb_build_object(
    'ok',
      cardinality(v_missing_scan)=0
      and cardinality(v_not_ready)=0
      and cardinality(v_rto)=0
      and cardinality(v_finance_blocked)=0,
    'total',v_total,
    'dispatch_scanned',greatest(v_total-cardinality(v_missing_scan),0),
    'missing_dispatch_scan_count',cardinality(v_missing_scan),
    'not_warehouse_ready_count',cardinality(v_not_ready),
    'rto_count',cardinality(v_rto),
    'finance_blocked_count',cardinality(v_finance_blocked),
    'missing_dispatch_scan',to_jsonb(v_missing_scan[1:20]),
    'not_warehouse_ready',to_jsonb(v_not_ready[1:20]),
    'rto_rows',to_jsonb(v_rto[1:20]),
    'finance_blocked',to_jsonb(v_finance_blocked[1:20]),
    'message',case
      when cardinality(v_finance_blocked)>0 then format('%s parcel(s) require Finance pre-dispatch clearance',cardinality(v_finance_blocked))
      when cardinality(v_missing_scan)>0 then format('%s parcel(s) still require dispatch scanning',cardinality(v_missing_scan))
      when cardinality(v_not_ready)>0 then format('%s parcel(s) are not Warehouse Ready',cardinality(v_not_ready))
      when cardinality(v_rto)>0 then format('%s RTO parcel(s) cannot be dispatched',cardinality(v_rto))
      else 'Dispatch release validation passed'
    end
  );
end;
$$;

revoke all on function public.be_dispatch_validate_release_v39(text[]) from public,anon;
grant execute on function public.be_dispatch_validate_release_v39(text[]) to authenticated,service_role;

create or replace function public.be_finance_cod_policy_v1(
  p_payment_type text,
  p_item_value numeric,
  p_delivery_region text
) returns jsonb
language plpgsql
immutable
set search_path='public','pg_temp'
as $$
declare
  v_type text := upper(replace(replace(btrim(coalesce(p_payment_type,'')),' ','_'),'-','_'));
  v_value numeric := greatest(coalesce(p_item_value,0),0);
  v_region text := upper(replace(replace(btrim(coalesce(p_delivery_region,'')),' ','_'),'-','_'));
  v_yangon boolean := v_region in ('YANGON','YGN','YANGON_REGION','YANGON_CITY');
begin
  if v_type='KBZPAY' then v_type:='KBZ_PAY'; end if;
  if v_type='BANK' then v_type:='BANK_TRANSFER'; end if;
  if v_type in ('','COD') then v_type:='COD'; end if;

  if v_type<>'COD' then
    return jsonb_build_object(
      'payment_type',v_type,'cod_requested',false,'eligible',true,
      'cod_policy_status','NOT_APPLICABLE','finance_status','NOT_REQUIRED',
      'finance_required',false,'fee_rate',0,'fee_amount',0
    );
  end if;

  if v_region='' then
    return jsonb_build_object(
      'payment_type','COD','cod_requested',true,'eligible',false,
      'cod_policy_status','PENDING_DESTINATION','finance_status','PENDING_DATA_ENTRY',
      'finance_required',true,'fee_rate',0,'fee_amount',0
    );
  end if;

  if not v_yangon then
    return jsonb_build_object(
      'payment_type','COD','cod_requested',true,'eligible',false,
      'cod_policy_status','COD_NOT_AVAILABLE_OUTSIDE_YANGON','finance_status','NOT_ELIGIBLE',
      'finance_required',true,'fee_rate',0,'fee_amount',0
    );
  end if;

  if v_value<=0 then
    return jsonb_build_object(
      'payment_type','COD','cod_requested',true,'eligible',false,
      'cod_policy_status','ITEM_VALUE_REQUIRED','finance_status','PENDING_VALUE',
      'finance_required',true,'fee_rate',0,'fee_amount',0
    );
  end if;

  if v_value<=200000 then
    return jsonb_build_object(
      'payment_type','COD','cod_requested',true,'eligible',true,
      'cod_policy_status','STANDARD_COD_YANGON','finance_status','AUTO_APPROVED',
      'finance_required',false,'fee_rate',0,'fee_amount',0
    );
  end if;

  return jsonb_build_object(
    'payment_type','COD','cod_requested',true,'eligible',true,
    'cod_policy_status','HIGH_VALUE_COD_2_PERCENT','finance_status','PENDING_FINANCE',
    'finance_required',true,'fee_rate',0.02,'fee_amount',round(v_value*0.02,0)
  );
end;
$$;
