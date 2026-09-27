-- V158: authoritative Supervisor-release Warehouse gate + complete Rider delivery visibility.

create or replace view public.be_v_rider_delivery_wayplan_jobs as
select
  s.id,s.wayplan_id,s.stop_sequence,s.pickup_id,s.pickup_way_id,s.delivery_way_id,s.waybill_no,
  coalesce(s.recipient_name,'Customer') as recipient_name,
  coalesce(s.recipient_phone,'') as recipient_phone,
  coalesce(s.township,'') as township,
  coalesce(s.address,'') as address,
  coalesce(s.cod_amount,0) as cod_amount,
  coalesce(s.delivery_fee,0) as delivery_fee,
  coalesce(s.parcel_weight_kg,0) as parcel_weight_kg,
  s.stop_status,coalesce(s.rider_status,'PENDING') as rider_status,
  s.loaded_to_vehicle_at,s.handed_over_to_rider_at,s.delivered_at,s.cod_collected,
  s.failed_reason,s.rider_proof_url,s.receiver_name,s.receiver_phone,
  w.wayplan_status,w.vehicle_code,w.vehicle_name,w.driver_code,w.driver_name,
  w.rider_code,w.rider_name,w.helper_code,w.helper_name,w.dispatched_at,
  w.created_at as wayplan_created_at,
  jsonb_build_object(
    'source','be_v_rider_delivery_wayplan_jobs',
    'wayplan_status',w.wayplan_status,
    'stop_status',s.stop_status,
    'rider_status',coalesce(s.rider_status,'PENDING'),
    'rider_code',w.rider_code,
    'vehicle_code',w.vehicle_code,
    'receiver_signature_url',s.receiver_signature_url,
    'build','RIDER_DELIVERY_VIEW_V158'
  ) as metadata,
  s.receiver_signature_url
from public.be_wayplan_dispatch_stops s
join public.be_wayplan_dispatches w on w.wayplan_id=s.wayplan_id
where coalesce(w.wayplan_status,'') in ('DISPATCHED','LOADED_TO_VEHICLE','HANDOVER_TO_RIDER','OUT_FOR_DELIVERY','COMPLETED')
and coalesce(s.stop_status,'') in (
  'DISPATCHED','READY_FOR_DELIVERY','RIDER_ACCEPTED','DELIVERY_ACCEPTED','ACCEPTED_FOR_DELIVERY',
  'LOADED_TO_VEHICLE','HANDOVER_TO_RIDER','OUT_FOR_DELIVERY','ARRIVED_AT_CUSTOMER',
  'DELIVERED','FAILED_DELIVERY','RETURN_TO_WAREHOUSE'
);

create or replace function public.be_warehouse_scan_lifecycle_snapshot_v158()
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_base jsonb:=public.be_warehouse_scan_lifecycle_snapshot_v129();
  v_rows jsonb:='[]'::jsonb;
  v_stats jsonb:='{}'::jsonb;
