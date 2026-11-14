-- V41 phase 2: centralized routing and atomic Customer Voice creation.

create or replace function public.be_cs_route_department(
  p_issue_type text,
  p_parcel_status text default null,
  p_context jsonb default '{}'::jsonb
)
returns text
language plpgsql
immutable
as $$
declare
  v_issue text := upper(btrim(coalesce(p_issue_type, 'OTHER')));
  v_context_department text := lower(btrim(coalesce(p_context->>'suggested_department', '')));
begin
  case v_issue
    when 'REDELIVERY' then return 'operations';
    when 'RIDER_ISSUE' then return 'operations';
    when 'ADDRESS_CORRECTION' then return 'data_entry';
    when 'LOCATION_CORRECTION' then return 'data_entry';
    when 'PARCEL_MISSING' then return 'warehouse';
    when 'WAREHOUSE_ISSUE' then return 'warehouse';
    when 'COD_ISSUE' then return 'finance';
    when 'PAYMENT_ISSUE' then return 'finance';
    when 'PICKUP_ISSUE' then return 'pickup_supervisor';
    when 'INQUIRY', 'REQUEST', 'COMPLAINT' then
      if v_context_department in ('operations','data_entry','warehouse','finance','pickup_supervisor') then
        return v_context_department;
      end if;
      return 'operations';
    when 'OTHER' then return 'operations';
    else return 'operations';
  end case;
end
$$;

revoke all on function public.be_cs_route_department(text, text, jsonb) from public, anon;
grant execute on function public.be_cs_route_department(text, text, jsonb) to authenticated;

