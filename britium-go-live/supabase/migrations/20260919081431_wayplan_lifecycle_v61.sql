-- V61: enforce the Wayplan lifecycle and repair the 67-stop pre-dispatch plan.
-- CREATED -> Supervisor review -> DISPATCH_READY -> physical scan -> DISPATCHED -> COMPLETED.
-- A Wayplan may not jump directly from CREATED/ON_HOLD to COMPLETED.

create or replace function public.be_wayplan_update_status(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_wayplan_id text:=nullif(p_payload->>'wayplan_id','');
  v_status text:=upper(coalesce(nullif(p_payload->>'status',''),''));
  v_actor text:=coalesce(nullif(p_payload->>'actor',''),'wayplan_command_center');
  v_check jsonb;
  v_wave_check jsonb;
  v_current_status text;
  v_dispatched_at timestamptz;
  v_active_stops integer:=0;
begin
  if auth.uid() is null and session_user<>'postgres' then
    raise exception 'Authenticated Wayplan operator is required';
  end if;
  if v_wayplan_id is null then
    return jsonb_build_object('ok',false,'error','wayplan_id is required');
  end if;
  if v_status not in ('CREATED','DISPATCHED','COMPLETED','ON_HOLD','CANCELLED') then
    return jsonb_build_object(
      'ok',false,'error','Invalid status',
      'allowed_statuses',jsonb_build_array('CREATED','DISPATCHED','COMPLETED','ON_HOLD','CANCELLED')
    );
  end if;

  select upper(coalesce(wayplan_status,'')),dispatched_at
    into v_current_status,v_dispatched_at
  from public.be_wayplan_dispatches
  where wayplan_id=v_wayplan_id;

  if not found then
    return jsonb_build_object('ok',false,'error','Wayplan not found','wayplan_id',v_wayplan_id);
  end if;

  if v_status='DISPATCHED' then
    v_wave_check:=public.be_multi_trip_dispatch_ready_v43(v_wayplan_id);
    if not coalesce((v_wave_check->>'ok')::boolean,false) then
      return jsonb_build_object(
        'ok',false,'error','MULTI_TRIP_WAVE_BLOCKED_V43',
        'wayplan_id',v_wayplan_id,'wave_guard',v_wave_check,
        'next_step','Complete or cancel the previous trip for this vehicle before dispatching the next wave.'
      );
    end if;

    v_check:=public.be_dispatch_wayplan_integrity_v12_11(v_wayplan_id,null,null,null);
    if not coalesce((v_check->>'ok')::boolean,false) then
      return jsonb_build_object(
        'ok',false,'error','DISPATCH_BLOCKED_V12_11',
        'wayplan_id',v_wayplan_id,'integrity',v_check,
        'next_step','Use Supervisor approval + mandatory Dispatch scan before publishing.'
      );
    end if;

    return public.be_dispatch_publish_wayplan_v43(v_wayplan_id,v_actor);
  end if;

  if v_status='COMPLETED' then
    if v_current_status<>'DISPATCHED' or v_dispatched_at is null then
      return jsonb_build_object(
        'ok',false,
        'error','PREMATURE_COMPLETE_BLOCKED_V61',
        'wayplan_id',v_wayplan_id,
        'current_status',v_current_status,
        'next_step','Supervisor approval, mandatory Dispatch scan, and actual Dispatch must happen before Complete.'
      );
    end if;

    select count(*)::integer
      into v_active_stops
    from public.be_wayplan_dispatch_stops
    where wayplan_id=v_wayplan_id
      and upper(coalesce(stop_status,'')) not in ('DELIVERED','COMPLETED','RTO','RETURN_TO_WAREHOUSE');

    if v_active_stops>0 then
      return jsonb_build_object(
        'ok',false,
        'error','WAYPLAN_NOT_FINISHED_V61',
        'wayplan_id',v_wayplan_id,
        'active_stops',v_active_stops,
        'next_step','Finish delivery/return outcomes for every dispatched stop before completing the Wayplan.'
      );
    end if;

    update public.be_wayplan_dispatches
    set wayplan_status='COMPLETED',
        completed_at=coalesce(completed_at,now()),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'last_action_actor',v_actor,
          'last_action_status','COMPLETED',
          'last_action_at',now(),
          'lifecycle_guard','V61'
        ),
        updated_at=now()
    where wayplan_id=v_wayplan_id;

    update public.be_wayplan_review_v43
    set updated_at=now()
    where wayplan_id=v_wayplan_id;

    return jsonb_build_object(
      'ok',true,'wayplan_id',v_wayplan_id,'status','COMPLETED',
      'lifecycle_guard','V61','active_stops',0
    );
  end if;

  if v_status='ON_HOLD' and v_current_status not in ('CREATED','DISPATCHED','ON_HOLD') then
    return jsonb_build_object(
      'ok',false,'error','HOLD_BLOCKED_V61','wayplan_id',v_wayplan_id,
      'current_status',v_current_status,
      'next_step','Only CREATED or DISPATCHED Wayplans can be placed on hold.'
    );
  end if;

  if v_status='CREATED' and v_current_status not in ('CREATED','ON_HOLD') then
    return jsonb_build_object(
      'ok',false,'error','REOPEN_BLOCKED_V61','wayplan_id',v_wayplan_id,
      'current_status',v_current_status,
      'next_step','Only an ON_HOLD pre-dispatch Wayplan can be reopened to CREATED.'
    );
  end if;

  if v_status='CANCELLED' and v_current_status in ('DISPATCHED','COMPLETED') then
    return jsonb_build_object(
      'ok',false,'error','CANCEL_BLOCKED_V61','wayplan_id',v_wayplan_id,
      'current_status',v_current_status,
      'next_step','Use the field return/RTO workflow after a Wayplan has been dispatched.'
    );
  end if;

  update public.be_wayplan_dispatches
  set wayplan_status=v_status,
      completed_at=case when v_status<>'COMPLETED' then null else completed_at end,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'last_action_actor',v_actor,
        'last_action_status',v_status,
        'last_action_at',now(),
        'dispatch_guard','V43_MULTI_TRIP',
        'lifecycle_guard','V61'
      ),
      updated_at=now()
  where wayplan_id=v_wayplan_id;

  if v_status='CREATED' then
    update public.be_wayplan_dispatch_stops
    set stop_status='READY_FOR_DISPATCH',updated_at=now()
    where wayplan_id=v_wayplan_id
      and upper(coalesce(stop_status,'')) not in ('DELIVERED','RTO','RETURN_TO_WAREHOUSE');

    update public.be_waybill_ledger
    set dispatch_status='WAYPLAN_CREATED',wayplan_status='WAYPLAN_CREATED',updated_at=now()
    where wayplan_id=v_wayplan_id
      and upper(coalesce(dispatch_status,'')) not in ('DELIVERED','RTO','SETTLED','CANCELLED');
  else
    update public.be_wayplan_dispatch_stops
    set stop_status=v_status,updated_at=now()
    where wayplan_id=v_wayplan_id
      and upper(coalesce(stop_status,'')) not in ('DELIVERED','COMPLETED','RTO','RETURN_TO_WAREHOUSE');

    update public.be_waybill_ledger
    set dispatch_status=v_status,wayplan_status=v_status,updated_at=now()
    where wayplan_id=v_wayplan_id
      and upper(coalesce(dispatch_status,'')) not in ('DELIVERED','RTO','SETTLED','CANCELLED');
  end if;

  return jsonb_build_object(
    'ok',true,'wayplan_id',v_wayplan_id,'status',v_status,
    'dispatch_guard','V43_MULTI_TRIP','lifecycle_guard','V61'
  );
