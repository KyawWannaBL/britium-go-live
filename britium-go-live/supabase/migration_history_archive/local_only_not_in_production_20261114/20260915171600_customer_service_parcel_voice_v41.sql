-- V41: parcel-centric Customer Service read model and Customer Voice workflow storage.
-- Phase 1 establishes durable workflow tables and a parcel-level support queue.

create table if not exists public.be_customer_voices (
  id uuid primary key default gen_random_uuid(),
  delivery_way_id text not null,
  pickup_id text,
  customer_name text,
  customer_phone text,
  source_channel text not null,
  issue_type text not null,
  priority text not null default 'medium',
  customer_voice_text text not null,
  auto_routed_department text not null,
  current_department text not null,
  workflow_status text not null default 'OPEN',
  resolution_status text,
  due_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  idempotency_key text
);

create table if not exists public.be_customer_voice_actions (
  id uuid primary key default gen_random_uuid(),
  customer_voice_id uuid not null references public.be_customer_voices(id) on delete restrict,
  action_type text not null,
  action_note text,
  department text,
  actor_id uuid not null default auth.uid(),
  actor_role text,
  resulting_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.be_customer_voice_escalations (
  id uuid primary key default gen_random_uuid(),
  customer_voice_id uuid not null references public.be_customer_voices(id) on delete restrict,
  escalation_reason text not null,
  requested_department text,
  status text not null default 'PENDING',
  raised_by uuid not null default auth.uid(),
  raised_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text
);

create table if not exists public.be_customer_voice_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_voice_id uuid not null references public.be_customer_voices(id) on delete restrict,
  destination_department text not null,
  status text not null default 'QUEUED',
  transport_status text,
  transport_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  seen_at timestamptz,
  acknowledged_at timestamptz,
  actioned_at timestamptz,
  resolved_at timestamptz
);

create unique index if not exists be_customer_voices_creator_idempotency_uidx
  on public.be_customer_voices(created_by, idempotency_key)
  where idempotency_key is not null;

create index if not exists be_customer_voices_way_created_idx
  on public.be_customer_voices(delivery_way_id, created_at desc);

create index if not exists be_customer_voices_owner_status_created_idx
  on public.be_customer_voices(current_department, workflow_status, created_at desc);

create index if not exists be_customer_voice_actions_voice_created_idx
  on public.be_customer_voice_actions(customer_voice_id, created_at);

create index if not exists be_customer_voice_escalations_voice_status_idx
  on public.be_customer_voice_escalations(customer_voice_id, status, raised_at desc);

create index if not exists be_customer_voice_notifications_voice_status_idx
  on public.be_customer_voice_notifications(customer_voice_id, status, created_at);

alter table public.be_customer_voices enable row level security;
alter table public.be_customer_voice_actions enable row level security;
alter table public.be_customer_voice_escalations enable row level security;
alter table public.be_customer_voice_notifications enable row level security;

-- No permissive direct-table policies are added in V41. All workflow reads/writes are
-- mediated by guarded SECURITY DEFINER RPCs so existing territory and role helpers remain authoritative.
revoke all on public.be_customer_voices from anon;
revoke all on public.be_customer_voice_actions from anon;
revoke all on public.be_customer_voice_escalations from anon;
revoke all on public.be_customer_voice_notifications from anon;
revoke all on public.be_customer_voices from authenticated;
revoke all on public.be_customer_voice_actions from authenticated;
revoke all on public.be_customer_voice_escalations from authenticated;
revoke all on public.be_customer_voice_notifications from authenticated;

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
        nullif(p.parcel_json->>'branch_code', ''),
        coalesce(
          nullif(p.parcel_json->>'township', ''),
          nullif(p.parcel_json->>'delivery_township', ''),
          nullif(p.parcel_json->>'recipient_township', '')
        ),
        'read'
      )
      or public.be_customer_service_can_manage_pickup_request(
        nullif(p.parcel_json->>'branch_code', ''),
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
          p.parcel_json->>'delivery_address',
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
      'recipient_phone', coalesce(e.parcel_json->>'recipient_phone', e.parcel_json->>'customer_phone'),
      'delivery_address', coalesce(e.parcel_json->>'delivery_address', e.parcel_json->>'address'),
      'township', coalesce(e.parcel_json->>'township', e.parcel_json->>'delivery_township'),
      'ward', coalesce(e.parcel_json->>'ward', e.parcel_json->>'source_ward'),
      'postal_code', coalesce(e.parcel_json->>'postal_code', e.parcel_json->>'source_postal_code'),
      'branch_code', e.parcel_json->>'branch_code',
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
