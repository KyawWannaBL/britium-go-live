-- V41 hotfix: resolve Customer Service parcel territory from normalized parcel routing data.
-- Keeps branch-scoped access controls intact while supporting parcel rows without branch_code.

create or replace function public.be_cs_resolve_parcel_branch(p_parcel jsonb)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_branch text := upper(btrim(coalesce(p_parcel->>'branch_code', '')));
  v_region text := upper(btrim(coalesce(p_parcel->>'delivery_region', '')));
  v_city text := nullif(btrim(coalesce(p_parcel->>'city', '')), '');
  v_township text := coalesce(
    nullif(btrim(coalesce(p_parcel->>'township', '')), ''),
    nullif(btrim(coalesce(p_parcel->>'delivery_township', '')), ''),
    nullif(btrim(coalesce(p_parcel->>'recipient_township', '')), '')
  );
  v_address text := concat_ws(' ',
    nullif(btrim(coalesce(p_parcel->>'recipient_address', '')), ''),
    nullif(btrim(coalesce(p_parcel->>'delivery_address', '')), ''),
    nullif(btrim(coalesce(p_parcel->>'address', '')), ''),
    nullif(btrim(coalesce(p_parcel->>'region_state', '')), ''),
    nullif(btrim(coalesce(p_parcel->>'destination', '')), '')
  );
begin
  if v_branch in ('YGN','MDY','NPT') then
    return v_branch;
  end if;

  case v_region
    when 'YANGON' then return 'YGN';
    when 'MANDALAY' then return 'MDY';
    when 'NAYPYITAW' then return 'NPT';
    when 'OUTSIDE_CORE' then return 'YGN';
    else null;
  end case;

  return public.be_resolve_branch_from_location(v_city, v_township, v_address, 'YGN');
end
$$;

revoke all on function public.be_cs_resolve_parcel_branch(jsonb) from public, anon;
grant execute on function public.be_cs_resolve_parcel_branch(jsonb) to authenticated;

