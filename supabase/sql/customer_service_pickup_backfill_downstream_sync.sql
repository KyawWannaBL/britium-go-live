-- Backfill Customer Service pickups created before the go-live compatibility RPC was applied.
-- Run once after sql/customer_service_go_live_rpc_compatibility.sql succeeds.

insert into public.be_portal_cargo_events (
  pickup_id, pickup_way_id, event_type, event_status, status, source_module,
  source_table, source_key, branch_code, pickup_date, merchant_code, merchant_name,
  sender_name, sender_phone, pickup_address, pickup_township, pickup_city,
  remarks, payload, metadata, created_at, updated_at
)
select
  coalesce(p.pickup_id, p.pickup_way_id),
  coalesce(p.pickup_way_id, p.pickup_id),
  'PICKUP_SUBMITTED',
  'submitted',
  'submitted',
  coalesce(nullif(p.source_portal, ''), nullif(p.source, ''), 'customer_service'),
  'be_portal_pickup_requests',
  coalesce(p.pickup_id, p.pickup_way_id) || ':pickup_submitted',
  coalesce(p.branch_code, p.assigned_branch, 'YGN'),
  p.pickup_date,
  p.merchant_code,
  p.merchant_name,
  p.sender_name,
  p.sender_phone,
  p.pickup_address,
  coalesce(p.pickup_township, p.township),
  p.pickup_city,
  'Backfilled downstream sync for existing pickup.',
  coalesce(p.payload, '{}'::jsonb),
  jsonb_build_object('downstream_sync', true, 'backfill', true),
  coalesce(p.created_at, now()),
  now()
from public.be_portal_pickup_requests p
where coalesce(p.pickup_id, p.pickup_way_id, '') <> ''
  and lower(coalesce(p.status, '')) not in ('cancelled','completed','delivered','failed','mock','sample','demo','archived_test_data')
  and not exists (
    select 1
    from public.be_portal_cargo_events e
    where e.pickup_id = coalesce(p.pickup_id, p.pickup_way_id)
      and e.event_type = 'PICKUP_SUBMITTED'
  );

insert into public.be_app_notifications (
  event_key, pickup_id, pickup_way_id, title, body, message, target_role, target_branch,
  source_table, source_key, notification_type, category, status, is_read, payload, metadata, created_at, updated_at
)
select
  coalesce(p.pickup_id, p.pickup_way_id) || ':pickup_submitted:' || role_name,
  coalesce(p.pickup_id, p.pickup_way_id),
  coalesce(p.pickup_way_id, p.pickup_id),
  'New pickup request',
  'Pickup ' || coalesce(p.pickup_id, p.pickup_way_id) || ' requires workflow action.',
  'Pickup ' || coalesce(p.pickup_id, p.pickup_way_id) || ' requires workflow action.',
  role_name,
  coalesce(p.branch_code, p.assigned_branch, 'YGN'),
  'be_portal_pickup_requests',
  coalesce(p.pickup_id, p.pickup_way_id) || ':pickup_submitted:' || role_name,
  'pickup_submitted',
  'pickup_submitted',
  'unread',
  false,
  coalesce(p.payload, '{}'::jsonb),
  jsonb_build_object('downstream_sync', true, 'backfill', true, 'target_role', role_name),
  now(),
  now()
from public.be_portal_pickup_requests p
cross join unnest(array[
  'customer_service',
  'data_entry',
  'supervisor',
  'operation_manager',
  'dispatch',
  'warehouse',
  'branch_office'
]) as role_name
where coalesce(p.pickup_id, p.pickup_way_id, '') <> ''
  and lower(coalesce(p.status, '')) not in ('cancelled','completed','delivered','failed','mock','sample','demo','archived_test_data')
  and not exists (
    select 1
    from public.be_app_notifications n
    where n.source_key = coalesce(p.pickup_id, p.pickup_way_id) || ':pickup_submitted:' || role_name
  );

update public.be_portal_pickup_requests
set data_entry_status = coalesce(nullif(data_entry_status, ''), 'pending'),
    assignment_status = case
      when lower(coalesce(assignment_status, '')) in ('assigned','pickup_assigned','dispatched') then assignment_status
      else 'pending_assignment'
    end,
    operation_status = coalesce(nullif(operation_status, ''), 'submitted'),
    updated_at = now()
where coalesce(pickup_id, pickup_way_id, '') <> ''
  and lower(coalesce(status, '')) not in ('cancelled','completed','delivered','failed','mock','sample','demo','archived_test_data');

select
  (select count(*) from public.be_portal_pickup_requests where coalesce(pickup_id, pickup_way_id, '') <> '') as pickup_requests,
  (select count(*) from public.be_portal_cargo_events where event_type = 'PICKUP_SUBMITTED') as pickup_submitted_events,
  (select count(*) from public.be_app_notifications where notification_type = 'pickup_submitted') as pickup_notifications;
