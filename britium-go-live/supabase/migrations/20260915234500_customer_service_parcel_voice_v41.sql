-- V41 Customer Service parcel-centric voice workflow
-- Branch-only migration until staging/production release gates are approved.

create extension if not exists pgcrypto;

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
  closed_at timestamptz,
  idempotency_key text,
  constraint be_customer_voices_priority_chk check (priority in ('low','medium','high','urgent')),
  constraint be_customer_voices_workflow_status_chk check (workflow_status in ('OPEN','ACKNOWLEDGED','IN_PROGRESS','ESCALATED','RESOLVED','CLOSED'))
);

create unique index if not exists be_customer_voices_creator_idempotency_uidx
  on public.be_customer_voices(created_by, idempotency_key)
  where idempotency_key is not null;
create index if not exists be_customer_voices_way_created_idx
  on public.be_customer_voices(delivery_way_id, created_at desc);
create index if not exists be_customer_voices_department_status_created_idx
  on public.be_customer_voices(current_department, workflow_status, created_at desc);

create table if not exists public.be_customer_voice_actions (
  id uuid primary key default gen_random_uuid(),
  customer_voice_id uuid not null references public.be_customer_voices(id) on delete cascade,
  action_type text not null,
  from_status text,
  to_status text,
  from_department text,
  to_department text,
  action_note text,
  action_payload jsonb not null default '{}'::jsonb,
  actor_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists be_customer_voice_actions_voice_created_idx
  on public.be_customer_voice_actions(customer_voice_id, created_at);

create table if not exists public.be_customer_voice_escalations (
  id uuid primary key default gen_random_uuid(),
  customer_voice_id uuid not null references public.be_customer_voices(id) on delete cascade,
  reason text not null,
  severity text not null default 'high',
  escalated_by uuid not null default auth.uid(),
  escalated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text,
  constraint be_customer_voice_escalations_severity_chk check (severity in ('medium','high','urgent'))
);
create index if not exists be_customer_voice_escalations_voice_created_idx
  on public.be_customer_voice_escalations(customer_voice_id, escalated_at desc);

create table if not exists public.be_customer_voice_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_voice_id uuid not null references public.be_customer_voices(id) on delete cascade,
  department text not null,
  channel text not null default 'in_app',
  recipient text,
  status text not null default 'PENDING',
  error_message text,
  notification_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint be_customer_voice_notifications_status_chk check (status in ('PENDING','SENT','FAILED','SKIPPED'))
);
create index if not exists be_customer_voice_notifications_voice_status_created_idx
  on public.be_customer_voice_notifications(customer_voice_id, status, created_at);

create or replace function public.be_cs_normalize_role(p_role text)
returns text language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(p_role,'')), '[ _-]+', '_', 'g'));
$$;

create or replace function public.be_cs_actor_department()
returns text
language plpgsql
stable security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text := public.be_cs_normalize_role(coalesce(public.be_current_user_role(), public.be_current_role(), ''));
begin
  return case
    when v_role in ('super_admin','superadmin','app_owner','sys') then 'superadmin'
    when v_role in ('customer_service','cs','support') then 'customer_service'
    when v_role in ('warehouse_staff','warehouse','sorter') then 'warehouse'
    when v_role in ('finance','finance_user','accountant') then 'finance'
    when v_role in ('data_entry','encoder') then 'data_entry'
    when v_role in ('pickup_supervisor','supervisor') then 'pickup_supervisor'
    when v_role in ('admin','operations_admin','operations','wayplan_manager','dispatch') then 'operations'
    else null
  end;
end;
$$;

create or replace function public.be_cs_can_access_delivery_way(
  p_delivery_way_id text,
  p_action text default 'read'
) returns boolean
language plpgsql
stable security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.be_cs_normalize_role(coalesce(public.be_current_user_role(), public.be_current_role(), ''));
  v_branch_code text;
  v_township text;
  v_department text := public.be_cs_actor_department();