create or replace function public.be_cs_parcel_support_queue(
  p_limit integer default 300,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text := lower(regexp_replace(btrim(coalesce(
    public.be_current_user_role(), public.be_current_role(), ''
  )), '[ _-]+', '_', 'g'));
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if v_role not in (
    'customer_service','cs','support','super_admin','superadmin','app_owner','sys',
    'admin','operations_admin','operations','supervisor'
  ) then
    raise exception 'CUSTOMER_SERVICE_ACCESS_REQUIRED' using errcode = '42501';
  end if;

  with parcel_base as (
    select
      d.delivery_way_id,
      d.pickup_id,
      d.created_at,
      d.updated_at,
      to_jsonb(d) as parcel_json
    from public.be_data_entry_parcel_details d
    where nullif(btrim(coalesce(d.delivery_way_id, '')), '') is not null
  ), accessible as (
    select p.*
    from parcel_base p
    where
      public.be_employee_can_access_territory(
        null,
        public.be_cs_resolve_parcel_branch(p.parcel_json),
        coalesce(
          nullif(p.parcel_json->>'township', ''),
          nullif(p.parcel_json->>'delivery_township', ''),
          nullif(p.parcel_json->>'recipient_township', '')
        ),
        'read'
      )
      or public.be_customer_service_can_manage_pickup_request(
        public.be_cs_resolve_parcel_branch(p.parcel_json),
        coalesce(
          nullif(p.parcel_json->>'township', ''),
          nullif(p.parcel_json->>'delivery_township', ''),
          nullif(p.parcel_json->>'recipient_township', '')
        ),
        'read'
      )
  ), searched as (
    select p.*
    from accessible p
    where nullif(btrim(coalesce(p_search, '')), '') is null
       or lower(concat_ws(' ',
          p.delivery_way_id,
          p.pickup_id,
          p.parcel_json->>'waybill_no',
          p.parcel_json->>'recipient_name',
          p.parcel_json->>'recipient_phone',
          p.parcel_json->>'contact_no_1',
          p.parcel_json->>'delivery_address',
          p.parcel_json->>'recipient_address',
          p.parcel_json->>'address',
          p.parcel_json->>'township',
          p.parcel_json->>'assigned_rider_name'
       )) like '%' || lower(btrim(p_search)) || '%'
  ), enriched as (
    select
      p.delivery_way_id,
      p.pickup_id,
      p.updated_at,
      p.parcel_json,
      ws.scan_type as latest_warehouse_event,
      ws.scan_note as latest_warehouse_note,
      ws.created_at as latest_warehouse_event_at,
      oe.to_status as latest_operation_event,
      oe.event_note as latest_operation_note,
      oe.created_at as latest_operation_event_at,
      se.event_code as latest_status_event_code,
      se.event_name as latest_status_event_name,
      se.source_module as latest_status_source,
      se.created_at as latest_status_event_at,
      cv.open_voice_count,
      cv.current_owner_department,
      cv.latest_customer_voice,
      cv.latest_internal_action,
      cv.escalation_flag,
      cv.sla_due_at,
      cv.latest_voice_priority,
      cv.latest_voice_status
    from searched p
    left join lateral (
      select w.scan_type, w.scan_note, w.created_at
      from public.be_warehouse_scan_events w
      where w.pickup_id = p.pickup_id
         or w.waybill_no = p.delivery_way_id
         or w.waybill_no = nullif(p.parcel_json->>'waybill_no', '')
      order by w.created_at desc nulls last
      limit 1
    ) ws on true
    left join lateral (
      select o.to_status, o.event_note, o.created_at
      from public.be_operational_events o
      where o.pickup_id = p.pickup_id
         or o.waybill_no = p.delivery_way_id
         or o.waybill_no = nullif(p.parcel_json->>'waybill_no', '')
      order by o.created_at desc nulls last
      limit 1
    ) oe on true
    left join lateral (
      select s.event_code, s.event_name, s.source_module, s.created_at
      from public.be_waybill_status_events s
      where s.pickup_id = p.pickup_id
         or s.waybill_no = p.delivery_way_id
         or s.waybill_no = nullif(p.parcel_json->>'waybill_no', '')
      order by s.created_at desc nulls last
      limit 1
    ) se on true
    left join lateral (
      select
        count(*) filter (where v.workflow_status not in ('CLOSED'))::integer as open_voice_count,
        (array_agg(v.current_department order by v.created_at desc))[1] as current_owner_department,
        (array_agg(v.customer_voice_text order by v.created_at desc))[1] as latest_customer_voice,
        (
          select a.action_note
          from public.be_customer_voice_actions a
          where a.customer_voice_id in (
            select vx.id from public.be_customer_voices vx where vx.delivery_way_id = p.delivery_way_id
          )
          order by a.created_at desc
          limit 1
        ) as latest_internal_action,
        exists (
          select 1
          from public.be_customer_voice_escalations e
          join public.be_customer_voices ve on ve.id = e.customer_voice_id
          where ve.delivery_way_id = p.delivery_way_id and e.status = 'PENDING'
        ) as escalation_flag,
        min(v.due_at) filter (where v.workflow_status not in ('CLOSED','RESOLVED')) as sla_due_at,
        (array_agg(v.priority order by v.created_at desc))[1] as latest_voice_priority,
        (array_agg(v.workflow_status order by v.created_at desc))[1] as latest_voice_status
      from public.be_customer_voices v
      where v.delivery_way_id = p.delivery_way_id
    ) cv on true
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit greatest(least(coalesce(p_limit, 300), 1000), 1)
  ), rows_json as (
    select jsonb_build_object(
      'delivery_way_id', e.delivery_way_id,
      'waybill_no', coalesce(nullif(e.parcel_json->>'waybill_no',''), e.delivery_way_id),
      'pickup_id', e.pickup_id,
      'recipient_name', coalesce(e.parcel_json->>'recipient_name', e.parcel_json->>'customer_name'),
      'recipient_phone', coalesce(e.parcel_json->>'recipient_phone', e.parcel_json->>'contact_no_1', e.parcel_json->>'customer_phone'),
      'delivery_address', coalesce(e.parcel_json->>'delivery_address', e.parcel_json->>'recipient_address', e.parcel_json->>'address'),
      'township', coalesce(e.parcel_json->>'township', e.parcel_json->>'delivery_township'),
      'ward', coalesce(e.parcel_json->>'ward', e.parcel_json->>'source_ward'),
      'postal_code', coalesce(e.parcel_json->>'postal_code', e.parcel_json->>'source_postal_code'),
      'branch_code', public.be_cs_resolve_parcel_branch(e.parcel_json),
      'merchant_name', e.parcel_json->>'merchant_name',
      'parcel_status', e.parcel_json->>'parcel_status',
      'warehouse_status', e.parcel_json->>'warehouse_status',
      'operation_status', coalesce(e.parcel_json->>'way_management_status', e.latest_operation_event),
      'finance_status', e.parcel_json->>'finance_status',
      'assigned_rider_code', coalesce(e.parcel_json->>'assigned_rider_code', e.parcel_json->>'rider_code'),
      'assigned_rider_name', coalesce(e.parcel_json->>'assigned_rider_name', e.parcel_json->>'rider_name'),
      'vehicle_plate', coalesce(e.parcel_json->>'vehicle_plate', e.parcel_json->>'assigned_vehicle_plate'),
      'wayplan_id', e.parcel_json->>'wayplan_id',
      'cod_amount', coalesce(e.parcel_json->>'cod_amount', e.parcel_json->>'item_price'),
      'latest_warehouse_event', e.latest_warehouse_event,
      'latest_warehouse_note', e.latest_warehouse_note,
      'latest_warehouse_event_at', e.latest_warehouse_event_at,
      'latest_operation_event', e.latest_operation_event,
      'latest_operation_note', e.latest_operation_note,
      'latest_operation_event_at', e.latest_operation_event_at,
      'latest_status_event_code', e.latest_status_event_code,
      'latest_status_event_name', e.latest_status_event_name,
      'latest_status_source', e.latest_status_source,
      'latest_status_event_at', e.latest_status_event_at,
      'open_voice_count', coalesce(e.open_voice_count, 0),
      'current_owner_department', e.current_owner_department,
      'latest_customer_voice', e.latest_customer_voice,
      'latest_internal_action', e.latest_internal_action,
      'escalation_flag', coalesce(e.escalation_flag, false),
      'sla_due_at', e.sla_due_at,
      'latest_voice_priority', e.latest_voice_priority,
      'latest_voice_status', e.latest_voice_status,
      'updated_at', e.updated_at
    ) as row_json,
    e.open_voice_count,
    e.escalation_flag,
    e.latest_voice_priority
    from enriched e
  )
  select jsonb_build_object(
    'ok', true,
    'summary', jsonb_build_object(
      'total_records', count(*),
      'open_voices', coalesce(sum(coalesce(open_voice_count, 0)), 0),
      'escalated', count(*) filter (where coalesce(escalation_flag, false)),
      'urgent', count(*) filter (where lower(coalesce(latest_voice_priority, '')) = 'urgent')
    ),
    'rows', coalesce(jsonb_agg(row_json), '[]'::jsonb)
  )
  into v_result
  from rows_json;

  return coalesce(v_result, jsonb_build_object(
    'ok', true,
    'summary', jsonb_build_object('total_records', 0, 'open_voices', 0, 'escalated', 0, 'urgent', 0),
    'rows', '[]'::jsonb
  ));
end
$$;

revoke all on function public.be_cs_parcel_support_queue(integer, text) from public, anon;
grant execute on function public.be_cs_parcel_support_queue(integer, text) to authenticated;

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

  v_branch := public.be_cs_resolve_parcel_branch(v_parcel);
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
    coalesce(nullif(p_payload->>'customer_phone', ''), nullif(v_parcel->>'recipient_phone', ''), nullif(v_parcel->>'contact_no_1', '')),
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
      'parcel_status', coalesce(v_parcel->>'parcel_status', v_parcel->>'way_management_status'),
      'resolved_branch', v_branch
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
    'branch_code', v_branch,
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
