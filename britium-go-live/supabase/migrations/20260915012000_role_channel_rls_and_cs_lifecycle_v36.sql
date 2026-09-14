-- V36: align role/channel authorization, remove email-only superadmin detection,
-- and provide Customer Service with territory-scoped, read-only parcel lifecycle data.

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    exists (
      select 1
      from public.be_user_account_registry u
      where u.auth_user_id = auth.uid()
        and coalesce(u.active, u.is_active, true)
        and lower(btrim(coalesce(u.status, 'active'))) in ('active', 'enabled')
        and lower(regexp_replace(btrim(coalesce(
          nullif(u.role_code, ''), nullif(u.app_role, ''), nullif(u.user_role, ''), nullif(u.role, ''), ''
        )), '[ _-]+', '_', 'g')) in ('super_admin', 'superadmin', 'app_owner', 'sys')
    )
    or lower(regexp_replace(btrim(coalesce(
      auth.jwt() -> 'user_metadata' ->> 'app_role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'app_role',
      auth.jwt() -> 'app_metadata' ->> 'role',
      ''
    )), '[ _-]+', '_', 'g')) in ('super_admin', 'superadmin', 'app_owner', 'sys');
$$;

create or replace function public.be_employee_can_access_territory(
  p_branch_id uuid,
  p_branch_code text,
  p_township text,
  p_action text default 'read'
)
returns boolean
language plpgsql
stable
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := lower(regexp_replace(btrim(coalesce(
    public.be_current_user_role(), public.be_current_role(), ''
  )), '[ _-]+', '_', 'g'));
  v_action text := lower(btrim(coalesce(p_action, 'read')));
  v_allowed boolean := false;
begin
  if v_uid is null then return false; end if;
  if v_role in ('super_admin','superadmin','app_owner','sys') then return true; end if;

  if v_action = 'read' then
    v_allowed := v_role in (
      'admin','operations_admin','operations','supervisor','wayplan_manager','dispatch',
      'warehouse_staff','warehouse','sorter','data_entry','encoder',
      'customer_service','cs','support','finance','finance_user','accountant','analyst',
      'driver','rider','branch_office','branch_manager','branch_staff','branch_admin'
    );
  elsif v_action = 'create' then
    v_allowed := v_role in (
      'admin','operations_admin','operations','supervisor','data_entry','encoder',
      'branch_office','branch_manager','branch_staff','branch_admin'
    );
  elsif v_action = 'update' then
    -- Customer Service intentionally does not receive generic cross-module writes.
    -- Pickup Request writes are granted through be_customer_service_can_manage_pickup_request().
    v_allowed := v_role in (
      'admin','operations_admin','operations','supervisor','wayplan_manager','dispatch',
      'warehouse_staff','warehouse','sorter','data_entry','encoder','driver','rider',
      'branch_office','branch_manager','branch_staff','branch_admin'
    );
  elsif v_action = 'delete' then
    v_allowed := v_role in ('admin','operations_admin');
  end if;

  if not v_allowed then return false; end if;

  return exists (
    select 1
    from public.be_employee_territory_assignments a
    where a.user_id = v_uid
      and a.active
      and case v_action
        when 'create' then a.can_create
        when 'update' then a.can_update
        when 'delete' then a.can_delete
        else a.can_read
      end
      and (
        a.scope_type = 'GLOBAL'
        or (a.scope_type = 'BRANCH' and (
          (p_branch_id is not null and a.branch_id = p_branch_id)
          or (nullif(btrim(p_branch_code), '') is not null
              and lower(btrim(a.branch_code)) = lower(btrim(p_branch_code)))
        ))
        or (a.scope_type = 'TOWNSHIP'
            and public.be_normalize_territory_key(a.township_key) = public.be_normalize_territory_key(p_township))
      )
  );
end
$$;

-- Explicitly record the Customer Service read-only dependencies in the authority matrix.
update public.be_role_authority_matrix
set rights = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(rights, '{}'::jsonb),
        '{modules,data_entry_tracking}', '{"view":true,"create":false,"update":false,"delete":false}'::jsonb, true),
      '{modules,warehouse_tracking}', '{"view":true,"create":false,"update":false,"delete":false}'::jsonb, true),
    '{modules,operations_tracking}', '{"view":true,"create":false,"update":false,"delete":false}'::jsonb, true),
  '{modules,parcel_tracking}', '{"view":true,"create":false,"update":false,"delete":false,"export":true}'::jsonb, true)