end
$function$;

create or replace function public.be_wayplan_ensure_review_v61()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if upper(coalesce(new.wayplan_status,''))='CREATED' then
    insert into public.be_wayplan_review_v43(wayplan_id,review_status,revision_no,approval_snapshot,created_at,updated_at)
    values(new.wayplan_id,'DRAFT',1,'{}'::jsonb,now(),now())
    on conflict(wayplan_id) do nothing;
  end if;
  return new;
end
$function$;

drop trigger if exists be_wayplan_ensure_review_v61 on public.be_wayplan_dispatches;
create trigger be_wayplan_ensure_review_v61
after insert or update of wayplan_status on public.be_wayplan_dispatches
for each row execute function public.be_wayplan_ensure_review_v61();

-- Repair the known 67-stop Wayplan that was accidentally completed before Supervisor review/Dispatch.
do $repair$
declare
  v_id text := 'WP-20260918-1420f02f-071c-4e80-aed6-0119c21fd188-1';
  v_can_repair boolean := false;
begin
  select exists(
    select 1
    from public.be_wayplan_dispatches d
    where d.wayplan_id=v_id
      and upper(coalesce(d.wayplan_status,''))='COMPLETED'
      and d.dispatched_at is null
      and not exists(
        select 1 from public.be_wayplan_dispatch_stops s
        where s.wayplan_id=v_id
          and (
            s.delivered_at is not null
            or s.loaded_to_vehicle_at is not null
            or s.handed_over_to_rider_at is not null
            or coalesce(s.scan_count,0)>0
          )
      )
      and exists(
        select 1 from public.be_wayplan_membership_v40 m
        where m.wayplan_id=v_id and m.membership_status='PLANNED'
      )
  ) into v_can_repair;

  if v_can_repair then
    update public.be_wayplan_dispatches
    set wayplan_status='CREATED',
        completed_at=null,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'last_action_actor','V61_LIFECYCLE_REPAIR',
          'last_action_status','CREATED',
          'last_action_at',now(),
          'lifecycle_repair','PREMATURE_COMPLETED_TO_CREATED',
          'lifecycle_guard','V61'
        ),
        updated_at=now()
    where wayplan_id=v_id;

    update public.be_wayplan_dispatch_stops
    set stop_status='READY_FOR_DISPATCH',
        updated_at=now()
    where wayplan_id=v_id
      and upper(coalesce(stop_status,''))='COMPLETED'
      and delivered_at is null
      and loaded_to_vehicle_at is null
      and handed_over_to_rider_at is null
      and coalesce(scan_count,0)=0;

    update public.be_waybill_ledger
    set dispatch_status='WAYPLAN_CREATED',
        wayplan_status='WAYPLAN_CREATED',
        updated_at=now()
    where wayplan_id=v_id
      and upper(coalesce(dispatch_status,'')) not in ('DELIVERED','RTO','SETTLED','CANCELLED');

    insert into public.be_wayplan_review_v43(
      wayplan_id,review_status,revision_no,approval_snapshot,created_at,updated_at
    ) values(
      v_id,'DRAFT',1,
      jsonb_build_object('repaired_by','V61','reason','Premature COMPLETED before Supervisor review/Dispatch'),
      now(),now()
    )
    on conflict(wayplan_id) do update
      set review_status='DRAFT',
          submitted_by=null,
          submitted_at=null,
          reviewed_by=null,
          reviewed_at=null,
          review_notes=null,
          rejection_reason=null,
          dispatch_ready_at=null,
          dispatched_at=null,
          approval_snapshot=coalesce(public.be_wayplan_review_v43.approval_snapshot,'{}'::jsonb)||
            jsonb_build_object('repaired_by','V61','reason','Premature COMPLETED before Supervisor review/Dispatch'),
          updated_at=now();

    insert into public.be_audit_events(
      actor_email,actor_role,action,resource_type,resource_id,details
    ) values(
      'system@britiumexpress.com','SYSTEM','WAYPLAN_LIFECYCLE_REPAIRED_V61',
      'WAYPLAN',v_id,
      jsonb_build_object(
        'from_status','COMPLETED',
        'to_status','CREATED',
        'dispatched_at_was_null',true,
        'membership_status','PLANNED',
        'supervisor_review_status','DRAFT'
      )
    );
  end if;
end
$repair$;
