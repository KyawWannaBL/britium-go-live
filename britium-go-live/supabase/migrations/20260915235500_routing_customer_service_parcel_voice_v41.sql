-- V41 centralized Customer Voice routing and atomic creation.
-- Split from the base schema migration so the read model remains reviewable.

alter table public.be_customer_voices
  drop constraint if exists be_customer_voices_workflow_status_chk;
alter table public.be_customer_voices
  add constraint be_customer_voices_workflow_status_chk
  check (workflow_status in (
    'OPEN','ROUTED','SEEN','ACKNOWLEDGED','IN_PROGRESS','ACTION_TAKEN',
    'RESOLVED','CS_CONFIRMED','CLOSED','ESCALATED','REOPENED'
  ));

alter table public.be_customer_voice_notifications
  drop constraint if exists be_customer_voice_notifications_status_chk;
alter table public.be_customer_voice_notifications
  add constraint be_customer_voice_notifications_status_chk
  check (status in ('QUEUED','PENDING','SENT','FAILED','SKIPPED'));

create or replace function public.be_cs_route_department(
  p_issue_type text,
  p_parcel_status text,
  p_context jsonb default '{}'::jsonb
) returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_issue text := upper(btrim(coalesce(p_issue_type,'')));
  v_context_department text := lower(btrim(coalesce(p_context->>'department','')));
begin
  return case v_issue
    when 'REDELIVERY' then 'operations'
    when 'RIDER_ISSUE' then 'operations'
    when 'ADDRESS_CORRECTION' then 'data_entry'
    when 'LOCATION_CORRECTION' then 'data_entry'
    when 'PARCEL_MISSING' then 'warehouse'
    when 'WAREHOUSE_ISSUE' then 'warehouse'
    when 'COD_ISSUE' then 'finance'
    when 'PAYMENT_ISSUE' then 'finance'
    when 'PICKUP_ISSUE' then 'pickup_supervisor'
    when 'OTHER' then 'operations'
    when 'INQUIRY' then case when v_context_department in ('operations','data_entry','warehouse','finance','pickup_supervisor') then v_context_department else 'operations' end
    when 'REQUEST' then case when v_context_department in ('operations','data_entry','warehouse','finance','pickup_supervisor') then v_context_department else 'operations' end
    when 'COMPLAINT' then case when v_context_department in ('operations','data_entry','warehouse','finance','pickup_supervisor') then v_context_department else 'operations' end
    else 'operations'
  end;
end;
$$;

create or replace function public.be_cs_create_customer_voice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_way_id text := btrim(coalesce(p_payload->>'delivery_way_id', p_payload->>'deliveryWayId', ''));
  v_text text := btrim(coalesce(p_payload->>'customer_voice_text', p_payload->>'customerVoiceText', ''));
  v_issue text := upper(btrim(coalesce(p_payload->>'issue_type', p_payload->>'issueType', 'OTHER')));
  v_source text := lower(btrim(coalesce(p_payload->>'source_channel', p_payload->>'sourceChannel', 'other')));
  v_priority text := lower(btrim(coalesce(p_payload->>'priority','medium')));
  v_idempotency text := nullif(btrim(coalesce(p_payload->>'idempotency_key', p_payload->>'idempotencyKey', '')), '');
  v_context jsonb := coalesce(p_payload->'context','{}'::jsonb);
  v_pickup_id text;
  v_parcel_status text;
  v_customer_name text;
  v_customer_phone text;
  v_route text;
  v_voice public.be_customer_voices%rowtype;
  v_notification_status text := 'QUEUED';
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if v_way_id = '' then raise exception 'DELIVERY_WAY_ID_REQUIRED' using errcode='22023'; end if;
  if v_text = '' then raise exception 'CUSTOMER_VOICE_TEXT_REQUIRED' using errcode='22023'; end if;
  if not public.be_cs_can_access_delivery_way(v_way_id,'read') then
    raise exception 'CUSTOMER_SERVICE_PARCEL_ACCESS_DENIED' using errcode='42501';
  end if;
  if public.be_cs_actor_department() not in ('customer_service','superadmin') then
    raise exception 'CUSTOMER_SERVICE_ACCESS_REQUIRED' using errcode='42501';
  end if;
  if v_priority not in ('low','medium','high','urgent') then raise exception 'INVALID_PRIORITY' using errcode='22023'; end if;

  select d.pickup_id,
         d.parcel_status,
         coalesce(nullif(btrim(coalesce(p_payload->>'customer_name', p_payload->>'customerName', '')), ''), d.recipient_name),
         coalesce(nullif(btrim(coalesce(p_payload->>'customer_phone', p_payload->>'customerPhone', '')), ''), d.contact_no_1)
    into v_pickup_id, v_parcel_status, v_customer_name, v_customer_phone
    from public.be_data_entry_parcel_details d
   where d.delivery_way_id=v_way_id
   order by d.updated_at desc nulls last
   limit 1;

  if not found then raise exception 'PARCEL_NOT_FOUND' using errcode='P0002'; end if;

  if v_idempotency is not null then
    select * into v_voice
      from public.be_customer_voices
     where created_by=v_uid and idempotency_key=v_idempotency
     limit 1;
    if found then
      return jsonb_build_object(
        'ok',true,'voice_id',v_voice.id,'route',v_voice.current_department,
        'workflow_status',v_voice.workflow_status,'notification_status','EXISTING','idempotent',true
      );
    end if;
  end if;

  v_route := public.be_cs_route_department(v_issue, v_parcel_status, v_context);

  insert into public.be_customer_voices(
    delivery_way_id,pickup_id,customer_name,customer_phone,source_channel,issue_type,
    priority,customer_voice_text,auto_routed_department,current_department,workflow_status,
    due_at,created_by,idempotency_key
  ) values (
    v_way_id,v_pickup_id,v_customer_name,v_customer_phone,v_source,v_issue,
    v_priority,v_text,v_route,v_route,'ROUTED',
    now() + case v_priority when 'urgent' then interval '2 hours' when 'high' then interval '8 hours' else interval '24 hours' end,
    v_uid,v_idempotency
  ) returning * into v_voice;

  insert into public.be_customer_voice_actions(
    customer_voice_id,action_type,from_status,to_status,from_department,to_department,
    action_note,action_payload,actor_id
  ) values (
    v_voice.id,'CREATED',null,'ROUTED',null,v_route,'Customer Voice created and automatically routed',
    jsonb_build_object('issue_type',v_issue,'parcel_status',v_parcel_status,'source_channel',v_source,'priority',v_priority),v_uid
  );

  insert into public.be_customer_voice_notifications(
    customer_voice_id,department,channel,status,notification_payload
  ) values (
    v_voice.id,v_route,'in_app','QUEUED',jsonb_build_object('event','CUSTOMER_VOICE_CREATED','delivery_way_id',v_way_id)
  );

  return jsonb_build_object(
    'ok',true,
    'voice_id',v_voice.id,
    'route',v_route,
    'workflow_status',v_voice.workflow_status,
    'notification_status',v_notification_status,
    'idempotent',false
  );
end;
$$;

revoke all on function public.be_cs_route_department(text,text,jsonb) from public, anon;
revoke all on function public.be_cs_create_customer_voice(jsonb) from public, anon;
grant execute on function public.be_cs_route_department(text,text,jsonb) to authenticated;
grant execute on function public.be_cs_create_customer_voice(jsonb) to authenticated;
