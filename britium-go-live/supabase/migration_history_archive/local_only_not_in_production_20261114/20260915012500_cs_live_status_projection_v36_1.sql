-- V36.1: project the live parcel lifecycle into the existing CS queue field names
-- so the current command center immediately displays Data Entry/Warehouse/Ops updates.

create or replace function public.be_customer_service_pickup_requests(p_limit integer default 50)
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

  select jsonb_build_object(
    'ok', true,
    'items', coalesce(jsonb_agg(t.item order by t.created_at desc), '[]'::jsonb),
    'data', coalesce(jsonb_agg(t.item order by t.created_at desc), '[]'::jsonb)
  )
  into v_result
  from (
    select
      p.created_at,
      to_jsonb(p) || jsonb_build_object(
        'delivery_way_id', coalesce(d.delivery_way_id, p.delivery_way_id, p.waybill_no),
        'delivery_status', coalesce(d.parcel_status, p.delivery_status, p.status),
        'warehouse_status', coalesce(d.warehouse_status, p.warehouse_status),
        'operation_status', coalesce(d.way_management_status, oe.to_status, p.operation_status, p.dispatch_status),
        'dispatch_status', coalesce(oe.to_status, d.way_management_status, p.dispatch_status),
        'finance_status', coalesce(d.finance_status, p.finance_status),
        'assigned_rider_name', coalesce(d.assigned_rider_name, p.assigned_rider_name),
        'live_delivery_way_id', coalesce(d.delivery_way_id, p.delivery_way_id, p.waybill_no),
        'live_parcel_status', coalesce(d.parcel_status, p.delivery_status, p.status),
        'live_warehouse_status', coalesce(d.warehouse_status, p.warehouse_status),
        'live_operation_status', coalesce(d.way_management_status, oe.to_status, p.operation_status, p.dispatch_status),
        'live_finance_status', coalesce(d.finance_status, p.finance_status),
        'data_entry_updated_at', d.updated_at,
        'latest_warehouse_event', ws.scan_type,
        'latest_warehouse_note', ws.scan_note,
        'latest_warehouse_event_at', ws.created_at,
        'latest_operation_event', oe.to_status,
        'latest_operation_note', oe.event_note,
        'latest_operation_event_at', oe.created_at,
        'latest_status_event_code', se.event_code,
        'latest_status_event_name', se.event_name,
        'latest_status_source', se.source_module,
        'latest_status_event_at', se.created_at
      ) as item
    from public.be_portal_pickup_requests p
    left join lateral (
      select d1.delivery_way_id, d1.parcel_status, d1.warehouse_status,
             d1.way_management_status, d1.finance_status, d1.assigned_rider_name, d1.updated_at
      from public.be_data_entry_parcel_details d1
      where d1.pickup_id in (p.pickup_id, p.pickup_way_id, p.canonical_pickup_id)
      order by d1.updated_at desc nulls last, d1.created_at desc nulls last
      limit 1
    ) d on true
    left join lateral (
      select w.scan_type, w.scan_note, w.created_at
      from public.be_warehouse_scan_events w
      where w.pickup_id in (p.pickup_id, p.pickup_way_id, p.canonical_pickup_id)
         or (nullif(p.waybill_no, '') is not null and w.waybill_no = p.waybill_no)
      order by w.created_at desc nulls last
      limit 1
    ) ws on true
    left join lateral (
      select o.to_status, o.event_note, o.created_at
      from public.be_operational_events o
      where o.pickup_id in (p.pickup_id, p.pickup_way_id, p.canonical_pickup_id)
         or (nullif(p.waybill_no, '') is not null and o.waybill_no = p.waybill_no)
      order by o.created_at desc nulls last
      limit 1
    ) oe on true
    left join lateral (
      select s.event_code, s.event_name, s.source_module, s.created_at
      from public.be_waybill_status_events s
      where s.pickup_id in (p.pickup_id, p.pickup_way_id, p.canonical_pickup_id)
         or (nullif(p.waybill_no, '') is not null and s.waybill_no = p.waybill_no)
      order by s.created_at desc nulls last
      limit 1
    ) se on true
    where
      public.be_employee_can_access_territory(
        null,
        p.branch_code,
        coalesce(p.delivery_township, p.pickup_township, p.township),
        'read'
      )
      or public.be_customer_service_can_manage_pickup_request(
        p.branch_code,
        coalesce(p.delivery_township, p.pickup_township, p.township),
        'read'
      )
      or p.created_by = auth.uid()
    order by p.created_at desc nulls last
    limit greatest(least(coalesce(p_limit, 50), 500), 1)
  ) t;

  return coalesce(v_result, jsonb_build_object('ok', true, 'items', '[]'::jsonb, 'data', '[]'::jsonb));
end
$$;

revoke all on function public.be_customer_service_pickup_requests(integer) from public, anon;
grant execute on function public.be_customer_service_pickup_requests(integer) to authenticated;