begin
  with src as (
    select e,ord,
      upper(coalesce(nullif(e->>'delivery_way_id',''),nullif(e->>'canonical_delivery_way_id',''),nullif(e->>'waybill_no',''))) as way_id
    from jsonb_array_elements(coalesce(v_base->'rows','[]'::jsonb)) with ordinality t(e,ord)
  ),
  enriched as (
    select s.e,s.ord,s.way_id,
      m.wayplan_id,
      upper(coalesce(m.membership_status,'')) as membership_status,
      m.vehicle_code,w.vehicle_name,
      upper(coalesce(w.wayplan_status,'')) as wayplan_status,
      upper(coalesce(r.review_status,'')) as review_status,
      r.dispatch_ready_at,
      coalesce((s.e->>'field_exception_pending')::boolean,false) as exception_pending,
      nullif(s.e->>'dispatch_scan_at','') is not null as already_scanned
    from src s
    left join lateral (
      select mm.*
      from public.be_wayplan_membership_v40 mm
      join public.be_wayplan_dispatches ww on ww.wayplan_id=mm.wayplan_id
      where upper(mm.delivery_way_id)=s.way_id
        and upper(coalesce(ww.wayplan_status,'')) not in ('CANCELLED','COMPLETED')
        and upper(coalesce(mm.membership_status,'')) not in ('CANCELLED','COMPLETED','RTO')
      order by mm.updated_at desc nulls last
      limit 1
    ) m on true
    left join public.be_wayplan_dispatches w on w.wayplan_id=m.wayplan_id
    left join public.be_wayplan_review_v43 r on r.wayplan_id=m.wayplan_id
  ),
  staged as (
    select *,
      case
        when exception_pending then coalesce(nullif(e->>'dispatch_workflow_stage',''),'AWAITING_RETURN_SCAN')
        when already_scanned then 'DISPATCH_SCANNED'
        when review_status='DISPATCH_READY' and membership_status='READY_FOR_DISPATCH' then 'DISPATCH_SCAN_REQUIRED'
        when wayplan_id is not null and review_status<>'DISPATCH_READY' then 'IN_WAYPLAN_AWAITING_SUPERVISOR'
        when wayplan_id is not null and review_status='DISPATCH_READY' and membership_status<>'READY_FOR_DISPATCH' then 'SUPERVISOR_APPROVED_AWAITING_RELEASE'
        else coalesce(nullif(e->>'dispatch_workflow_stage',''),
          case
            when upper(coalesce(e->>'warehouse_status',e->>'warehouse_scan_status','')) in ('WAREHOUSE_READY','READY_FOR_DELIVERY') then 'READY_FOR_WAYPLAN'
            when upper(coalesce(e->>'warehouse_status',e->>'warehouse_scan_status',''))='RECEIVED' then 'RECEIVED'
            else 'PENDING'
          end)
      end as stage
    from enriched
  )
  select coalesce(jsonb_agg(
    e || jsonb_build_object(
      'active_wayplan_id',wayplan_id,
      'membership_status',membership_status,
      'supervisor_review_status',review_status,
      'supervisor_dispatch_ready_at',dispatch_ready_at,
      'active_wayplan_status',wayplan_status,
      'assigned_vehicle_code',vehicle_code,
      'assigned_vehicle_name',vehicle_name,
      'dispatch_workflow_stage',stage,
      'dispatch_scan_required',stage='DISPATCH_SCAN_REQUIRED',
      'dispatch_scan_allowed',stage='DISPATCH_SCAN_REQUIRED',
      'dispatch_scan_instruction',
        case stage
          when 'DISPATCH_SCAN_REQUIRED' then 'Supervisor released this Wayplan. Warehouse Dispatch Scan is required now.'
          when 'IN_WAYPLAN_AWAITING_SUPERVISOR' then 'Wayplan created. Waiting for Supervisor confirmation/release.'
          when 'SUPERVISOR_APPROVED_AWAITING_RELEASE' then 'Supervisor approved the Wayplan; waiting for membership release to Dispatch Scan.'
          when 'READY_FOR_WAYPLAN' then 'Ready for Wayplan creation. Dispatch Scan is not allowed yet.'
          when 'RECEIVED' then 'Mark ready for Wayplan first.'
          when 'DISPATCH_SCANNED' then 'Warehouse Dispatch Scan completed.'
          else coalesce(e->>'dispatch_scan_instruction','')
        end
    ) order by ord
  ),'[]'::jsonb)
  into v_rows
  from staged;

  select coalesce(v_base->'stats','{}'::jsonb)||jsonb_build_object(
    'ready_for_wayplan',count(*) filter(where x->>'dispatch_workflow_stage'='READY_FOR_WAYPLAN'),
    'waiting_supervisor',count(*) filter(where x->>'dispatch_workflow_stage' in ('IN_WAYPLAN_AWAITING_SUPERVISOR','SUPERVISOR_APPROVED_AWAITING_RELEASE')),
    'dispatch_scan_required',count(*) filter(where coalesce((x->>'dispatch_scan_required')::boolean,false)),
    'dispatch_scanned',count(*) filter(where x->>'dispatch_workflow_stage'='DISPATCH_SCANNED')
  )
  into v_stats
  from jsonb_array_elements(v_rows) x;

  return v_base||jsonb_build_object(
    'rows',v_rows,
    'stats',v_stats,
    'dispatch_gate','SUPERVISOR_DISPATCH_READY_PLUS_READY_MEMBERSHIP',
    'build','WAREHOUSE_SUPERVISOR_RELEASE_V158'
  );
