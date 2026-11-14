-- V153: complete Warehouse Dispatch Scan -> Rider assignment handoff.
-- 1) Accept current finance validation statuses VALID and OK.
-- 2) Auto-publish a Supervisor-released Wayplan when its final mandatory Dispatch Scan completes.
-- 3) Populate field-team email identity and issue a targeted Rider notification.
-- 4) Heal already-scanned DISPATCH_READY Wayplans that were stranded in CREATED state.

do $patch_integrity$
declare
  v_def text;
  v_old text := 'upper(coalesce(d.financial_validation_status,''''))=''VALID''';
  v_new text := 'upper(coalesce(d.financial_validation_status,'''')) in (''VALID'',''OK'')';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_dispatch_wayplan_integrity_v12_11'
  limit 1;

  if v_def is null then raise exception 'be_dispatch_wayplan_integrity_v12_11 not found'; end if;
  if position(v_old in v_def)=0 then
    raise exception 'Dispatch integrity finance anchor changed; V153 stopped safely';
  end if;

  v_def:=replace(v_def,v_old,v_new);
  v_def:=replace(v_def,'DISPATCH_WAYPLAN_INTEGRITY_V12_11_20260901','DISPATCH_WAYPLAN_INTEGRITY_V153_VALID_OK');
  execute v_def;
end
$patch_integrity$;

create or replace function public.be_dispatch_autofinalize_rider_handoff_v153(
  p_wayplan_id text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_wayplan text:=nullif(btrim(coalesce(p_wayplan_id,'')),'');
  v_actor text:=coalesce(nullif(btrim(coalesce(p_actor_email,'')),''),'warehouse-dispatch@britiumexpress.com');
  v_review_status text;
  v_wayplan_status text;
  v_rider_code text;
  v_rider_name text;
  v_driver_code text;
  v_helper_code text;
  v_rider_email text;
  v_driver_email text;
  v_helper_email text;
  v_total integer:=0;
  v_ready integer:=0;
  v_scanned integer:=0;
  v_integrity jsonb;
  v_way_ids text[];
begin
  if v_wayplan is null then
    return jsonb_build_object('ok',false,'error','WAYPLAN_ID_REQUIRED');
  end if;

  select upper(coalesce(w.wayplan_status,'')),
         nullif(upper(btrim(coalesce(w.rider_code,''))),''),
         nullif(btrim(coalesce(w.rider_name,'')),''),
         nullif(upper(btrim(coalesce(w.driver_code,''))),''),
         nullif(upper(btrim(coalesce(w.helper_code,''))),'')
    into v_wayplan_status,v_rider_code,v_rider_name,v_driver_code,v_helper_code
  from public.be_wayplan_dispatches w
  where w.wayplan_id=v_wayplan
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','WAYPLAN_NOT_FOUND','wayplan_id',v_wayplan);
  end if;

  if v_wayplan_status='DISPATCHED' then
    return jsonb_build_object('ok',true,'already_dispatched',true,'wayplan_id',v_wayplan,'build','RIDER_HANDOFF_V153');
  end if;

  select upper(coalesce(r.review_status,'')) into v_review_status
  from public.be_wayplan_review_v43 r
  where r.wayplan_id=v_wayplan
  for update;

  if v_review_status<>'DISPATCH_READY' then
    return jsonb_build_object('ok',false,'deferred',true,'error','SUPERVISOR_RELEASE_REQUIRED','wayplan_id',v_wayplan,'review_status',v_review_status);
  end if;

  select array_agg(m.delivery_way_id order by m.delivery_way_id),
         count(*)::integer,
         count(*) filter(where m.membership_status='READY_FOR_DISPATCH')::integer
    into v_way_ids,v_total,v_ready
  from public.be_wayplan_membership_v40 m
  where m.wayplan_id=v_wayplan
    and m.membership_status not in ('CANCELLED','COMPLETED','RTO');

  if coalesce(v_total,0)=0 or v_ready<>v_total then
    return jsonb_build_object('ok',false,'deferred',true,'error','MEMBERSHIP_NOT_READY','wayplan_id',v_wayplan,'ready',v_ready,'total',v_total);
  end if;

  select count(distinct s.delivery_way_id)::integer into v_scanned
  from public.be_dispatch_scans_v39 s
  where s.wayplan_code=v_wayplan
    and s.scan_status='SCANNED'
    and s.delivery_way_id=any(v_way_ids);

  if v_scanned<>v_total then
    return jsonb_build_object('ok',false,'deferred',true,'error','DISPATCH_SCAN_INCOMPLETE','wayplan_id',v_wayplan,'scanned',v_scanned,'total',v_total);
  end if;

  v_integrity:=public.be_dispatch_wayplan_integrity_v12_11(v_wayplan,null,null,null);
  if not coalesce((v_integrity->>'ok')::boolean,false) then
    return jsonb_build_object('ok',false,'deferred',true,'error','INTEGRITY_BLOCKED','wayplan_id',v_wayplan,'integrity',v_integrity);
  end if;

  select lower(coalesce(a.email,a.user_email))
    into v_rider_email
  from public.be_mobile_workforce_accounts a
  where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.rider_code,'')))=v_rider_code
    and coalesce(a.active,true) and coalesce(a.is_active,true)
  order by a.updated_at desc nulls last
  limit 1;

  select lower(coalesce(a.email,a.user_email))
    into v_driver_email
  from public.be_mobile_workforce_accounts a
  where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.driver_code,'')))=v_driver_code
    and coalesce(a.active,true) and coalesce(a.is_active,true)
  order by a.updated_at desc nulls last
  limit 1;

  select lower(coalesce(a.email,a.user_email))
    into v_helper_email
  from public.be_mobile_workforce_accounts a
  where upper(coalesce(nullif(a.worker_code,''),nullif(a.workforce_code,''),nullif(a.account_code,''),nullif(a.helper_code,'')))=v_helper_code
    and coalesce(a.active,true) and coalesce(a.is_active,true)
  order by a.updated_at desc nulls last
  limit 1;

  update public.be_wayplan_dispatches
     set wayplan_status='DISPATCHED',
         dispatched_at=coalesce(dispatched_at,now()),
         updated_at=now(),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
           'rider_handoff_v153',true,
           'auto_published_after_final_dispatch_scan',true,
           'publish_actor',v_actor,
           'published_at',now()
         )
   where wayplan_id=v_wayplan;

  update public.be_wayplan_dispatch_stops
     set stop_status=case when upper(coalesce(stop_status,'')) in ('DELIVERED','FAILED_DELIVERY','RETURN_TO_WAREHOUSE','RTO') then stop_status else 'DISPATCHED' end,
         dispatch_status=case when upper(coalesce(dispatch_status,'')) in ('DELIVERED','FAILED_DELIVERY','RETURN_TO_WAREHOUSE','RTO') then dispatch_status else 'DISPATCHED' end,
         rider_status=case when upper(coalesce(rider_status,'')) in ('DELIVERED','DELIVERY_FAILED','RTO','OUT_FOR_DELIVERY') then rider_status else 'PENDING' end,
         updated_at=now(),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_handoff_v153',true,'published_at',now())
   where wayplan_id=v_wayplan;

  update public.be_wayplan_membership_v40
     set membership_status='DISPATCHED',
         updated_at=now(),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('published_to_rider',true,'rider_handoff_v153',true,'published_at',now())
   where wayplan_id=v_wayplan and membership_status='READY_FOR_DISPATCH';

  update public.be_wayplan_review_v43
     set review_status='DISPATCHED',
         dispatched_at=coalesce(dispatched_at,now()),
         updated_at=now()
   where wayplan_id=v_wayplan;

  update public.be_waybill_ledger
     set dispatch_status='DISPATCHED',
         wayplan_status='DISPATCHED',
         updated_at=now(),
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_handoff_v153',true,'published_at',now())
   where wayplan_id=v_wayplan or delivery_way_id=any(v_way_ids);

  insert into public.be_dispatch_job_assignments(
    tracking_no,wayplan_code,asset_code,delivery_status,dispatch_status,
    published_to_rider,published_at,assigned_by_email,updated_by_email,
    created_at,updated_at,dispatch_scan_at,rider_email,driver_email,helper_email
  )
  select
    public.be_operational_way_id_v70(m.delivery_way_id),
    v_wayplan,
    coalesce(nullif(m.vehicle_code,''),nullif(w.vehicle_code,''),'UNASSIGNED'),
    'PENDING',
    'OUT_FOR_DELIVERY',
    true,
    now(),
    v_actor,
    v_actor,
    now(),
    now(),
    now(),
    v_rider_email,
    v_driver_email,
    v_helper_email
  from public.be_wayplan_membership_v40 m
  join public.be_wayplan_dispatches w on w.wayplan_id=m.wayplan_id
  where m.wayplan_id=v_wayplan
    and m.membership_status='DISPATCHED'
  on conflict(tracking_no) do update set
    wayplan_code=excluded.wayplan_code,
    asset_code=excluded.asset_code,
    dispatch_status='OUT_FOR_DELIVERY',
    published_to_rider=true,
    published_at=coalesce(public.be_dispatch_job_assignments.published_at,excluded.published_at),
    updated_by_email=excluded.updated_by_email,
    updated_at=now(),
    dispatch_scan_at=coalesce(public.be_dispatch_job_assignments.dispatch_scan_at,excluded.dispatch_scan_at),
    rider_email=coalesce(excluded.rider_email,public.be_dispatch_job_assignments.rider_email),
    driver_email=coalesce(excluded.driver_email,public.be_dispatch_job_assignments.driver_email),
    helper_email=coalesce(excluded.helper_email,public.be_dispatch_job_assignments.helper_email);

  if v_rider_code is not null then
    insert into public.be_app_notifications(
      target_role,target_branch,title,message,is_read,created_at,
      source_table,source_key,notification_type,metadata,body,
      target_user_code,target_email,target_workforce_code,target_user_email,
      category,status,payload,event_type,event_key,recipient_role,recipient_email,
      entity_type,entity_id,priority
    )
    values(
      'rider','YGN',
      'New delivery Wayplan assigned',
      coalesce(v_rider_name,v_rider_code)||' · '||v_wayplan||' is ready for delivery.',
      false,now(),
      'be_wayplan_dispatches',v_wayplan,'RIDER_DELIVERY_WAYPLAN_ASSIGNED',
      jsonb_build_object('wayplan_id',v_wayplan,'rider_code',v_rider_code,'parcel_count',v_total,'source','RIDER_HANDOFF_V153'),
      v_wayplan||' · '||v_total||' parcel(s) are assigned and ready in Rider App.',
      v_rider_code,v_rider_email,v_rider_code,v_rider_email,
      'DELIVERY','UNREAD',
      jsonb_build_object('wayplan_id',v_wayplan,'rider_code',v_rider_code,'parcel_count',v_total),
      'RIDER_DELIVERY_WAYPLAN_ASSIGNED',
      'RIDER_DELIVERY_WAYPLAN_ASSIGNED:'||v_wayplan||':'||v_rider_code,
      'rider',v_rider_email,'WAYPLAN',v_wayplan,'HIGH'
    )
    on conflict(event_key) do update set
      target_user_code=excluded.target_user_code,
      target_email=excluded.target_email,
      target_workforce_code=excluded.target_workforce_code,
      target_user_email=excluded.target_user_email,
      message=excluded.message,
      body=excluded.body,
      metadata=excluded.metadata,
      payload=excluded.payload,
      status='UNREAD',
      is_read=false,
      read_at=null;
  end if;

  insert into public.be_wayplan_events_v40(wayplan_id,event_type,actor_email,payload)
  values(
    v_wayplan,'RIDER_HANDOFF_AUTO_PUBLISHED_V153',v_actor,
    jsonb_build_object(
      'parcel_count',v_total,
      'rider_code',v_rider_code,
      'rider_email',v_rider_email,
      'driver_code',v_driver_code,
      'driver_email',v_driver_email,
      'helper_code',v_helper_code,
      'helper_email',v_helper_email,
      'integrity',v_integrity
    )
  );

  return jsonb_build_object(
    'ok',true,
    'wayplan_id',v_wayplan,
    'wayplan_status','DISPATCHED',
    'review_status','DISPATCHED',
    'published_rows',v_total,
    'rider_code',v_rider_code,
    'rider_email',v_rider_email,
    'notification_created',v_rider_code is not null,
    'visible_to_rider_app',true,
    'build','RIDER_HANDOFF_V153'
  );
end
$function$;

create or replace function public.be_dispatch_scan_autofinalize_trigger_v153()
returns trigger
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_result jsonb;
begin
  if new.scan_status='SCANNED' and nullif(btrim(coalesce(new.wayplan_code,'')),'') is not null then
    v_result:=public.be_dispatch_autofinalize_rider_handoff_v153(
      new.wayplan_code,
      coalesce(auth.jwt()->>'email','warehouse-dispatch@britiumexpress.com')
    );
  end if;
  return new;
end
$function$;

drop trigger if exists trg_dispatch_scan_autofinalize_rider_v153 on public.be_dispatch_scans_v39;
create trigger trg_dispatch_scan_autofinalize_rider_v153
after insert or update of scan_status on public.be_dispatch_scans_v39
for each row
when (new.scan_status='SCANNED')
execute function public.be_dispatch_scan_autofinalize_trigger_v153();

revoke execute on function public.be_dispatch_autofinalize_rider_handoff_v153(text,text) from public,anon;
grant execute on function public.be_dispatch_autofinalize_rider_handoff_v153(text,text) to authenticated,service_role;

-- Heal already-stranded Wayplans that satisfy the same strict V153 conditions.
do $heal$
declare
  r record;
  v_result jsonb;
begin
  for r in
    select w.wayplan_id
    from public.be_wayplan_dispatches w
    join public.be_wayplan_review_v43 rv on rv.wayplan_id=w.wayplan_id
    where upper(coalesce(w.wayplan_status,''))<>'DISPATCHED'
      and upper(coalesce(rv.review_status,''))='DISPATCH_READY'
  loop
    v_result:=public.be_dispatch_autofinalize_rider_handoff_v153(r.wayplan_id,'v153-recovery@britiumexpress.com');
  end loop;
end
$heal$;

comment on function public.be_dispatch_autofinalize_rider_handoff_v153(text,text)
is 'V153: after final mandatory Dispatch Scan, auto-publishes a Supervisor DISPATCH_READY Wayplan, synchronizes field-team identities, and notifies the assigned Rider.';
