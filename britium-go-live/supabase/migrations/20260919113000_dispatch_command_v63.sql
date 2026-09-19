-- V63: current-lifecycle Dispatch Command snapshot.
-- Shows CREATED/PENDING_REVIEW/DISPATCH_READY/DISPATCHED Wayplans directly
-- from the canonical Wayplan tables instead of the legacy bulkload-only snapshot.

create index if not exists be_dispatch_scans_v39_wayplan_status_idx
  on public.be_dispatch_scans_v39(wayplan_code, scan_status, delivery_way_id);

create or replace function public.be_dispatch_command_snapshot_v63()
returns jsonb
language sql
stable
security definer
set search_path='public'
as $function$
with active_wayplans as (
  select
    d.wayplan_id,
    d.wayplan_id as wayplan_code,
    d.wayplan_status,
    d.total_stops,
    d.vehicle_code,
    d.vehicle_name,
    d.driver_code,
    d.driver_name,
    nullif(d.rider_code,'') as rider_code,
    nullif(d.rider_name,'') as rider_name,
    nullif(d.helper_code,'') as helper_code,
    nullif(d.helper_name,'') as helper_name,
    d.created_at,
    d.updated_at,
    d.dispatched_at,
    coalesce(r.review_status,'DRAFT') as review_status,
    r.submitted_at,
    r.reviewed_at,
    r.dispatch_ready_at,
    r.dispatched_at as review_dispatched_at
  from public.be_wayplan_dispatches d
  left join public.be_wayplan_review_v43 r on r.wayplan_id=d.wayplan_id
  where upper(coalesce(d.wayplan_status,'')) not in ('CANCELLED','COMPLETED')
), plan_counts as (
  select
    w.*,
    coalesce(m.parcel_count,0) as parcel_count,
    coalesce(m.planned_count,0) as planned_count,
    coalesce(m.ready_count,0) as ready_count,
    coalesce(m.dispatched_count,0) as dispatched_count,
    coalesce(s.scanned_count,0) as scanned_count
  from active_wayplans w
  left join lateral (
    select
      count(*) filter(where membership_status not in ('CANCELLED','COMPLETED','RTO'))::integer as parcel_count,
      count(*) filter(where membership_status='PLANNED')::integer as planned_count,
      count(*) filter(where membership_status='READY_FOR_DISPATCH')::integer as ready_count,
      count(*) filter(where membership_status='DISPATCHED')::integer as dispatched_count
    from public.be_wayplan_membership_v40 m
    where m.wayplan_id=w.wayplan_id
  ) m on true
  left join lateral (
    select count(distinct ds.delivery_way_id)::integer as scanned_count
    from public.be_dispatch_scans_v39 ds
    where ds.wayplan_code=w.wayplan_id and ds.scan_status='SCANNED'
  ) s on true
), jobs as (
  select
    s.wayplan_id as wayplan_code,
    s.delivery_way_id as tracking_no,
    s.delivery_way_id,
    coalesce(w.vehicle_code,s.vehicle_code,'UNASSIGNED') as asset_code,
    coalesce(w.vehicle_name,w.vehicle_code,s.vehicle_code,'UNASSIGNED') as asset_name,
    coalesce(s.recipient_name,p.recipient_name) as recipient_name,
    coalesce(s.recipient_phone,p.contact_no_1,p.contact_no_2) as recipient_phone,
    coalesce(s.recipient_phone,p.contact_no_1,p.contact_no_2) as phone_number,
    coalesce(s.township,s.delivery_township,s.recipient_township,p.township) as delivery_township,
    coalesce(s.address,s.delivery_address,p.recipient_address) as recipient_address,
    coalesce(s.cod_amount,s.amount_to_collect,p.actual_collect,p.cod_amount,0) as cod_amount,
    coalesce(p.delivery_charges,p.delivery_fee,0) as delivery_charges,
    coalesce(s.cod_amount,s.amount_to_collect,p.actual_collect,p.cod_amount,0)
      + coalesce(p.delivery_charges,p.delivery_fee,0) as total_collected_amount,
    coalesce(s.parcel_weight_kg,p.weight_kg,0) as weight_kg,
    s.stop_sequence as parcel_sequence,
    s.stop_sequence as route_sequence,
    coalesce(s.rider_status,'PENDING') as delivery_status,
    case
      when upper(coalesce(w.wayplan_status,''))='DISPATCHED' then 'OUT_FOR_DELIVERY'
      when w.review_status='DISPATCH_READY' then 'DISPATCH_READY'
      else w.review_status
    end as dispatch_status,
    coalesce(s.warehouse_status,p.warehouse_status,'') as warehouse_status,
    m.membership_status,
    coalesce(s.scan_count,0) as scan_count,
    exists(
      select 1 from public.be_dispatch_scans_v39 ds
      where ds.wayplan_code=s.wayplan_id
        and ds.delivery_way_id=s.delivery_way_id
        and ds.scan_status='SCANNED'
    ) as dispatch_scanned,
    w.review_status,
    w.driver_code,w.driver_name,w.rider_code,w.rider_name,w.helper_code,w.helper_name,
    p.pickup_id,
    p.merchant_code,p.merchant_name
  from public.be_wayplan_dispatch_stops s
  join plan_counts w on w.wayplan_id=s.wayplan_id
  left join public.be_wayplan_membership_v40 m
    on m.wayplan_id=s.wayplan_id and m.delivery_way_id=s.delivery_way_id
  left join public.be_data_entry_parcel_details p on p.delivery_way_id=s.delivery_way_id
), assets as (
  select distinct
    coalesce(vehicle_code,'UNASSIGNED') as asset_code,
    coalesce(vehicle_name,vehicle_code,'UNASSIGNED') as asset_name,
    'DELIVERY'::text as operation_type,
    true as active
  from plan_counts
), wp_json as (
  select coalesce(jsonb_agg(
    to_jsonb(p)
    || jsonb_build_object(
      'wayplan_no',p.wayplan_id,
      'scan_remaining',greatest(p.parcel_count-p.scanned_count,0),
      'publish_ready',
        p.review_status='DISPATCH_READY'
        and p.ready_count=p.parcel_count
        and p.scanned_count=p.parcel_count
        and p.parcel_count>0,
      'next_step',
        case
          when p.review_status in ('DRAFT','PENDING_REVIEW') then 'Supervisor approval required'
          when p.review_status='APPROVED' then 'Release approved Wayplan to DISPATCH_READY'
          when p.review_status='DISPATCH_READY' and p.scanned_count<p.parcel_count then
            format('%s parcel(s) still require mandatory Dispatch scan',p.parcel_count-p.scanned_count)
          when p.review_status='DISPATCH_READY' then 'Ready to publish'
          when p.review_status='DISPATCHED' then 'Published to field operation'
          else 'Review Wayplan status'
        end
    )
    order by
      case p.review_status when 'DISPATCH_READY' then 1 when 'APPROVED' then 2 when 'PENDING_REVIEW' then 3 when 'DRAFT' then 4 when 'DISPATCHED' then 5 else 6 end,
      p.updated_at desc
  ),'[]'::jsonb) as value
  from plan_counts p
), job_json as (
  select coalesce(jsonb_agg(to_jsonb(j) order by j.wayplan_code,j.parcel_sequence,j.delivery_way_id),'[]'::jsonb) as value
  from jobs j
), asset_json as (
  select coalesce(jsonb_agg(to_jsonb(a) order by a.asset_code),'[]'::jsonb) as value from assets a
), stats as (
  select jsonb_build_object(
    'wayplans',(select count(*) from plan_counts),
    'jobs',(select count(*) from jobs),
    'pending',(select count(*) from jobs where review_status in ('DRAFT','PENDING_REVIEW','APPROVED','DISPATCH_READY')),
    'out_for_delivery',(select count(*) from jobs where upper(coalesce(dispatch_status,''))='OUT_FOR_DELIVERY'),
    'delivered',(select count(*) from jobs where upper(coalesce(delivery_status,'')) in ('DELIVERED','COMPLETED','DROP_OFF')),
    'failed',(select count(*) from jobs where upper(coalesce(delivery_status,'')) in ('ATTEMPTED_FAILED','DELIVERY_FAILED','FAILED')),
    'rto',(select count(*) from jobs where upper(coalesce(delivery_status,''))='RTO'),
    'cod',coalesce((select sum(cod_amount) from jobs),0)
  ) as value
)
select jsonb_build_object(
  'ok',true,
  'build','DISPATCH_COMMAND_V63_CURRENT_WAYPLAN',
  'stats',(select value from stats),
  'wayplans',(select value from wp_json),
  'jobs',(select value from job_json),
  'assets',(select value from asset_json),
  'zones','[]'::jsonb,
  'source','CANONICAL_WAYPLAN_V40_V43'
);
$function$;

grant execute on function public.be_dispatch_command_snapshot_v63() to authenticated;