begin
  if v_uid is null or nullif(btrim(coalesce(p_delivery_way_id,'')), '') is null then return false; end if;
  if v_role in ('super_admin','superadmin','app_owner','sys') then return true; end if;

  select p.branch_code,
         coalesce(p.delivery_township, p.pickup_township, d.township)
    into v_branch_code, v_township
    from public.be_data_entry_parcel_details d
    left join public.be_portal_pickup_requests p
      on d.pickup_id in (p.pickup_id, p.pickup_way_id, p.canonical_pickup_id)
   where d.delivery_way_id = p_delivery_way_id
   order by d.updated_at desc nulls last
   limit 1;

  if not found then return false; end if;

  if v_department = 'customer_service' then
    return public.be_employee_can_access_territory(null, v_branch_code, v_township, 'read')
       or public.be_customer_service_can_manage_pickup_request(v_branch_code, v_township, case when lower(coalesce(p_action,'read'))='read' then 'read' else 'update' end);
  end if;

  return public.be_employee_can_access_territory(
    null, v_branch_code, v_township,
    case when lower(coalesce(p_action,'read'))='read' then 'read' else 'update' end
  );
end;
$$;

alter table public.be_customer_voices enable row level security;
alter table public.be_customer_voice_actions enable row level security;
alter table public.be_customer_voice_escalations enable row level security;
alter table public.be_customer_voice_notifications enable row level security;

revoke all on public.be_customer_voices from anon;
revoke all on public.be_customer_voice_actions from anon;
revoke all on public.be_customer_voice_escalations from anon;
revoke all on public.be_customer_voice_notifications from anon;
grant select on public.be_customer_voices to authenticated;
grant select on public.be_customer_voice_actions to authenticated;
grant select on public.be_customer_voice_escalations to authenticated;
grant select on public.be_customer_voice_notifications to authenticated;

create policy be_customer_voices_read_v41 on public.be_customer_voices
for select to authenticated
using (
  public.be_cs_can_access_delivery_way(delivery_way_id, 'read')
  and (
    public.be_cs_actor_department() in ('customer_service','superadmin')
    or public.be_cs_actor_department() = current_department
  )
);

create policy be_customer_voice_actions_read_v41 on public.be_customer_voice_actions
for select to authenticated
using (exists (
  select 1 from public.be_customer_voices v
   where v.id = customer_voice_id
     and public.be_cs_can_access_delivery_way(v.delivery_way_id, 'read')
     and (public.be_cs_actor_department() in ('customer_service','superadmin') or public.be_cs_actor_department() = v.current_department)
));

create policy be_customer_voice_escalations_read_v41 on public.be_customer_voice_escalations
for select to authenticated
using (exists (
  select 1 from public.be_customer_voices v
   where v.id = customer_voice_id
     and public.be_cs_can_access_delivery_way(v.delivery_way_id, 'read')
     and (public.be_cs_actor_department() in ('customer_service','superadmin') or public.be_cs_actor_department() = v.current_department)
));

create policy be_customer_voice_notifications_read_v41 on public.be_customer_voice_notifications
for select to authenticated
using (exists (
  select 1 from public.be_customer_voices v
   where v.id = customer_voice_id
     and public.be_cs_can_access_delivery_way(v.delivery_way_id, 'read')
     and (public.be_cs_actor_department() in ('customer_service','superadmin') or public.be_cs_actor_department() = v.current_department)
));

