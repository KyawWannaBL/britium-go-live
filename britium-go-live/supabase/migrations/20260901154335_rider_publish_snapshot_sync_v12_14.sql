create or replace function public.be_dispatch_publish_wayplan_v41(p_wayplan_id text,p_actor_email text default null::text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_wayplan text:=nullif(btrim(coalesce(p_wayplan_id,'')),'');
  v_actor text:=public.be_dispatch_actor_v41(p_actor_email);
  v_way_ids text[];
  v_count integer:=0;
  v_ready integer:=0;
  v_dispatched integer:=0;
  v_scanned integer:=0;
  v_result jsonb;
  v_integrity jsonb;
begin
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;

  perform 1 from public.be_wayplan_membership_v40 where wayplan_id=v_wayplan for update;

  select array_agg(delivery_way_id order by delivery_way_id),
         count(*)::integer,
         count(*) filter(where membership_status='READY_FOR_DISPATCH')::integer,
         count(*) filter(where membership_status='DISPATCHED')::integer
    into v_way_ids,v_count,v_ready,v_dispatched
  from public.be_wayplan_membership_v40
  where wayplan_id=v_wayplan
    and membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED','ON_HOLD','RTO');

  if coalesce(v_count,0)=0 then raise exception 'Wayplan % has no V40 parcel membership',v_wayplan; end if;

  if v_dispatched=v_count then
    -- Self-heal any legacy publication that dispatched membership but left the dispatch header stale.
    update public.be_wayplan_dispatches
       set wayplan_status='DISPATCHED',dispatched_at=coalesce(dispatched_at,now()),updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('v12_14_publish_sync',true,'publish_actor',v_actor,'publish_synced_at',now())
     where wayplan_id=v_wayplan and upper(coalesce(wayplan_status,''))<>'DISPATCHED';
    update public.be_wayplan_dispatch_stops
       set stop_status=case when upper(coalesce(stop_status,'')) in ('DELIVERED','FAILED_DELIVERY','RETURN_TO_WAREHOUSE','RTO') then stop_status else 'DISPATCHED' end,
           dispatch_status=case when upper(coalesce(dispatch_status,'')) in ('DELIVERED','FAILED_DELIVERY','RETURN_TO_WAREHOUSE','RTO') then dispatch_status else 'DISPATCHED' end,
           rider_status=case when upper(coalesce(rider_status,'')) in ('DELIVERED','DELIVERY_FAILED','RTO','OUT_FOR_DELIVERY') then rider_status else 'PENDING' end,
           updated_at=now()
     where wayplan_id=v_wayplan;
    return jsonb_build_object('ok',true,'duplicate',true,'wayplan_id',v_wayplan,'published_rows',v_count,'membership_status','DISPATCHED','dispatch_header_synced',true,'message',format('%s is already dispatched',v_wayplan));
  end if;

  if v_ready<>v_count then raise exception 'Wayplan % is not fully READY_FOR_DISPATCH (% of % rows ready)',v_wayplan,v_ready,v_count; end if;

  select count(*)::integer into v_scanned
  from public.be_dispatch_scans_v39 s
  where s.delivery_way_id=any(v_way_ids) and s.scan_status='SCANNED' and s.wayplan_code=v_wayplan;
  if v_scanned<>v_count then raise exception 'Publish blocked. % of % parcels still require mandatory Dispatch scanning',v_count-v_scanned,v_count; end if;

  v_integrity:=public.be_dispatch_wayplan_integrity_v12_11(v_wayplan,null,null,null);
  if not coalesce((v_integrity->>'ok')::boolean,false) then
    raise exception 'Publish blocked by integrity guard: %',v_integrity->'issues';
  end if;

  v_result:=public.be_publish_wayplan_with_dispatch_scan_v39(v_wayplan,v_way_ids,v_actor);

  -- Synchronize the canonical mobile-delivery tables in the same transaction.
  update public.be_wayplan_dispatches
     set wayplan_status='DISPATCHED',
         dispatched_at=coalesce(dispatched_at,now()),
         updated_at=now(),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('v12_14_publish_sync',true,'publish_actor',v_actor,'publish_synced_at',now())
   where wayplan_id=v_wayplan;

  update public.be_wayplan_dispatch_stops
     set stop_status='DISPATCHED',dispatch_status='DISPATCHED',
         rider_status=case when upper(coalesce(rider_status,'')) in ('DELIVERED','DELIVERY_FAILED','RTO','OUT_FOR_DELIVERY') then rider_status else 'PENDING' end,
         updated_at=now(),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('v12_14_publish_sync',true,'publish_actor',v_actor,'publish_synced_at',now())
   where wayplan_id=v_wayplan
     and upper(coalesce(stop_status,'')) not in ('DELIVERED','FAILED_DELIVERY','RETURN_TO_WAREHOUSE','RTO');

  update public.be_waybill_ledger
     set dispatch_status='DISPATCHED',wayplan_status='DISPATCHED',updated_at=now(),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('v12_14_publish_sync',true,'publish_actor',v_actor,'publish_synced_at',now())
   where wayplan_id=v_wayplan or delivery_way_id=any(v_way_ids);

  update public.be_wayplan_membership_v40
     set membership_status='DISPATCHED',updated_at=now(),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('v12_14_publish_sync',true,'publish_actor',v_actor,'publish_synced_at',now())
   where wayplan_id=v_wayplan and membership_status='READY_FOR_DISPATCH';

  insert into public.be_wayplan_events_v40(wayplan_id,event_type,actor_email,payload)
  values(v_wayplan,'WAYPLAN_PUBLISHED_AFTER_MANDATORY_SCAN_V12_14',v_actor,
         jsonb_build_object('parcel_count',v_count,'way_ids',to_jsonb(v_way_ids),'publish_result',v_result,'integrity',v_integrity,'dispatch_header_synced',true));

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'ok',true,'wayplan_id',v_wayplan,'published_rows',v_count,'membership_status','DISPATCHED',
    'dispatch_header_synced',true,'mobile_delivery_ready',true,'next_step','Assigned Rider receives the route in Rider App');