where lower(role_id) = 'customer_service';

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
    'items', coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb),
    'data', coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  )
  into v_result
  from (
    select
      p.*,
      coalesce(d.delivery_way_id, p.delivery_way_id, p.waybill_no) as live_delivery_way_id,
      coalesce(d.parcel_status, p.delivery_status, p.status) as live_parcel_status,
      coalesce(d.warehouse_status, p.warehouse_status) as live_warehouse_status,
      coalesce(d.way_management_status, p.operation_status, p.dispatch_status) as live_operation_status,
      coalesce(d.finance_status, p.finance_status) as live_finance_status,
      d.assigned_rider_name as live_rider_name,
      d.updated_at as data_entry_updated_at,
      ws.scan_type as latest_warehouse_event,
      ws.scan_note as latest_warehouse_note,
      ws.created_at as latest_warehouse_event_at,
      oe.to_status as latest_operation_event,
      oe.event_note as latest_operation_note,
      oe.created_at as latest_operation_event_at,
      se.event_code as latest_status_event_code,
      se.event_name as latest_status_event_name,
      se.source_module as latest_status_source,
      se.created_at as latest_status_event_at
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

create or replace function public.be_customer_service_parcel_lookup(
  p_query text default '',
  p_limit integer default 100
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
  v_q text := lower(btrim(coalesce(p_query, '')));
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
    'items', coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc nulls last), '[]'::jsonb)
  ) into v_result
  from (
    select
      d.pickup_id,
      d.delivery_way_id,
      d.recipient_name,
      d.contact_no_1 as recipient_phone,
      d.township,
      d.recipient_address,
      d.parcel_status,
      d.warehouse_status,
      d.way_management_status as operation_status,
      d.finance_status,
      d.assigned_rider_name,
      d.cod_amount,
      d.updated_at,
      p.merchant_name,
      p.merchant_code,
      p.branch_code,
      ws.scan_type as latest_warehouse_event,
      ws.scan_note as latest_warehouse_note,
      ws.created_at as latest_warehouse_event_at,
      oe.to_status as latest_operation_event,
      oe.event_note as latest_operation_note,
      oe.created_at as latest_operation_event_at,
      se.event_name as latest_status_event,
      se.source_module as latest_status_source,
      se.created_at as latest_status_event_at
    from public.be_data_entry_parcel_details d
    left join public.be_portal_pickup_requests p
      on d.pickup_id in (p.pickup_id, p.pickup_way_id, p.canonical_pickup_id)
    left join lateral (
      select w.scan_type, w.scan_note, w.created_at
      from public.be_warehouse_scan_events w
      where w.pickup_id = d.pickup_id or w.waybill_no = d.delivery_way_id
      order by w.created_at desc nulls last
      limit 1
    ) ws on true
    left join lateral (
      select o.to_status, o.event_note, o.created_at
      from public.be_operational_events o
      where o.pickup_id = d.pickup_id or o.waybill_no = d.delivery_way_id
      order by o.created_at desc nulls last
      limit 1
    ) oe on true
    left join lateral (
      select s.event_name, s.source_module, s.created_at
      from public.be_waybill_status_events s
      where s.pickup_id = d.pickup_id or s.waybill_no = d.delivery_way_id
      order by s.created_at desc nulls last
      limit 1
    ) se on true
    where (
      public.be_employee_can_access_territory(
        null,
        p.branch_code,
        coalesce(p.delivery_township, p.pickup_township, d.township),
        'read'
      )
      or public.be_customer_service_can_manage_pickup_request(
        p.branch_code,
        coalesce(p.delivery_township, p.pickup_township, d.township),
        'read'
      )
    )
    and (
      v_q = ''
      or lower(coalesce(d.delivery_way_id, '')) like '%' || v_q || '%'
      or lower(coalesce(d.pickup_id, '')) like '%' || v_q || '%'
      or lower(coalesce(d.recipient_name, '')) like '%' || v_q || '%'
      or lower(coalesce(d.contact_no_1, '')) like '%' || v_q || '%'
      or lower(coalesce(p.merchant_name, '')) like '%' || v_q || '%'
      or lower(coalesce(p.merchant_code, '')) like '%' || v_q || '%'
    )
    order by d.updated_at desc nulls last
    limit greatest(least(coalesce(p_limit, 100), 500), 1)
  ) x;

  return coalesce(v_result, jsonb_build_object('ok', true, 'items', '[]'::jsonb));
end
$$;