end
$function$;

revoke execute on function public.be_warehouse_scan_lifecycle_snapshot_v158() from public,anon;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot_v158() to authenticated,service_role;

do $patch_delivery$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_field_team_delivery_action'
  limit 1;
  if v_def is null then raise exception 'be_field_team_delivery_action not found'; end if;

  if position('v_signature_url text' in v_def)=0 then
    v_old := '  v_proof_url text := nullif(btrim(coalesce(p_payload->>''proof_url'','''')),'''' );';
    if position(v_old in v_def)>0 then
      v_new := v_old || E'\n  v_signature_url text := nullif(btrim(coalesce(p_payload->>''signature_url'',p_payload->>''receiver_signature_url'','''')),'''' );';
      v_def:=replace(v_def,v_old,v_new);
    else
      v_old := '  v_proof_url text := nullif(btrim(coalesce(p_payload->>''proof_url'','''')),'''' );';
    end if;
  end if;

  if position('v_signature_url text' in v_def)=0 then
    -- Exact PostgreSQL formatter form.
    v_old := '  v_proof_url text := nullif(btrim(coalesce(p_payload->>''proof_url'','''')),'''' );';
  end if;

  -- Use a regex insertion when whitespace formatting differs.
  if position('v_signature_url text' in v_def)=0 then
    v_def:=regexp_replace(
      v_def,
      E'(  v_proof_url text := nullif\\(btrim\\(coalesce\\(p_payload->>''proof_url'',''''\\)\\),''''\\);)',
      E'\\1\n  v_signature_url text := nullif(btrim(coalesce(p_payload->>''signature_url'',p_payload->>''receiver_signature_url'','''')),'''' );'
    );
  end if;
  if position('v_signature_url text' in v_def)=0 then raise exception 'V158 signature declaration anchor changed'; end if;

  v_old := '    if v_proof_url is null then raise exception ''DELIVERY_PROOF_PHOTO_REQUIRED'' using errcode=''22023''; end if;';
  v_new := v_old || E'\n    if v_signature_url is null then raise exception ''RECIPIENT_SIGNATURE_REQUIRED'' using errcode=''22023''; end if;';
  if position('RECIPIENT_SIGNATURE_REQUIRED' in v_def)=0 then
    if position(v_old in v_def)=0 then raise exception 'V158 proof requirement anchor changed'; end if;
    v_def:=replace(v_def,v_old,v_new);
  end if;

  v_old := 'cod_collected=v_collected_cod,rider_proof_url=v_proof_url,proof_url=v_proof_url,receiver_name=v_recipient_name,receiver_phone=v_recipient_phone,failed_reason=null,updated_at=now(),';
  v_new := 'cod_collected=v_collected_cod,rider_proof_url=v_proof_url,proof_url=v_proof_url,receiver_name=v_recipient_name,receiver_phone=v_recipient_phone,receiver_signature_url=v_signature_url,failed_reason=null,updated_at=now(),';
  if position('receiver_signature_url=v_signature_url' in v_def)=0 then
    if position(v_old in v_def)=0 then raise exception 'V158 stop update anchor changed'; end if;
    v_def:=replace(v_def,v_old,v_new);
  end if;

  v_def:=replace(
    v_def,
    '''proof_url'',v_proof_url,''proof_validation'',v_proof_check,''action_at'',now()',
    '''proof_url'',v_proof_url,''signature_url'',v_signature_url,''proof_validation'',v_proof_check,''action_at'',now()'
  );
  v_def:=replace(
    v_def,
    '''proof_url'',v_proof_url,''proof_validation'',v_proof_check)',
    '''proof_url'',v_proof_url,''signature_url'',v_signature_url,''proof_validation'',v_proof_check)'
  );

  execute v_def;
end
$patch_delivery$;

comment on function public.be_warehouse_scan_lifecycle_snapshot_v158()
is 'V158: Supervisor DISPATCH_READY + READY_FOR_DISPATCH membership is the authoritative Warehouse Dispatch Scan gate.';
comment on view public.be_v_rider_delivery_wayplan_jobs
is 'V158: Rider delivery source including RIDER_ACCEPTED through final proof/signature completion.';