end;
$$;

-- Snapshot compatibility: use V40 dispatched membership as a fallback if a legacy header ever lags.
create or replace function public.be_field_team_mobile_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_uid text:=v_identity->>'auth_user_id';
  v_code text:=upper(v_identity->>'worker_code');
  v_email text:=lower(coalesce(v_identity->>'email',''));
  v_role text:=lower(v_identity->>'role');
  v_jobs jsonb:='[]'::jsonb;
  v_notifications jsonb:='[]'::jsonb;
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
      'id',s.id,'pickup_id',s.delivery_way_id,'canonical_pickup_id',s.delivery_way_id,
      'parent_pickup_id',coalesce(d.pickup_id,s.pickup_id,m.pickup_id),'pickup_way_id',s.delivery_way_id,
      'delivery_way_id',s.delivery_way_id,'wayplan_id',s.wayplan_id,'waybill_no',coalesce(s.waybill_no,wl.waybill_no),
      'invoice_no',coalesce(s.invoice_no,wl.invoice_no),'tracking_no',s.delivery_way_id,
      'recipient_name',coalesce(d.recipient_name,s.recipient_name,wl.recipient_name),
      'recipient_phone',coalesce(d.contact_no_1,s.recipient_phone,wl.recipient_phone),
      'township',coalesce(d.township,s.township,wl.township),
      'delivery_address',coalesce(d.recipient_address,s.address,wl.recipient_address),'address',coalesce(d.recipient_address,s.address,wl.recipient_address),
      'item_price',d.item_price,'delivery_charges',d.delivery_charges,'delivery_fee',coalesce(d.delivery_fee,s.delivery_fee,wl.delivery_fee),
      'rider_cod_amount',coalesce(d.actual_collect,d.cod_amount,s.cod_amount,wl.cod_amount,0),'cod_amount',coalesce(d.actual_collect,d.cod_amount,s.cod_amount,wl.cod_amount,0),'actual_collect',coalesce(d.actual_collect,d.cod_amount,s.cod_amount,wl.cod_amount,0),
      'expected_parcels',1,'delivery_line_count',1,'status',st.mobile_status,'pickup_status',st.mobile_status,'workflow_stage',st.mobile_status,
      'rider_app_stage',st.mobile_status,'rider_status',st.mobile_status,'delivery_status',st.mobile_status,'dispatch_status',st.mobile_status,'mobile_status',st.mobile_status,
      'warehouse_status','WAREHOUSE_ACCEPTED','wayplan_status',coalesce(w.wayplan_status,m.membership_status),
      'finance_status',coalesce(d.finance_status,s.finance_status,wl.finance_status),
      'rider_proof_url',coalesce(s.rider_proof_url,s.proof_url,wl.rider_proof_url),'proof_url',coalesce(s.rider_proof_url,s.proof_url,wl.rider_proof_url),
      'delivered_at',coalesce(s.delivered_at,wl.delivered_at),'failed_reason',coalesce(s.failed_reason,wl.failed_reason),
      'assigned_rider_code',coalesce(m.rider_code,w.rider_code,s.rider_code),'assigned_driver_code',coalesce(m.driver_code,w.driver_code),'assigned_helper_code',coalesce(m.helper_code,w.helper_code),
      'mobile_role',v_role,'job_kind','DELIVERY','is_delivery_job',true,'dispatch_scan_ready',ds.has_scan,
      'source','be_wayplan_dispatch_stops/RIDER_DELIVERY_MOBILE_V12_14','updated_at',s.updated_at
    )) as job,s.updated_at as sort_at
    from public.be_wayplan_dispatch_stops s
    join public.be_wayplan_dispatches w on w.wayplan_id=s.wayplan_id
    left join lateral(select mm.* from public.be_wayplan_membership_v40 mm where mm.wayplan_id=s.wayplan_id and mm.delivery_way_id=s.delivery_way_id order by mm.updated_at desc nulls last limit 1)m on true
    join lateral(select dd.* from public.be_data_entry_parcel_details dd where dd.delivery_way_id=s.delivery_way_id order by dd.updated_at desc nulls last,dd.saved_at desc nulls last limit 1)d on true
    left join lateral(select ll.* from public.be_waybill_ledger ll where ll.delivery_way_id=s.delivery_way_id or ll.tracking_no=s.delivery_way_id order by ll.updated_at desc nulls last limit 1)wl on true
    cross join lateral(select exists(select 1 from public.be_dispatch_scans_v39 x where x.delivery_way_id=s.delivery_way_id and x.scan_status='SCANNED' and (x.wayplan_code=s.wayplan_id or x.wayplan_code is null)) as has_scan)ds
    cross join lateral(select case
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED') then 'DELIVERED'
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO') then 'DELIVERY_FAILED'
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('OUT_FOR_DELIVERY','ARRIVED_AT_CUSTOMER') then 'OUT_FOR_DELIVERY'
      else 'READY_FOR_DELIVERY' end as mobile_status)st
    where s.delivery_way_id~'^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
      and (upper(coalesce(w.wayplan_status,'')) in ('DISPATCHED','LOADED_TO_VEHICLE','HANDOVER_TO_RIDER','OUT_FOR_DELIVERY','COMPLETED') or upper(coalesce(m.membership_status,''))='DISPATCHED')
      and (ds.has_scan or st.mobile_status in ('DELIVERED','DELIVERY_FAILED'))
      and case v_role
        when 'rider' then upper(coalesce(m.rider_code,w.rider_code,s.rider_code,''))=v_code
        when 'driver' then upper(coalesce(m.driver_code,w.driver_code,''))=v_code
        when 'helper' then upper(coalesce(m.helper_code,w.helper_code,''))=v_code
        else false end
  )q;

  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc),'[]'::jsonb) into v_notifications
  from public.be_app_notifications n
  where coalesce(n.target_user_id,'')=v_uid or (v_code<>'' and upper(coalesce(n.target_workforce_code,''))=v_code) or (v_email<>'' and lower(coalesce(n.recipient_email,n.target_email,''))=v_email);

  return jsonb_build_object('ok',true,'source','be_field_team_mobile_snapshot_delivery_v12_14_20260901','identity',v_identity,'jobs',v_jobs,'notifications',v_notifications,
    'counts',jsonb_build_object('jobs',jsonb_array_length(v_jobs),'pickup_jobs',(select count(*) from jsonb_array_elements(v_jobs)e where coalesce(e->>'job_kind','PICKUP')='PICKUP'),'delivery_jobs',(select count(*) from jsonb_array_elements(v_jobs)e where e->>'job_kind'='DELIVERY'),'notifications',jsonb_array_length(v_notifications),'unread',(select count(*) from jsonb_array_elements(v_notifications)e where coalesce((e->>'is_read')::boolean,false)=false)));
end;
$$;

revoke all on function public.be_field_team_mobile_snapshot(jsonb) from public,anon;
grant execute on function public.be_field_team_mobile_snapshot(jsonb) to authenticated;;