create or replace function public.be_customer_service_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text := lower(regexp_replace(btrim(coalesce(
    public.be_current_user_role(), public.be_current_role(), ''
  )), '[ _-]+', '_', 'g'));
  v_merchants_raw jsonb := '{}'::jsonb;
  v_merchants jsonb := '[]'::jsonb;
  v_pickups_raw jsonb := '{}'::jsonb;
  v_pickups jsonb := '[]'::jsonb;
  v_parcels_raw jsonb := '{}'::jsonb;
  v_parcels jsonb := '[]'::jsonb;
  v_history jsonb := '{}'::jsonb;
  v_merchant_count integer := 0;
  v_open_requests integer := 0;
  v_urgent_requests integer := 0;
  v_total_tickets integer := 0;
  v_open_tickets integer := 0;
  v_urgent_tickets integer := 0;
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

  v_merchants_raw := public.be_customer_service_merchant_options();
  v_merchants := case
    when jsonb_typeof(v_merchants_raw) = 'array' then v_merchants_raw
    when jsonb_typeof(v_merchants_raw -> 'merchants') = 'array' then v_merchants_raw -> 'merchants'
    when jsonb_typeof(v_merchants_raw -> 'items') = 'array' then v_merchants_raw -> 'items'
    when jsonb_typeof(v_merchants_raw -> 'rows') = 'array' then v_merchants_raw -> 'rows'
    else '[]'::jsonb
  end;
  v_merchant_count := jsonb_array_length(v_merchants);

  v_pickups_raw := public.be_customer_service_pickup_requests(100);
  v_pickups := coalesce(v_pickups_raw -> 'items', '[]'::jsonb);

  v_parcels_raw := public.be_customer_service_parcel_lookup('', 100);
  v_parcels := coalesce(v_parcels_raw -> 'items', '[]'::jsonb);

  v_history := public.be_cs_ticket_history('', 100);

  select
    count(*) filter (where lower(coalesce(x ->> 'status', '')) not in ('closed','cancelled','delivered'))::integer,
    count(*) filter (where lower(coalesce(x ->> 'priority', x -> 'payload' ->> 'priority', '')) in ('urgent','critical','high'))::integer
  into v_open_requests, v_urgent_requests
  from jsonb_array_elements(v_pickups) x;

  select
    count(*)::integer,
    count(*) filter (where lower(coalesce(status, 'open')) not in ('resolved','closed','cancelled'))::integer,
    count(*) filter (
      where lower(coalesce(priority, 'medium')) in ('urgent','critical','high')
        and lower(coalesce(status, 'open')) not in ('resolved','closed','cancelled')
    )::integer
  into v_total_tickets, v_open_tickets, v_urgent_tickets
  from public.be_cs_tickets;

  return jsonb_build_object(
    'ok', true,
    'status', 'ready',
    'total_tickets', v_total_tickets,
    'open_tickets', v_open_tickets,
    'urgent_tickets', v_urgent_tickets,
    'open_requests', v_open_requests,
    'pickup_requests', v_open_requests,
    'urgent_open', v_urgent_requests + v_urgent_tickets,
    'merchant_options', v_merchant_count,
    'stats', jsonb_build_object(
      'total_tickets', v_total_tickets,
      'open_tickets', v_open_tickets,
      'urgent_tickets', v_urgent_tickets,
      'open_requests', v_open_requests,
      'pickup_requests', v_open_requests,
      'urgent_open', v_urgent_requests + v_urgent_tickets,
      'merchant_options', v_merchant_count,
      'parcel_updates', jsonb_array_length(v_parcels)
    ),
    'merchants', v_merchants,
    'pickups', v_pickups,
    'recent_pickups', v_pickups,
    'parcel_updates', v_parcels,
    'tickets', coalesce(v_history -> 'tickets', '[]'::jsonb),
    'recent_inquiries', coalesce(v_history -> 'tickets', '[]'::jsonb),
    'messages', coalesce(v_history -> 'messages', '[]'::jsonb)
  );
end
$$;