create or replace function public.be_cs_create_customer_voice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text := lower(regexp_replace(btrim(coalesce(
    public.be_current_user_role(), public.be_current_role(), ''
  )), '[ _-]+', '_', 'g'));
  v_delivery_way_id text := btrim(coalesce(p_payload->>'delivery_way_id', p_payload->>'way_id', ''));
  v_text text := btrim(coalesce(p_payload->>'customer_voice_text', p_payload->>'description', ''));
  v_issue text := upper(btrim(coalesce(p_payload->>'issue_type', 'OTHER')));
  v_priority text := lower(btrim(coalesce(p_payload->>'priority', 'medium')));
  v_source_channel text := upper(btrim(coalesce(p_payload->>'source_channel', 'PHONE')));
  v_idempotency_key text := nullif(btrim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_pickup_id text;
  v_parcel jsonb;
  v_branch text;
  v_township text;
  v_route text;
  v_voice public.be_customer_voices%rowtype;
  v_existing public.be_customer_voices%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_role not in (
    'customer_service','cs','support','super_admin','superadmin','app_owner','sys',
    'admin','operations_admin','supervisor'
  ) then
    raise exception 'CUSTOMER_SERVICE_WRITE_REQUIRED' using errcode = '42501';
  end if;

  if v_delivery_way_id = '' then
    raise exception 'DELIVERY_WAY_ID_REQUIRED' using errcode = '22023';
  end if;

  if v_text = '' then
    raise exception 'CUSTOMER_VOICE_TEXT_REQUIRED' using errcode = '22023';
  end if;

  if v_priority not in ('low','medium','high','urgent') then
    raise exception 'INVALID_PRIORITY' using errcode = '22023';
  end if;

  if v_source_channel not in ('PHONE','VIBER','MESSENGER','WALK_IN','EMAIL','OTHER') then
    raise exception 'INVALID_SOURCE_CHANNEL' using errcode = '22023';
  end if;

  if v_idempotency_key is not null then
    select * into v_existing
    from public.be_customer_voices
    where created_by = auth.uid() and idempotency_key = v_idempotency_key
    limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'voice_id', v_existing.id,
        'route', v_existing.current_department,
        'workflow_status', v_existing.workflow_status,
        'notification_status', coalesce((
          select n.status from public.be_customer_voice_notifications n
          where n.customer_voice_id = v_existing.id
          order by n.created_at desc limit 1
        ), 'QUEUED'),
        'idempotent_replay', true
      );
    end if;
  end if;

  select d.pickup_id, to_jsonb(d)
  into v_pickup_id, v_parcel
  from public.be_data_entry_parcel_details d
  where d.delivery_way_id = v_delivery_way_id
     or nullif(to_jsonb(d)->>'waybill_no', '') = v_delivery_way_id
  order by d.updated_at desc nulls last, d.created_at desc nulls last
  limit 1;

  if v_parcel is null then
    raise exception 'PARCEL_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_branch := nullif(v_parcel->>'branch_code', '');
  v_township := coalesce(
    nullif(v_parcel->>'township', ''),
    nullif(v_parcel->>'delivery_township', ''),
    nullif(v_parcel->>'recipient_township', '')
  );

  if not (
    public.be_employee_can_access_territory(null, v_branch, v_township, 'read')
    or public.be_customer_service_can_manage_pickup_request(v_branch, v_township, 'read')
  ) then
    raise exception 'PARCEL_ACCESS_DENIED' using errcode = '42501';
  end if;

  v_route := public.be_cs_route_department(
    v_issue,
    coalesce(v_parcel->>'parcel_status', v_parcel->>'way_management_status'),
    coalesce(p_payload->'context', '{}'::jsonb)
  );

  insert into public.be_customer_voices (
    delivery_way_id,
    pickup_id,
    customer_name,
    customer_phone,
    source_channel,
    issue_type,
    priority,
    customer_voice_text,
    auto_routed_department,
    current_department,
    workflow_status,
    due_at,
    created_by,
    idempotency_key
  ) values (
    v_delivery_way_id,
    coalesce(nullif(p_payload->>'pickup_id', ''), v_pickup_id),
    coalesce(nullif(p_payload->>'customer_name', ''), nullif(v_parcel->>'recipient_name', '')),
    coalesce(nullif(p_payload->>'customer_phone', ''), nullif(v_parcel->>'recipient_phone', '')),
    v_source_channel,
    v_issue,
    v_priority,
    v_text,
    v_route,
    v_route,
    'ROUTED',
    nullif(p_payload->>'due_at', '')::timestamptz,
    auth.uid(),
    v_idempotency_key
  ) returning * into v_voice;

  insert into public.be_customer_voice_actions (
    customer_voice_id,
    action_type,
    action_note,
    department,
    actor_id,
    actor_role,
    resulting_status,
    metadata
  ) values (
    v_voice.id,
    'CREATED',
    'Customer Voice created and automatically routed.',
    v_route,
    auth.uid(),
    v_role,
    'ROUTED',
    jsonb_build_object(
      'auto_routed_department', v_route,
      'issue_type', v_issue,
      'parcel_status', coalesce(v_parcel->>'parcel_status', v_parcel->>'way_management_status')
    )
  );

  insert into public.be_customer_voice_notifications (
    customer_voice_id,
    destination_department,
    status,
    transport_status
  ) values (
    v_voice.id,
    v_route,
    'QUEUED',
    'PENDING'
  );

  return jsonb_build_object(
    'ok', true,
    'voice_id', v_voice.id,
    'route', v_route,
    'workflow_status', v_voice.workflow_status,
    'notification_status', 'QUEUED',
    'idempotent_replay', false
  );
exception
  when unique_violation then
    if v_idempotency_key is not null then
      select * into v_existing
      from public.be_customer_voices
      where created_by = auth.uid() and idempotency_key = v_idempotency_key
      limit 1;
      if found then
        return jsonb_build_object(
          'ok', true,
          'voice_id', v_existing.id,
          'route', v_existing.current_department,
          'workflow_status', v_existing.workflow_status,
          'notification_status', 'QUEUED',
          'idempotent_replay', true
        );
      end if;
    end if;
    raise;
end
$$;

revoke all on function public.be_cs_create_customer_voice(jsonb) from public, anon;
grant execute on function public.be_cs_create_customer_voice(jsonb) to authenticated;
