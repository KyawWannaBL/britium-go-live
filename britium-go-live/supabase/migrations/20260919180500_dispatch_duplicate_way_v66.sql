-- V66: canonicalize duplicate printed Way IDs inside active Wayplans
-- and make Dispatch scanning automatically resolve to the active canonical parcel.

create table if not exists public.be_wayplan_duplicate_stop_archive_v66 (
  id uuid primary key default gen_random_uuid(),
  wayplan_id text not null,
  printed_way_id text not null,
  archived_delivery_way_id text not null,
  survivor_delivery_way_id text not null,
  archived_pickup_id text,
  survivor_pickup_id text,
  stop_snapshot jsonb,
  membership_snapshot jsonb,
  archived_at timestamptz not null default now(),
  reason text not null default 'DUPLICATE_PRINTED_WAY_ID_IN_ACTIVE_WAYPLAN',
  unique(wayplan_id, archived_delivery_way_id)
);

-- Rank duplicate active memberships. Exact printed D-way ID wins; otherwise newest parcel wins.
create temporary table _be_v66_duplicate_losers on commit drop as
with active_rows as (
  select
    m.wayplan_id,
    m.delivery_way_id,
    m.pickup_id as membership_pickup_id,
    m.membership_status,
    m.updated_at as membership_updated_at,
    d.pickup_id,
    d.recipient_name,
    d.contact_no_1,
    d.township,
    d.created_at,
    d.updated_at,
    coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as printed_way_id
  from public.be_wayplan_membership_v40 m
  join public.be_data_entry_parcel_details d
    on d.delivery_way_id=m.delivery_way_id
  join public.be_wayplan_dispatches w
    on w.wayplan_id=m.wayplan_id
  where m.membership_status in ('PLANNED','READY_FOR_DISPATCH')
    and upper(coalesce(w.wayplan_status,'')) not in ('DISPATCHED','COMPLETED','CANCELLED')
    and coalesce(d.parcel_status,'') <> 'duplicate_archived'
), ranked as (
  select a.*,
    row_number() over (
      partition by
        a.wayplan_id,
        upper(a.printed_way_id),
        lower(regexp_replace(coalesce(a.recipient_name,''),'\s+','','g')),
        regexp_replace(coalesce(a.contact_no_1,''),'[^0-9]','','g')
      order by
        case when upper(a.delivery_way_id)=upper(a.printed_way_id) then 0 else 1 end,
        a.updated_at desc nulls last,
        a.created_at desc nulls last,
        a.delivery_way_id
    ) as rn,
    first_value(a.delivery_way_id) over (
      partition by
        a.wayplan_id,
        upper(a.printed_way_id),
        lower(regexp_replace(coalesce(a.recipient_name,''),'\s+','','g')),
        regexp_replace(coalesce(a.contact_no_1,''),'[^0-9]','','g')
      order by
        case when upper(a.delivery_way_id)=upper(a.printed_way_id) then 0 else 1 end,
        a.updated_at desc nulls last,
        a.created_at desc nulls last,
        a.delivery_way_id
    ) as survivor_delivery_way_id,
    first_value(a.pickup_id) over (
      partition by
        a.wayplan_id,
        upper(a.printed_way_id),
        lower(regexp_replace(coalesce(a.recipient_name,''),'\s+','','g')),
        regexp_replace(coalesce(a.contact_no_1,''),'[^0-9]','','g')
      order by
        case when upper(a.delivery_way_id)=upper(a.printed_way_id) then 0 else 1 end,
        a.updated_at desc nulls last,
        a.created_at desc nulls last,
        a.delivery_way_id
    ) as survivor_pickup_id
  from active_rows a
)
select * from ranked where rn>1;

insert into public.be_wayplan_duplicate_stop_archive_v66(
  wayplan_id,printed_way_id,archived_delivery_way_id,survivor_delivery_way_id,
  archived_pickup_id,survivor_pickup_id,stop_snapshot,membership_snapshot
)
select
  l.wayplan_id,l.printed_way_id,l.delivery_way_id,l.survivor_delivery_way_id,
  l.pickup_id,l.survivor_pickup_id,
  (select to_jsonb(s) from public.be_wayplan_dispatch_stops s
    where s.wayplan_id=l.wayplan_id and s.delivery_way_id=l.delivery_way_id
    order by s.updated_at desc nulls last limit 1),
  (select to_jsonb(m) from public.be_wayplan_membership_v40 m
    where m.wayplan_id=l.wayplan_id and m.delivery_way_id=l.delivery_way_id
    order by m.updated_at desc nulls last limit 1)
from _be_v66_duplicate_losers l
on conflict(wayplan_id,archived_delivery_way_id) do nothing;

update public.be_wayplan_membership_v40 m
set membership_status='CANCELLED',
    metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
      'cancel_reason','DUPLICATE_PRINTED_WAY_ID_V66',
      'canonical_delivery_way_id',l.survivor_delivery_way_id,
      'cancelled_at',now()
    ),
    updated_at=now()
from _be_v66_duplicate_losers l
where m.wayplan_id=l.wayplan_id
  and m.delivery_way_id=l.delivery_way_id
  and m.membership_status in ('PLANNED','READY_FOR_DISPATCH');

delete from public.be_wayplan_dispatch_stops s
using _be_v66_duplicate_losers l
where s.wayplan_id=l.wayplan_id
  and s.delivery_way_id=l.delivery_way_id
  and s.loaded_to_vehicle_at is null
  and s.handed_over_to_rider_at is null
  and s.delivered_at is null;

