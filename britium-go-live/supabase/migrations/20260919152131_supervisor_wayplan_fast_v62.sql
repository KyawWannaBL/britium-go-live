-- V62: fast Supervisor Wayplan list/detail split to avoid statement timeout.

create index if not exists be_wayplan_dispatch_stops_wayplan_idx
  on public.be_wayplan_dispatch_stops(wayplan_id, stop_sequence);

create index if not exists be_wayplan_dispatch_stops_wayplan_status_idx
  on public.be_wayplan_dispatch_stops(wayplan_id, stop_status);

create index if not exists be_data_entry_parcel_details_delivery_way_idx
  on public.be_data_entry_parcel_details(delivery_way_id);

create or replace function public.be_wayplan_supervisor_list_v62()
returns jsonb
language sql
stable
security definer
set search_path='public'
as $function$
with rows as (
  select
    d.wayplan_id,
    d.wayplan_status,
    d.total_stops,
    d.total_parcels,
    d.vehicle_code,
    d.vehicle_name,
    d.driver_code,
    d.driver_name,
    d.rider_code,
    d.rider_name,
    d.helper_code,
    d.helper_name,
    d.created_at,
    d.updated_at,
    coalesce(r.review_status,'DRAFT') as review_status,
    coalesce(r.revision_no,1) as revision_no,
    r.review_notes,
    r.rejection_reason,
    r.submitted_at,
    r.reviewed_at,
    r.dispatch_ready_at,
    r.dispatched_at,
    coalesce(m.parcel_count,0) as parcel_count,
    coalesce(m.planned_count,0) as planned_count,
    coalesce(m.ready_count,0) as ready_count,
    coalesce(m.dispatched_count,0) as dispatched_count,
    coalesce(m.held_count,0) as held_count
  from public.be_wayplan_dispatches d
  left join public.be_wayplan_review_v43 r on r.wayplan_id=d.wayplan_id
  left join lateral (
    select
      count(*)::integer as parcel_count,
      count(*) filter(where membership_status='PLANNED')::integer as planned_count,
      count(*) filter(where membership_status='READY_FOR_DISPATCH')::integer as ready_count,
      count(*) filter(where membership_status='DISPATCHED')::integer as dispatched_count,
      count(*) filter(where membership_status in ('ON_HOLD','RTO'))::integer as held_count
    from public.be_wayplan_membership_v40 m
    where m.wayplan_id=d.wayplan_id
      and m.membership_status not in ('CANCELLED','COMPLETED')
  ) m on true
  where upper(coalesce(d.wayplan_status,'')) not in ('CANCELLED')
    and coalesce(m.parcel_count,0)>0
)
select jsonb_build_object(
  'ok',true,
  'build','SUPERVISOR_WAYPLAN_V62_FAST_LIST',
  'stats',jsonb_build_object(
    'wayplans',count(*)::integer,
    'pending_review',count(*) filter(where review_status='PENDING_REVIEW')::integer,
    'approved',count(*) filter(where review_status='APPROVED')::integer,
    'dispatch_ready',count(*) filter(where review_status='DISPATCH_READY')::integer,
    'dispatched',count(*) filter(where review_status='DISPATCHED')::integer,
    'parcels',coalesce(sum(parcel_count),0)::integer
  ),
  'wayplans',coalesce(jsonb_agg(to_jsonb(rows) order by
    case review_status when 'PENDING_REVIEW' then 1 when 'DRAFT' then 2 when 'APPROVED' then 3 when 'DISPATCH_READY' then 4 when 'DISPATCHED' then 5 else 6 end,
    updated_at desc
  ),'[]'::jsonb)
)
from rows;
$function$;

create or replace function public.be_wayplan_supervisor_detail_v62(p_wayplan_id text)
returns jsonb
language sql
stable
security definer
set search_path='public'
as $function$
with header as (
  select
    d.wayplan_id,
    d.wayplan_status,
    d.vehicle_code,d.vehicle_name,
    d.driver_code,d.driver_name,
    d.rider_code,d.rider_name,
    d.helper_code,d.helper_name,
    coalesce(r.review_status,'DRAFT') as review_status,
    coalesce(r.revision_no,1) as revision_no,
    r.review_notes,r.rejection_reason,
    r.submitted_at,r.reviewed_at,r.dispatch_ready_at,r.dispatched_at
  from public.be_wayplan_dispatches d
  left join public.be_wayplan_review_v43 r on r.wayplan_id=d.wayplan_id
  where d.wayplan_id=p_wayplan_id
), stops as (
  select
    s.stop_sequence,
    s.delivery_way_id,
    coalesce(s.recipient_name,p.recipient_name) as recipient_name,
    coalesce(s.recipient_phone,p.contact_no_1,p.contact_no_2) as recipient_phone,
    coalesce(s.township,s.delivery_township,s.recipient_township,p.township) as township,
    coalesce(s.address,s.delivery_address,p.recipient_address) as recipient_address,
    coalesce(s.cod_amount,s.amount_to_collect,p.actual_collect,p.cod_amount,0) as cod_amount,
    coalesce(s.parcel_weight_kg,p.weight_kg,0) as weight_kg,
    coalesce(m.membership_status,'') as membership_status,
    coalesce(s.warehouse_status,p.warehouse_status,'') as warehouse_status,
    coalesce(s.scan_count,0) as scan_count,
    (coalesce(s.scan_count,0)>0) as dispatch_scanned
  from public.be_wayplan_dispatch_stops s
  left join public.be_wayplan_membership_v40 m
    on m.wayplan_id=s.wayplan_id and m.delivery_way_id=s.delivery_way_id
  left join public.be_data_entry_parcel_details p
    on p.delivery_way_id=s.delivery_way_id
  where s.wayplan_id=p_wayplan_id
), blocked as (
  select count(*)::integer as n
  from stops
  where membership_status in ('ON_HOLD','RTO')
     or upper(coalesce(warehouse_status,'')) not in ('WAREHOUSE_READY','READY_FOR_DISPATCH')
)
select jsonb_build_object(
  'ok',true,
  'build','SUPERVISOR_WAYPLAN_V62_FAST_DETAIL',
  'wayplan',coalesce((select to_jsonb(header) from header),'{}'::jsonb)
    || jsonb_build_object(
      'blocked_count',coalesce((select n from blocked),0),
      'parcel_count',(select count(*) from stops),
      'stops',coalesce((select jsonb_agg(to_jsonb(stops) order by stop_sequence,delivery_way_id) from stops),'[]'::jsonb)
    )
);
$function$;

grant execute on function public.be_wayplan_supervisor_list_v62() to authenticated;
grant execute on function public.be_wayplan_supervisor_detail_v62(text) to authenticated;