create or replace function public.be_cs_parcel_support_queue(
  p_limit integer default 300,
  p_search text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_q text := lower(btrim(coalesce(p_search,'')));
  v_limit integer := greatest(1, least(coalesce(p_limit,300), 500));
  v_rows jsonb;
  v_total integer := 0;
  v_open integer := 0;
  v_escalated integer := 0;
  v_urgent integer := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if public.be_cs_actor_department() is null then raise exception 'CUSTOMER_SERVICE_ACCESS_REQUIRED' using errcode='42501'; end if;

  with base as (
    select
      d.delivery_way_id,
      d.pickup_id,
      d.recipient_name,
      d.contact_no_1 as recipient_phone,
      d.township,
      d.city,
      d.region_state,
      d.recipient_address,
      d.parcel_status,
      d.warehouse_status,
      d.way_management_status as operation_status,
      d.finance_status,
      d.assigned_rider_id,
      d.assigned_rider_name,
      d.cod_amount,
      d.actual_collect,
      d.delivery_fee,
      d.item_price,
      d.updated_at,
      p.merchant_name,
      p.merchant_code,
      p.branch_code,
      p.assigned_driver_name,
      p.assigned_helper_name,
      p.assigned_vehicle_plate,
      ws.scan_type as latest_warehouse_event,
      ws.scan_note as latest_warehouse_note,
      ws.created_at as latest_warehouse_event_at,
      oe.to_status as latest_operation_event,
      oe.event_note as latest_operation_note,
      oe.created_at as latest_operation_event_at,
      se.event_name as latest_status_event,
      se.source_module as latest_status_source,
      se.created_at as latest_status_event_at,
      coalesce(cv.open_voice_count,0)::integer as open_voice_count,
      cv.current_owner_department,
      cv.latest_customer_voice,
      cv.latest_internal_action,
      coalesce(cv.escalation_flag,false) as escalation_flag,
      cv.sla_due_at,
      cv.latest_priority
    from public.be_data_entry_parcel_details d
    left join public.be_portal_pickup_requests p
      on d.pickup_id in (p.pickup_id, p.pickup_way_id, p.canonical_pickup_id)
    left join lateral (
      select w.scan_type,w.scan_note,w.created_at from public.be_warehouse_scan_events w
       where w.pickup_id=d.pickup_id or w.waybill_no=d.delivery_way_id
       order by w.created_at desc nulls last limit 1
    ) ws on true
    left join lateral (
      select o.to_status,o.event_note,o.created_at from public.be_operational_events o
       where o.pickup_id=d.pickup_id or o.waybill_no=d.delivery_way_id
       order by o.created_at desc nulls last limit 1
    ) oe on true
    left join lateral (
      select s.event_name,s.source_module,s.created_at from public.be_waybill_status_events s
       where s.pickup_id=d.pickup_id or s.waybill_no=d.delivery_way_id
       order by s.created_at desc nulls last limit 1
    ) se on true
    left join lateral (
      select
        count(*) filter (where v.workflow_status not in ('RESOLVED','CLOSED')) as open_voice_count,
        (array_agg(v.current_department order by v.created_at desc))[1] as current_owner_department,
        (array_agg(v.customer_voice_text order by v.created_at desc))[1] as latest_customer_voice,
        (array_agg(a.action_note order by a.created_at desc nulls last))[1] as latest_internal_action,
        bool_or(v.workflow_status='ESCALATED' or e.id is not null) as escalation_flag,
        min(v.due_at) filter (where v.workflow_status not in ('RESOLVED','CLOSED')) as sla_due_at,
        (array_agg(v.priority order by v.created_at desc))[1] as latest_priority
      from public.be_customer_voices v
      left join lateral (
        select aa.action_note,aa.created_at from public.be_customer_voice_actions aa
         where aa.customer_voice_id=v.id order by aa.created_at desc limit 1
      ) a on true
      left join lateral (
        select ee.id from public.be_customer_voice_escalations ee
         where ee.customer_voice_id=v.id and ee.resolved_at is null order by ee.escalated_at desc limit 1
      ) e on true
      where v.delivery_way_id=d.delivery_way_id
    ) cv on true
    where public.be_cs_can_access_delivery_way(d.delivery_way_id,'read')
      and (
        v_q=''
        or lower(coalesce(d.delivery_way_id,'')) like '%'||v_q||'%'
        or lower(coalesce(d.pickup_id,'')) like '%'||v_q||'%'
        or lower(coalesce(d.recipient_name,'')) like '%'||v_q||'%'
        or lower(coalesce(d.contact_no_1,'')) like '%'||v_q||'%'
        or lower(coalesce(p.merchant_name,'')) like '%'||v_q||'%'
        or lower(coalesce(p.merchant_code,'')) like '%'||v_q||'%'
      )
    order by d.updated_at desc nulls last
    limit v_limit
  )
  select
    coalesce(jsonb_agg(to_jsonb(base) order by updated_at desc nulls last),'[]'::jsonb),
    count(*),
    coalesce(sum((open_voice_count>0)::int),0),
    coalesce(sum(escalation_flag::int),0),
    coalesce(sum((lower(coalesce(latest_priority,''))='urgent')::int),0)
  into v_rows,v_total,v_open,v_escalated,v_urgent
  from base;

  return jsonb_build_object(
    'ok',true,
    'summary',jsonb_build_object(
      'total_records',coalesce(v_total,0),
      'open_voices',coalesce(v_open,0),
      'escalated',coalesce(v_escalated,0),
      'urgent',coalesce(v_urgent,0)
    ),
    'rows',coalesce(v_rows,'[]'::jsonb)
  );
end;
$$;

revoke all on function public.be_cs_parcel_support_queue(integer,text) from public, anon;
grant execute on function public.be_cs_parcel_support_queue(integer,text) to authenticated;