-- Re-sequence remaining stops after duplicate removal.
with resequenced as (
  select id,
         row_number() over(partition by wayplan_id order by stop_sequence,id)::integer as new_seq
  from public.be_wayplan_dispatch_stops
  where wayplan_id in (select distinct wayplan_id from _be_v66_duplicate_losers)
)
update public.be_wayplan_dispatch_stops s
set stop_sequence=r.new_seq,
    delivery_sequence=r.new_seq,
    updated_at=now()
from resequenced r
where s.id=r.id;

update public.be_wayplan_dispatches w
set total_stops=x.stop_count,
    updated_at=now(),
    metadata=coalesce(w.metadata,'{}'::jsonb)||jsonb_build_object(
      'duplicate_way_cleanup_v66',true,
      'duplicate_way_cleanup_at',now()
    )
from (
  select wayplan_id,count(*)::integer as stop_count
  from public.be_wayplan_dispatch_stops
  where wayplan_id in (select distinct wayplan_id from _be_v66_duplicate_losers)
  group by wayplan_id
) x
where w.wayplan_id=x.wayplan_id;

-- Dispatch scanning: automatically resolve a printed Way ID to one active canonical parcel.
create or replace function public.be_warehouse_dispatch_scan_fast_v64(
  p_scan text,
  p_warehouse_code text default 'YGN-MAIN'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_raw text := btrim(coalesce(p_scan,''));
  v_lookup text;
  v_actor text;
  v_role text;
  v_way text;
  v_waybill text;
  v_pickup text;
  v_candidate_count integer:=0;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_role := public.be_warehouse_assert_internal();
  v_actor := public.be_warehouse_actor_email();

  if v_raw !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' then
    return jsonb_build_object('ok',false,'error','INVALID_SCAN','message','Invalid waybill code');
  end if;

  select coalesce(
    (
      select a.canonical_way_id
      from public.be_delivery_way_id_aliases_v33 a
      where upper(a.alias_way_id)=upper(v_raw)
      limit 1
    ),
    upper(v_raw)
  ) into v_lookup;

  -- Active Wayplan wins over all historical pickup copies.
  with candidates as (
    select
      d.delivery_way_id as canonical_id,
      d.pickup_id,
      coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as waybill_no,
      m.updated_at as membership_updated_at,
      d.updated_at,
      d.created_at,
      row_number() over (
        order by
          case when upper(d.delivery_way_id)=upper(v_raw) then 0
               when upper(d.delivery_way_id)=upper(v_lookup) then 1
               else 2 end,
          m.updated_at desc nulls last,
          d.updated_at desc nulls last,
          d.created_at desc nulls last,
          d.delivery_way_id
      ) as rn,
      count(*) over()::integer as candidate_count
    from public.be_wayplan_membership_v40 m
    join public.be_data_entry_parcel_details d
      on d.delivery_way_id=m.delivery_way_id
    join public.be_wayplan_dispatches w
      on w.wayplan_id=m.wayplan_id
    where m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
      and upper(coalesce(w.wayplan_status,'')) not in ('COMPLETED','CANCELLED')
      and coalesce(d.parcel_status,'') <> 'duplicate_archived'
      and (
        upper(d.delivery_way_id)=upper(v_raw)
        or upper(d.delivery_way_id)=upper(v_lookup)
        or upper(coalesce(d.financial_quote->>'source_waybill_no',''))=upper(v_raw)
      )
  )
  select canonical_id,pickup_id,waybill_no,candidate_count
  into v_way,v_pickup,v_waybill,v_candidate_count
  from candidates
  where rn=1;

  if v_way is null then
    -- No active Wayplan: choose one canonical current parcel, preferring exact printed ID.
    with candidates as (
      select
        d.delivery_way_id as canonical_id,
        d.pickup_id,
        coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as waybill_no,
        row_number() over (
          order by
            case when upper(d.delivery_way_id)=upper(v_raw) then 0
                 when upper(d.delivery_way_id)=upper(v_lookup) then 1
                 else 2 end,
            case when coalesce(d.parcel_status,'')='duplicate_archived' then 1 else 0 end,
            d.updated_at desc nulls last,
            d.created_at desc nulls last,
            d.delivery_way_id
        ) as rn,
        count(*) over()::integer as candidate_count
      from public.be_data_entry_parcel_details d
      where upper(d.delivery_way_id)=upper(v_lookup)
         or upper(d.delivery_way_id)=upper(v_raw)
         or upper(coalesce(d.financial_quote->>'source_waybill_no',''))=upper(v_raw)
    )
    select canonical_id,pickup_id,waybill_no,candidate_count
    into v_way,v_pickup,v_waybill,v_candidate_count
    from candidates
    where rn=1;
  end if;

  if v_way is null then
    return jsonb_build_object(
      'ok',false,'error','WAYBILL_NOT_FOUND','message','Waybill not found: '||v_raw,'scan',v_raw
    );
  end if;

  v_result := public.be_warehouse_dispatch_scan(
    v_way,
    v_actor,
    coalesce(nullif(p_warehouse_code,''),'YGN-MAIN')
  );

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'ok',true,
    'build','WAREHOUSE_DISPATCH_SCAN_CANONICAL_V66',
    'canonical_id',v_way,
    'pickup_id',v_pickup,
    'waybill_no',v_waybill,
    'display_id',v_waybill,
    'input_scan',v_raw,
    'resolved_candidate_count',v_candidate_count,
    'duplicate_auto_resolved',v_candidate_count>1,
    'actor_email',v_actor,
    'authorized_role',v_role
  );
end;
$function$;

grant execute on function public.be_warehouse_dispatch_scan_fast_v64(text,text) to authenticated;