-- Harden the three lifecycle event tables that previously granted ALL to every authenticated account.
create or replace function public.be_lifecycle_event_scope_readable(p_pickup_id text, p_waybill_no text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text := lower(regexp_replace(btrim(coalesce(
    public.be_current_user_role(), public.be_current_role(), ''
  )), '[ _-]+', '_', 'g'));
begin
  if auth.uid() is null then return false; end if;
  if v_role in ('super_admin','superadmin','app_owner','sys') then return true; end if;

  return exists (
    select 1
    from public.be_portal_pickup_requests p
    where (
      p.pickup_id = p_pickup_id
      or p.pickup_way_id = p_pickup_id
      or p.canonical_pickup_id = p_pickup_id
      or (nullif(p_waybill_no, '') is not null and (
        p.waybill_no = p_waybill_no
        or p.delivery_way_id = p_waybill_no
        or exists (
          select 1 from public.be_data_entry_parcel_details d
          where d.pickup_id in (p.pickup_id, p.pickup_way_id, p.canonical_pickup_id)
            and d.delivery_way_id = p_waybill_no
        )
      ))
    )
    and (
      public.be_employee_can_access_territory(null, p.branch_code,
        coalesce(p.delivery_township, p.pickup_township, p.township), 'read')
      or public.be_customer_service_can_manage_pickup_request(p.branch_code,
        coalesce(p.delivery_township, p.pickup_township, p.township), 'read')
    )
  );
end
$$;

create or replace function public.be_lifecycle_event_write_allowed(p_pickup_id text, p_waybill_no text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text := lower(regexp_replace(btrim(coalesce(
    public.be_current_user_role(), public.be_current_role(), ''
  )), '[ _-]+', '_', 'g'));
begin
  if auth.uid() is null then return false; end if;
  if v_role in ('super_admin','superadmin','app_owner','sys') then return true; end if;
  if v_role not in (
    'admin','operations_admin','operations','supervisor','wayplan_manager','dispatch',
    'warehouse_staff','warehouse','sorter','data_entry','encoder','driver','rider',
    'branch_office','branch_manager','branch_staff','branch_admin'
  ) then return false; end if;
  return public.be_lifecycle_event_scope_readable(p_pickup_id, p_waybill_no);
end
$$;

drop policy if exists be_warehouse_scan_events_all on public.be_warehouse_scan_events;
drop policy if exists be_operational_events_all on public.be_operational_events;
drop policy if exists be_waybill_status_events_all on public.be_waybill_status_events;

create policy be_warehouse_scan_events_role_read_v36
on public.be_warehouse_scan_events for select to authenticated
using (public.be_lifecycle_event_scope_readable(pickup_id, waybill_no));
create policy be_warehouse_scan_events_role_insert_v36
on public.be_warehouse_scan_events for insert to authenticated
with check (public.be_lifecycle_event_write_allowed(pickup_id, waybill_no));
create policy be_warehouse_scan_events_role_update_v36
on public.be_warehouse_scan_events for update to authenticated
using (public.be_lifecycle_event_write_allowed(pickup_id, waybill_no))
with check (public.be_lifecycle_event_write_allowed(pickup_id, waybill_no));
create policy be_warehouse_scan_events_role_delete_v36
on public.be_warehouse_scan_events for delete to authenticated
using (public.is_superadmin() or lower(regexp_replace(coalesce(public.be_current_role(),''), '[ _-]+','_','g')) in ('admin','operations_admin'));

create policy be_operational_events_role_read_v36
on public.be_operational_events for select to authenticated
using (public.be_lifecycle_event_scope_readable(pickup_id, waybill_no));
create policy be_operational_events_role_insert_v36
on public.be_operational_events for insert to authenticated
with check (public.be_lifecycle_event_write_allowed(pickup_id, waybill_no));
create policy be_operational_events_role_update_v36
on public.be_operational_events for update to authenticated
using (public.be_lifecycle_event_write_allowed(pickup_id, waybill_no))
with check (public.be_lifecycle_event_write_allowed(pickup_id, waybill_no));
create policy be_operational_events_role_delete_v36
on public.be_operational_events for delete to authenticated
using (public.is_superadmin() or lower(regexp_replace(coalesce(public.be_current_role(),''), '[ _-]+','_','g')) in ('admin','operations_admin'));

create policy be_waybill_status_events_role_read_v36
on public.be_waybill_status_events for select to authenticated
using (public.be_lifecycle_event_scope_readable(pickup_id, waybill_no));
create policy be_waybill_status_events_role_insert_v36
on public.be_waybill_status_events for insert to authenticated
with check (public.be_lifecycle_event_write_allowed(pickup_id, waybill_no));
create policy be_waybill_status_events_role_update_v36
on public.be_waybill_status_events for update to authenticated
using (public.be_lifecycle_event_write_allowed(pickup_id, waybill_no))
with check (public.be_lifecycle_event_write_allowed(pickup_id, waybill_no));
create policy be_waybill_status_events_role_delete_v36
on public.be_waybill_status_events for delete to authenticated
using (public.is_superadmin() or lower(regexp_replace(coalesce(public.be_current_role(),''), '[ _-]+','_','g')) in ('admin','operations_admin'));

revoke all on function public.be_customer_service_pickup_requests(integer) from public, anon;
revoke all on function public.be_customer_service_parcel_lookup(text, integer) from public, anon;
revoke all on function public.be_customer_service_snapshot() from public, anon;
grant execute on function public.be_customer_service_pickup_requests(integer) to authenticated;
grant execute on function public.be_customer_service_parcel_lookup(text, integer) to authenticated;
grant execute on function public.be_customer_service_snapshot() to authenticated;
