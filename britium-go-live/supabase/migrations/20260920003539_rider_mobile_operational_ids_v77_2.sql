-- V77.2: Rider mobile visibility for consolidated-bulk internal IDs.
-- Keep internal delivery_way_id for integrity but display original operational D... Way ID.

create or replace function public.be_field_team_mobile_snapshot_v77(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_base jsonb:=public.be_field_team_mobile_snapshot(p_payload);
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_supplement jsonb:='[]'::jsonb;
  v_jobs jsonb;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501'; end if;

  select coalesce(jsonb_agg(job order by sort_at desc nulls last),'[]'::jsonb)
  into v_supplement
  from (
    select
      jsonb_strip_nulls(
        jsonb_build_object(
          'id',s.id,
          'pickup_id',s.delivery_way_id,
          'pickup_way_id',s.delivery_way_id,
          'delivery_way_id',s.delivery_way_id,
          'canonical_internal_delivery_way_id',s.delivery_way_id,
          'operational_way_id',public.be_operational_way_id_v70(s.delivery_way_id),
          'display_way_id',public.be_operational_way_id_v70(s.delivery_way_id),
          'source_waybill_no',public.be_operational_way_id_v70(s.delivery_way_id),
          'wayplan_id',s.wayplan_id,
          'waybill_no',public.be_operational_way_id_v70(s.delivery_way_id),
          'tracking_no',s.delivery_way_id,
          'parent_pickup_id',coalesce(d.pickup_id,s.pickup_id,m.pickup_id),
          'recipient_name',coalesce(d.recipient_name,s.recipient_name),
          'recipient_phone',coalesce(d.contact_no_1,s.recipient_phone),
          'township',coalesce(d.township,s.township),
          'delivery_address',coalesce(d.recipient_address,s.address),
          'address',coalesce(d.recipient_address,s.address),
          'item_price',d.item_price,
          'delivery_fee',coalesce(d.delivery_fee,s.delivery_fee),
          'cod_amount',coalesce(d.actual_collect,d.cod_amount,s.cod_amount,0),
          'rider_cod_amount',coalesce(d.actual_collect,d.cod_amount,s.cod_amount,0),
          'actual_collect',coalesce(d.actual_collect,d.cod_amount,s.cod_amount,0),
          'expected_parcels',1,
          'delivery_line_count',1,
          'status',st.mobile_status,
          'workflow_stage',st.mobile_status,
          'rider_status',st.mobile_status,
          'delivery_status',st.mobile_status,
          'dispatch_status',st.mobile_status,
          'mobile_status',st.mobile_status,
          'wayplan_status',coalesce(w.wayplan_status,m.membership_status),
          'assigned_rider_code',coalesce(m.rider_code,w.rider_code,s.rider_code),
          'assigned_driver_code',coalesce(m.driver_code,w.driver_code),
          'assigned_helper_code',coalesce(m.helper_code,w.helper_code),
          'mobile_role',v_role,
          'job_kind','DELIVERY',
          'is_delivery_job',true,
          'dispatch_scan_ready',ds.has_scan,
          'source','be_wayplan_dispatch_stops/RIDER_DELIVERY_MOBILE_V77_OPERATIONAL_ID',
          'updated_at',s.updated_at
        )
      ) job,
      s.updated_at sort_at
    from public.be_wayplan_dispatch_stops s
    join public.be_wayplan_dispatches w on w.wayplan_id=s.wayplan_id
    left join lateral(
      select mm.*
      from public.be_wayplan_membership_v40 mm
      where mm.wayplan_id=s.wayplan_id and mm.delivery_way_id=s.delivery_way_id
      order by mm.updated_at desc nulls last
      limit 1
    ) m on true
    join lateral(
      select dd.*
      from public.be_data_entry_parcel_details dd
      where dd.delivery_way_id=s.delivery_way_id
      order by dd.updated_at desc nulls last,dd.saved_at desc nulls last
      limit 1
    ) d on true
    cross join lateral(
      select exists(
        select 1
        from public.be_dispatch_scans_v39 x
        where x.delivery_way_id=s.delivery_way_id
          and x.scan_status='SCANNED'
          and (x.wayplan_code=s.wayplan_id or x.wayplan_code is null)
      ) has_scan
    ) ds
    cross join lateral(
      select case
        when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED') then 'DELIVERED'
        when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO') then 'DELIVERY_FAILED'
        when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))='ARRIVED_AT_CUSTOMER' then 'ARRIVED_AT_CUSTOMER'
        when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''))='OUT_FOR_DELIVERY' then 'OUT_FOR_DELIVERY'
        else 'READY_FOR_DELIVERY'
      end mobile_status
    ) st
    where s.delivery_way_id !~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
      and public.be_operational_way_id_v70(s.delivery_way_id) ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
      and (
        upper(coalesce(w.wayplan_status,'')) in ('DISPATCHED','LOADED_TO_VEHICLE','HANDOVER_TO_RIDER','OUT_FOR_DELIVERY','COMPLETED')
        or upper(coalesce(m.membership_status,''))='DISPATCHED'
      )
      and (ds.has_scan or st.mobile_status in ('DELIVERED','DELIVERY_FAILED'))
      and case v_role
        when 'rider' then upper(coalesce(m.rider_code,w.rider_code,s.rider_code,''))=v_code
        when 'driver' then upper(coalesce(m.driver_code,w.driver_code,''))=v_code
        when 'helper' then upper(coalesce(m.helper_code,w.helper_code,''))=v_code
        else false
      end
  ) q;

  select coalesce(jsonb_agg(job order by sort_at desc nulls last),'[]'::jsonb)
  into v_jobs
  from (
    select e job,nullif(e->>'updated_at','')::timestamptz sort_at
    from jsonb_array_elements(coalesce(v_base->'jobs','[]'::jsonb)) e
    union all
    select e job,nullif(e->>'updated_at','')::timestamptz sort_at
    from jsonb_array_elements(v_supplement) e
  ) z;

  return v_base||jsonb_build_object(
    'jobs',v_jobs,
    'source','be_field_team_mobile_snapshot_v77',
    'build','RIDER_MOBILE_OPERATIONAL_WAY_ID_V77_2',
    'counts',jsonb_build_object(
      'jobs',jsonb_array_length(v_jobs),
      'delivery_jobs',(select count(*) from jsonb_array_elements(v_jobs)e where coalesce(e->>'job_kind','PICKUP')='DELIVERY'),
      'supplemented_legacy_internal_delivery_ids',jsonb_array_length(v_supplement),
      'notifications',jsonb_array_length(coalesce(v_base->'notifications','[]'::jsonb))
    )
  );
end;
$function$;

grant execute on function public.be_field_team_mobile_snapshot_v77(jsonb) to authenticated;
