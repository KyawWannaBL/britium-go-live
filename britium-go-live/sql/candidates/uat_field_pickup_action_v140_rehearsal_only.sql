-- CI-only catalog fixture: original Production guarded pickup action; local historical V140 preimage reconstruction required.
CREATE OR REPLACE FUNCTION public.be_field_team_pickup_action(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_identity jsonb;
  v_pickup_id text := coalesce(nullif(btrim(p_payload->>'pickup_id'),''),nullif(btrim(p_payload->>'pickup_way_id'),''),nullif(btrim(p_payload->>'requestCode'),''),nullif(btrim(p_payload->>'request_code'),''));
  v_action text := lower(btrim(coalesce(p_payload->>'action',p_payload->>'source_action','')));
  v_role text;
  v_worker_code text;
  v_assignment_status text;
  v_team_status text;
  v_mobile_status text;
  v_reason text := nullif(btrim(coalesce(p_payload->>'exception_reason',p_payload->>'reason',p_payload->>'remarks',p_payload->>'remark','')),'');
  v_mapped_status text := upper(coalesce(nullif(btrim(p_payload->>'mapped_status'),''),'PICKUP_EXCEPTION'));
begin
  v_identity := public.be_field_team_assert_assigned_pickup(v_pickup_id);
  v_role := lower(v_identity->>'role'); v_worker_code := upper(coalesce(v_identity->>'worker_code','')); v_assignment_status := upper(coalesce(v_identity->>'assignment_status','')); v_team_status := upper(coalesce(v_identity->>'team_acceptance_status',''));
  if v_action in ('accept','accepted','accept_pickup') then return public.be_field_team_assignment_action(jsonb_build_object('pickup_id',v_pickup_id,'role',upper(v_role),'action','ACCEPT')); end if;
  select public.be_field_team_mobile_pickup_status(p.pickup_status,p.workflow_stage,p.rider_app_stage,p.warehouse_status,case v_role when 'driver' then p.driver_status when 'helper' then p.helper_status else p.rider_status end),upper(coalesce(p.team_acceptance_status,'')),case v_role when 'driver' then upper(coalesce(p.driver_status,'')) when 'helper' then upper(coalesce(p.helper_status,'')) else upper(coalesce(p.rider_status,'')) end
  into v_mobile_status,v_team_status,v_assignment_status from public.be_portal_pickup_requests p where p.pickup_id=v_pickup_id or p.pickup_way_id=v_pickup_id or p.id::text=v_pickup_id for update;
  if v_action in ('start','start_pickup','start_pickup_trip','en_route') then
    if v_assignment_status<>'ACCEPTED' or v_team_status<>'TEAM_READY' then raise exception 'FIELD_TEAM_NOT_READY: assignment_status %, team_status %',v_assignment_status,v_team_status; end if;
    update public.be_portal_pickup_requests p set pickup_status='FIELD_TEAM_EN_ROUTE_TO_PICKUP',workflow_stage='FIELD_TEAM_EN_ROUTE_TO_PICKUP',rider_app_stage='STARTED_PICKUP_TRIP',rider_last_action='START_PICKUP_TRIP',rider_last_action_at=now(),last_event_at=now(),last_event_by=auth.uid()::text,last_event_note=upper(v_role)||' started pickup trip',updated_at=now() where p.pickup_id=v_pickup_id; v_mobile_status:='ACCEPTED';
  elsif v_action in ('arrive','arrived','arrive_at_pickup','arrived_at_pickup') then
    if v_mobile_status in ('ARRIVED_AT_PICKUP','PICKUP_VERIFIED','PICKUP_COLLECTED','DELIVERED_TO_WAREHOUSE','WAREHOUSE_ACCEPTED') then return jsonb_build_object('ok',true,'pickup_id',v_pickup_id,'action','arrive','mobile_status',v_mobile_status,'already_applied',true); end if;
    if v_assignment_status<>'ACCEPTED' or v_team_status<>'TEAM_READY' then raise exception 'FIELD_TEAM_NOT_READY: assignment_status %, team_status %',v_assignment_status,v_team_status; end if;
    update public.be_portal_pickup_requests p set pickup_status='FIELD_TEAM_AT_PICKUP',workflow_stage='FIELD_TEAM_AT_PICKUP',rider_app_stage='ARRIVED_PICKUP',arrived_pickup_at=coalesce(p.arrived_pickup_at,now()),rider_last_action='ARRIVED_AT_PICKUP',rider_last_action_at=now(),field_verification_payload=coalesce(p.field_verification_payload,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object('arrived_at',now(),'arrival_gps_lat',nullif(btrim(p_payload->>'gps_lat'),''),'arrival_gps_lng',nullif(btrim(p_payload->>'gps_lng'),''),'field_role',upper(v_role),'worker_code',v_worker_code,'auth_user_id',auth.uid()::text)),last_event_at=now(),last_event_by=auth.uid()::text,last_event_note=upper(v_role)||' arrived at pickup',updated_at=now() where p.pickup_id=v_pickup_id; v_mobile_status:='ARRIVED_AT_PICKUP';
  elsif v_action in ('verify','verified','verify_pickup','pickup_verified') then return public.be_field_team_submit_partial_pickup_verification(p_payload);
  elsif v_action in ('collect','collected','collect_pickup','pickup_collected') then
    if v_mobile_status in ('PICKUP_COLLECTED','DELIVERED_TO_WAREHOUSE','WAREHOUSE_ACCEPTED') then return jsonb_build_object('ok',true,'pickup_id',v_pickup_id,'action','collect','mobile_status',v_mobile_status,'already_applied',true); end if;
    if v_mobile_status<>'PICKUP_VERIFIED' then raise exception 'PICKUP_MUST_BE_VERIFIED_BEFORE_COLLECTION: current status %',coalesce(v_mobile_status,'NULL'); end if;
    update public.be_portal_pickup_requests p set pickup_status='PICKUP_COLLECTED',workflow_stage='PICKUP_COLLECTED',rider_app_stage='COLLECTED_PICKUP',rider_status=case when v_role='rider' then 'COLLECTED' else p.rider_status end,driver_status=case when v_role='driver' then 'COLLECTED' else p.driver_status end,pickup_collected_at=coalesce(p.pickup_collected_at,now()),data_entry_status='READY_FOR_DATA_ENTRY',warehouse_status='WAITING_RECEIPT',rider_last_action='COLLECTED_PICKUP',rider_last_action_at=now(),last_event_at=now(),last_event_by=auth.uid()::text,last_event_note=upper(v_role)||' collected verified pickup',updated_at=now() where p.pickup_id=v_pickup_id; v_mobile_status:='PICKUP_COLLECTED';
  elsif v_action in ('handoff','handoff_to_warehouse','deliver_to_warehouse','delivered_to_warehouse','to_warehouse') then
    if v_mobile_status in ('DELIVERED_TO_WAREHOUSE','WAREHOUSE_ACCEPTED') then return jsonb_build_object('ok',true,'pickup_id',v_pickup_id,'action','delivered_to_warehouse','mobile_status',v_mobile_status,'already_applied',true); end if;
    if v_mobile_status<>'PICKUP_COLLECTED' then raise exception 'PICKUP_MUST_BE_COLLECTED_BEFORE_WAREHOUSE_HANDOFF: current status %',coalesce(v_mobile_status,'NULL'); end if;
    update public.be_portal_pickup_requests p set pickup_status='DELIVERED_TO_WAREHOUSE',workflow_stage='TO_WAREHOUSE',rider_app_stage='WAREHOUSE_HANDOFF',data_entry_status='READY_FOR_DATA_ENTRY',warehouse_status='READY_FOR_INBOUND',rider_last_action='HANDOFF_TO_WAREHOUSE',rider_last_action_at=now(),last_event_at=now(),last_event_by=auth.uid()::text,last_event_note=upper(v_role)||' handed pickup to warehouse intake',updated_at=now() where p.pickup_id=v_pickup_id; v_mobile_status:='DELIVERED_TO_WAREHOUSE';
    insert into public.be_app_notifications(recipient_role,recipient_email,target_user_id,notification_type,title,message,entity_type,entity_id,pickup_id,priority,is_read,payload,created_at)
    select 'warehouse',null,null,'PICKUP_READY_FOR_INBOUND','Pickup ready for warehouse inbound','Field team handed pickup '||v_pickup_id||' to warehouse intake.','pickup',v_pickup_id,v_pickup_id,'HIGH',false,jsonb_build_object('pickup_id',v_pickup_id,'field_role',upper(v_role),'worker_code',v_worker_code,'next_action','WAREHOUSE_INBOUND_SCAN'),now()
    where not exists(select 1 from public.be_app_notifications n where n.pickup_id=v_pickup_id and n.notification_type='PICKUP_READY_FOR_INBOUND' and lower(coalesce(n.recipient_role,''))='warehouse') on conflict do nothing;
  elsif v_action like '%exception%' then
    update public.be_portal_pickup_requests p set pickup_status=case when v_mapped_status in ('PICKUP_FAILED','PICKUP_ON_HOLD','PICKUP_EXCEPTION','EXCEPTION') then v_mapped_status else 'PICKUP_EXCEPTION' end,workflow_stage='PICKUP_EXCEPTION',rider_app_stage='PICKUP_EXCEPTION',exception_reason=coalesce(v_reason,p.exception_reason,'FIELD_EXCEPTION'),exception_at=coalesce(p.exception_at,now()),rider_last_action='PICKUP_EXCEPTION',rider_last_action_at=now(),last_event_at=now(),last_event_by=auth.uid()::text,last_event_note=upper(v_role)||' reported pickup exception: '||coalesce(v_reason,'FIELD_EXCEPTION'),updated_at=now() where p.pickup_id=v_pickup_id; v_mobile_status:='PICKUP_EXCEPTION';
  else raise exception 'Unsupported field-team pickup action: %',coalesce(nullif(v_action,''),'EMPTY') using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'pickup_id',v_pickup_id,'role',upper(v_role),'worker_code',v_worker_code,'action',v_action,'mobile_status',v_mobile_status);
end;
$function$;
