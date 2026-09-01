create or replace function public.be_field_team_mobile_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity jsonb := public.be_current_field_team_identity();
  v_uid text := v_identity->>'auth_user_id';
  v_code text := upper(v_identity->>'worker_code');
  v_email text := lower(coalesce(v_identity->>'email',''));
  v_role text := lower(v_identity->>'role');
  v_jobs jsonb := '[]'::jsonb;
  v_notifications jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(q.job order by q.sort_at desc nulls last),'[]'::jsonb) into v_jobs
  from (
    select to_jsonb(p)||jsonb_build_object(
      'mobile_role',v_role,
      'mobile_status',public.be_field_team_mobile_pickup_status(p.pickup_status,p.workflow_stage,p.rider_app_stage,p.warehouse_status,case v_role when 'driver' then p.driver_status when 'helper' then p.helper_status else p.rider_status end),
      'job_kind','PICKUP','is_delivery_job',false
    ) as job,p.updated_at as sort_at
    from public.be_portal_pickup_requests p
    where case v_role
      when 'driver' then coalesce(p.assigned_driver_id::text,'')=v_uid or upper(coalesce(p.assigned_driver_code,''))=v_code or lower(coalesce(p.assigned_driver_email,''))=v_email
      when 'helper' then coalesce(p.assigned_helper_id::text,'')=v_uid or upper(coalesce(p.assigned_helper_code,''))=v_code or lower(coalesce(p.assigned_helper_email,''))=v_email
      else coalesce(p.assigned_rider_id::text,'')=v_uid or upper(coalesce(p.assigned_rider_code,''))=v_code or lower(coalesce(p.assigned_rider_email,''))=v_email end

    union all

    select jsonb_strip_nulls(jsonb_build_object(
      'id',s.id,
      'pickup_id',s.delivery_way_id,
      'canonical_pickup_id',s.delivery_way_id,
      'parent_pickup_id',coalesce(d.pickup_id,s.pickup_id,m.pickup_id),
      'pickup_way_id',s.delivery_way_id,
      'delivery_way_id',s.delivery_way_id,
      'wayplan_id',s.wayplan_id,
      'waybill_no',coalesce(s.waybill_no,wl.waybill_no),
      'invoice_no',coalesce(s.invoice_no,wl.invoice_no),
      'tracking_no',s.delivery_way_id,
      'recipient_name',coalesce(d.recipient_name,s.recipient_name,wl.recipient_name),
      'recipient_phone',coalesce(d.contact_no_1,s.recipient_phone,wl.recipient_phone),
      'township',coalesce(d.township,s.township,wl.township),
      'delivery_address',coalesce(d.recipient_address,s.address,wl.recipient_address),
      'address',coalesce(d.recipient_address,s.address,wl.recipient_address),
      'item_price',d.item_price,
      'delivery_charges',d.delivery_charges,
      'delivery_fee',coalesce(d.delivery_fee,s.delivery_fee,wl.delivery_fee),
      'rider_cod_amount',coalesce(d.actual_collect,d.cod_amount,s.cod_amount,wl.cod_amount,0),
      'cod_amount',coalesce(d.actual_collect,d.cod_amount,s.cod_amount,wl.cod_amount,0),
      'actual_collect',coalesce(d.actual_collect,d.cod_amount,s.cod_amount,wl.cod_amount,0),
      'expected_parcels',1,'delivery_line_count',1,
      'status',st.mobile_status,'pickup_status',st.mobile_status,'workflow_stage',st.mobile_status,'rider_app_stage',st.mobile_status,'rider_status',st.mobile_status,'delivery_status',st.mobile_status,'dispatch_status',st.mobile_status,'mobile_status',st.mobile_status,
      'warehouse_status','WAREHOUSE_ACCEPTED','wayplan_status',w.wayplan_status,
      'finance_status',coalesce(d.finance_status,s.finance_status,wl.finance_status),
      'rider_proof_url',coalesce(s.rider_proof_url,s.proof_url,wl.rider_proof_url),'proof_url',coalesce(s.rider_proof_url,s.proof_url,wl.rider_proof_url),
      'delivered_at',coalesce(s.delivered_at,wl.delivered_at),'failed_reason',coalesce(s.failed_reason,wl.failed_reason),
      'assigned_rider_code',coalesce(m.rider_code,w.rider_code,s.rider_code),'assigned_driver_code',coalesce(m.driver_code,w.driver_code),'assigned_helper_code',coalesce(m.helper_code,w.helper_code),
      'mobile_role',v_role,'job_kind','DELIVERY','is_delivery_job',true,'dispatch_scan_ready',ds.has_scan,
      'source','be_wayplan_dispatch_stops/RIDER_DELIVERY_MOBILE_V12_10','updated_at',s.updated_at
    )) as job,s.updated_at as sort_at
    from public.be_wayplan_dispatch_stops s
    join public.be_wayplan_dispatches w on w.wayplan_id=s.wayplan_id
    left join lateral (select mm.* from public.be_wayplan_membership_v40 mm where mm.wayplan_id=s.wayplan_id and mm.delivery_way_id=s.delivery_way_id order by mm.updated_at desc nulls last limit 1) m on true
    join lateral (select dd.* from public.be_data_entry_parcel_details dd where dd.delivery_way_id=s.delivery_way_id order by dd.updated_at desc nulls last,dd.saved_at desc nulls last limit 1) d on true
    left join lateral (select ll.* from public.be_waybill_ledger ll where ll.delivery_way_id=s.delivery_way_id or ll.tracking_no=s.delivery_way_id order by ll.updated_at desc nulls last limit 1) wl on true
    cross join lateral (select exists(select 1 from public.be_dispatch_scans_v39 x where x.delivery_way_id=s.delivery_way_id and x.scan_status='SCANNED') as has_scan) ds
    cross join lateral (select case
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED') then 'DELIVERED'
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO') then 'DELIVERY_FAILED'
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('OUT_FOR_DELIVERY','ARRIVED_AT_CUSTOMER') then 'OUT_FOR_DELIVERY'
      else 'READY_FOR_DELIVERY' end as mobile_status) st
    where s.delivery_way_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
      and upper(coalesce(w.wayplan_status,'')) in ('DISPATCHED','LOADED_TO_VEHICLE','HANDOVER_TO_RIDER','OUT_FOR_DELIVERY','COMPLETED')
      and (ds.has_scan or st.mobile_status in ('DELIVERED','DELIVERY_FAILED'))
      and case v_role
        when 'rider' then upper(coalesce(m.rider_code,w.rider_code,s.rider_code,''))=v_code
        when 'driver' then upper(coalesce(m.driver_code,w.driver_code,''))=v_code
        when 'helper' then upper(coalesce(m.helper_code,w.helper_code,''))=v_code
        else false end
  ) q;

  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc),'[]'::jsonb) into v_notifications
  from public.be_app_notifications n
  where coalesce(n.target_user_id,'')=v_uid or (v_code<>'' and upper(coalesce(n.target_workforce_code,''))=v_code) or (v_email<>'' and lower(coalesce(n.recipient_email,n.target_email,''))=v_email);

  return jsonb_build_object('ok',true,'source','be_field_team_mobile_snapshot_delivery_v12_10_20260901','identity',v_identity,'jobs',v_jobs,'notifications',v_notifications,
    'counts',jsonb_build_object('jobs',jsonb_array_length(v_jobs),'pickup_jobs',(select count(*) from jsonb_array_elements(v_jobs) e where coalesce(e->>'job_kind','PICKUP')='PICKUP'),'delivery_jobs',(select count(*) from jsonb_array_elements(v_jobs) e where e->>'job_kind'='DELIVERY'),'notifications',jsonb_array_length(v_notifications),'unread',(select count(*) from jsonb_array_elements(v_notifications) e where coalesce((e->>'is_read')::boolean,false)=false)));
end;
$$;
revoke all on function public.be_field_team_mobile_snapshot(jsonb) from public;
revoke all on function public.be_field_team_mobile_snapshot(jsonb) from anon;
grant execute on function public.be_field_team_mobile_snapshot(jsonb) to authenticated;;
