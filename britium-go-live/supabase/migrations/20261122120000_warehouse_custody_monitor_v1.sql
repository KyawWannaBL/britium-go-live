-- Parcel custody monitoring: read-only, role-checked, and no automatic LOST/DELIVERED/SETTLED mutations.
-- Shipment presence in a limited COD/third-party export does not establish physical custody.
create or replace function public.be_warehouse_custody_monitor_v1(
  p_limit integer default 150,
  p_offset integer default 0,
  p_category text default null,
  p_search text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text := lower(replace(coalesce(public.be_current_role(),''),'-','_'));
  v_total integer;
  v_grouped jsonb;
  v_records jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='28000';
  end if;
  -- Global cross-ledger data must not be exposed to branch / rider / merchant roles.
  if v_role not in ('superadmin','admin','finance') then
    raise exception 'WAREHOUSE_CUSTODY_MONITOR_ROLE_REQUIRED' using errcode='42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 300 or coalesce(p_offset,0) < 0 then
    raise exception 'INVALID_PAGINATION' using errcode='22023';
  end if;

  with wh as (
    select distinct on (upper(btrim(delivery_way_id)))
      upper(btrim(delivery_way_id)) way_id,
      coalesce(merchant_name,'') merchant_name,
      coalesce(recipient_name,'') recipient_name,
      coalesce(delivery_township,'') township,
      coalesce(item_status,'') warehouse_status,
      coalesce(dispatch_scanned,false) dispatch_scanned,
      coalesce(dwell_alert,false) dwell_alert,
      dwell_hours,warehouse_entered_at,dispatch_scanned_at,updated_at
    from public.be_v_warehouse_lifecycle_v39
    where nullif(btrim(delivery_way_id),'') is not null
    order by upper(btrim(delivery_way_id)),updated_at desc nulls last
  ),
  cod as (
    select upper(btrim(delivery_way_id)) way_id,
      max(coalesce(settlement_status,'')) status
    from public.be_wayplan_cod_settlements
    where nullif(btrim(delivery_way_id),'') is not null
    group by 1
  ),
  thirdparty as (
    select distinct on (upper(btrim(delivery_way_id)))
      upper(btrim(delivery_way_id)) way_id,coalesce(provider_code,'') provider_code,
      coalesce(cs_outcome,'') cs_outcome,coalesce(finance_review_status,'') finance_review_status
    from public.be_thirdparty_finance_review_queue_v1
    where nullif(btrim(delivery_way_id),'') is not null
    order by upper(btrim(delivery_way_id)),updated_at desc nulls last
  ),
  custody as (
    select upper(btrim(delivery_way_id)) way_id,
      count(*) record_count,
      count(*) filter (where physically_handed_over_at is not null and
        nullif(btrim(coalesce(provider_receipt_ref,'')),'') is not null) proved_count
    from public.be_provider_transfer_custody_v1
    where nullif(btrim(delivery_way_id),'') is not null group by 1
  ),
  joined as (
    select wh.*,coalesce(cod.status,'') cod_status,
      thirdparty.provider_code,thirdparty.cs_outcome,thirdparty.finance_review_status,
      coalesce(custody.record_count,0) custody_events,
      coalesce(custody.proved_count,0) custody_proofs,
      case
        when thirdparty.way_id is not null and coalesce(custody.proved_count,0)=0 then 'PROVIDER_RECEIPT_MISSING'
        when upper(wh.warehouse_status) in ('RETURN_TO_SENDER','DELIVERY_FAILED') then 'RETURN_CUSTODY_REVIEW'
        when wh.dispatch_scanned and cod.way_id is null and thirdparty.way_id is null then 'DISPATCH_NO_FINANCE_TRACE'
        when wh.dwell_alert and cod.way_id is null and thirdparty.way_id is null then 'WAREHOUSE_DWELL'
        when upper(wh.warehouse_status)='SUBMITTED' then 'RECEIPT_OR_REGISTRATION_PENDING'
        when cod.way_id is not null then 'COD_COLLECTION_TRACKED'
        when thirdparty.way_id is not null then 'THIRD_PARTY_TRACKED'
        else 'WAREHOUSE_OR_ROUTE_PENDING'
      end category
    from wh left join cod using(way_id) left join thirdparty using(way_id)
    left join custody using(way_id)
  ),
  narrowed as (
    select * from joined
    where (nullif(btrim(coalesce(p_category,'')),'') is null or category=p_category)
      and (nullif(btrim(coalesce(p_search,'')),'') is null or
        way_id ilike '%'||btrim(p_search)||'%' or merchant_name ilike '%'||btrim(p_search)||'%' or
        recipient_name ilike '%'||btrim(p_search)||'%' or township ilike '%'||btrim(p_search)||'%')
  )
  select count(*),coalesce(jsonb_agg(jsonb_build_object(
     'way_id',way_id,'merchant',merchant_name,'recipient',recipient_name,
     'township',township,'warehouse_status',warehouse_status,
     'dispatch_scanned',dispatch_scanned,'dwell_alert',dwell_alert,
     'dwell_hours',dwell_hours,'cod_status',cod_status,
     'provider',provider_code,'provider_outcome',cs_outcome,
     'thirdparty_finance_status',finance_review_status,
     'custody_events',custody_events,'custody_proofs',custody_proofs,
     'category',category,'updated_at',updated_at
  ) order by way_id) filter(where way_id is not null),'[]'::jsonb)
  into v_total,v_records
  from (select * from narrowed order by
    case category when 'PROVIDER_RECEIPT_MISSING' then 1
    when 'RETURN_CUSTODY_REVIEW' then 2
    when 'DISPATCH_NO_FINANCE_TRACE' then 3
    when 'WAREHOUSE_DWELL' then 4 else 8 end,way_id
    limit p_limit offset coalesce(p_offset,0)) p;

  -- The filtered total must be computed before pagination.
  with wh as (
    select distinct on (upper(btrim(delivery_way_id)))
      upper(btrim(delivery_way_id)) way_id,
      coalesce(merchant_name,'') merchant_name,
      coalesce(recipient_name,'') recipient_name,
      coalesce(delivery_township,'') township,
      coalesce(item_status,'') status,
      coalesce(dispatch_scanned,false) dispatched,coalesce(dwell_alert,false) dwell
    from public.be_v_warehouse_lifecycle_v39
    where nullif(btrim(delivery_way_id),'') is not null
    order by upper(btrim(delivery_way_id)),updated_at desc nulls last
  ),
  cod as (select distinct upper(btrim(delivery_way_id)) way_id from public.be_wayplan_cod_settlements),
  tp as (select distinct upper(btrim(delivery_way_id)) way_id from public.be_thirdparty_finance_review_queue_v1),
  proof as (select distinct upper(btrim(delivery_way_id)) way_id from public.be_provider_transfer_custody_v1
    where physically_handed_over_at is not null and nullif(btrim(coalesce(provider_receipt_ref,'')),'') is not null),
  classified as (
    select wh.*,
    case when tp.way_id is not null and proof.way_id is null then 'PROVIDER_RECEIPT_MISSING'
     when upper(wh.status) in ('RETURN_TO_SENDER','DELIVERY_FAILED') then 'RETURN_CUSTODY_REVIEW'
     when wh.dispatched and cod.way_id is null and tp.way_id is null then 'DISPATCH_NO_FINANCE_TRACE'
     when wh.dwell and cod.way_id is null and tp.way_id is null then 'WAREHOUSE_DWELL'
     when upper(wh.status)='SUBMITTED' then 'RECEIPT_OR_REGISTRATION_PENDING'
     when cod.way_id is not null then 'COD_COLLECTION_TRACKED'
     when tp.way_id is not null then 'THIRD_PARTY_TRACKED'
     else 'WAREHOUSE_OR_ROUTE_PENDING' end category
    from wh left join cod using(way_id) left join tp using(way_id) left join proof using(way_id)
  )
  select count(*),coalesce(jsonb_object_agg(category,n),'{}'::jsonb)
  into v_total,v_grouped
  from (select category,count(*) n from classified
    where (nullif(btrim(coalesce(p_category,'')),'') is null or category=p_category)
      and (nullif(btrim(coalesce(p_search,'')),'') is null or
        way_id ilike '%'||btrim(p_search)||'%' or merchant_name ilike '%'||btrim(p_search)||'%' or
        recipient_name ilike '%'||btrim(p_search)||'%' or township ilike '%'||btrim(p_search)||'%')
    group by category) agg;

  return jsonb_build_object('as_of',now(),'total',v_total,'by_category',v_grouped,
    'rows',v_records,'read_only',true,'scope','ENTERPRISE_FINANCE',
    'warning','Absence from a finance ledger is not proof that a parcel is missing.');
end;
$function$;
revoke all on function public.be_warehouse_custody_monitor_v1(integer,integer,text,text) from public,anon;
grant execute on function public.be_warehouse_custody_monitor_v1(integer,integer,text,text) to authenticated;
