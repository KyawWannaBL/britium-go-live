begin;

create or replace function public.be_warehouse_scan_lifecycle_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_stats jsonb := jsonb_build_object(
    'rows', 0,
    'received', 0,
    'dispatch_scanned', 0,
    'returns', 0,
    'priority', 0,
    'rto', 0
  );
begin
  if to_regclass('public.be_v_warehouse_scan_lifecycle') is not null then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from public.be_v_warehouse_scan_lifecycle x
    $query$
    into v_rows;

    execute $query$
      select jsonb_build_object(
        'rows', count(*),
        'received', count(*) filter (
          where warehouse_scan_status in
            ('RECEIVED', 'DISPATCH_SCANNED', 'DROP_OFF')
        ),
        'dispatch_scanned', count(*) filter (
          where dispatch_scan_at is not null
        ),
        'returns', count(*) filter (
          where coalesce(return_attempt_count, 0) > 0
        ),
        'priority', count(*) filter (
          where coalesce(next_attempt_priority, false)
        ),
        'rto', count(*) filter (
          where rto_at is not null
             or delivery_status = 'RTO'
        )
      )
      from public.be_v_warehouse_scan_lifecycle
    $query$
    into v_stats;

  elsif to_regclass('public.be_portal_pickup_requests') is not null then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from public.be_portal_pickup_requests x
    $query$
    into v_rows;

    v_stats := jsonb_build_object(
      'rows', jsonb_array_length(v_rows),
      'received', 0,
      'dispatch_scanned', 0,
      'returns', 0,
      'priority', 0,
      'rto', 0
    );
  end if;

  if to_regclass('public.be_exception_rules') is not null then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      from public.be_exception_rules r
    $query$
    into v_reasons;
  end if;

  return jsonb_build_object(
    'ok', true,
    'stats', v_stats,
    'rows', v_rows,
    'reasons', v_reasons
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'error', sqlerrm,
      'stats', v_stats,
      'rows', v_rows,
      'reasons', v_reasons
    );
end;
$$;

create or replace function public.be_enterprise_dispatch_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jobs jsonb := '[]'::jsonb;
  v_wayplans jsonb := '[]'::jsonb;
  v_assets jsonb := '[]'::jsonb;
  v_zones jsonb := '[]'::jsonb;
  v_stats jsonb;
begin
  if to_regclass('public.be_v_enterprise_dispatch_jobs') is not null then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb)
      from public.be_v_enterprise_dispatch_jobs j
    $query$
    into v_jobs;
  elsif to_regclass('public.be_portal_pickup_requests') is not null then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb)
      from public.be_portal_pickup_requests j
    $query$
    into v_jobs;
  end if;

  if to_regclass('public.be_v_enterprise_dispatch_wayplans') is not null then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
      from public.be_v_enterprise_dispatch_wayplans w
    $query$
    into v_wayplans;
  end if;

  if to_regclass('public.be_dispatch_fleet_assets') is not null then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
      from public.be_dispatch_fleet_assets a
    $query$
    into v_assets;
  elsif to_regclass('public.be_fleet_vehicles') is not null then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
      from public.be_fleet_vehicles a
    $query$
    into v_assets;
  end if;

  if to_regclass('public.be_dispatch_zones') is not null then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(z)), '[]'::jsonb)
      from public.be_dispatch_zones z
    $query$
    into v_zones;
  end if;

  v_stats := jsonb_build_object(
    'wayplans', jsonb_array_length(v_wayplans),
    'jobs', jsonb_array_length(v_jobs),
    'pending', jsonb_array_length(v_jobs),
    'out_for_delivery', 0,
    'delivered', 0,
    'failed', 0,
    'rto', 0,
    'cod', 0
  );

  return jsonb_build_object(
    'ok', true,
    'stats', v_stats,
    'wayplans', v_wayplans,
    'jobs', v_jobs,
    'assets', v_assets,
    'zones', v_zones
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'error', sqlerrm,
      'stats', jsonb_build_object(
        'wayplans', 0,
        'jobs', 0,
        'pending', 0,
        'out_for_delivery', 0,
        'delivered', 0,
        'failed', 0,
        'rto', 0,
        'cod', 0
      ),
      'wayplans', '[]'::jsonb,
      'jobs', '[]'::jsonb,
      'assets', '[]'::jsonb,
      'zones', '[]'::jsonb
    );
end;
$$;

create or replace function public.be_invoice_studio_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_stats jsonb;
begin
  if to_regclass('public.be_v_invoice_studio') is not null then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from public.be_v_invoice_studio x
    $query$
    into v_rows;

  elsif to_regclass('public.be_v_invoice_ready_waybills') is not null then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from public.be_v_invoice_ready_waybills x
    $query$
    into v_rows;

  elsif to_regclass('public.be_portal_pickup_requests') is not null then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from public.be_portal_pickup_requests x
    $query$
    into v_rows;
  end if;

  v_stats := jsonb_build_object(
    'rows', jsonb_array_length(v_rows),
    'records', jsonb_array_length(v_rows),
    'invoice_ready', jsonb_array_length(v_rows),
    'invoiced', 0,
    'cod_total', 0
  );

  return jsonb_build_object(
    'ok', true,
    'stats', v_stats,
    'rows', v_rows,
    'records', v_rows,
    'items', v_rows
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'error', sqlerrm,
      'stats', jsonb_build_object(
        'rows', 0,
        'records', 0,
        'invoice_ready', 0,
        'invoiced', 0,
        'cod_total', 0
      ),
      'rows', '[]'::jsonb,
      'records', '[]'::jsonb,
      'items', '[]'::jsonb
    );
end;
$$;

grant execute on function
  public.be_warehouse_scan_lifecycle_snapshot()
to authenticated, service_role;

grant execute on function
  public.be_enterprise_dispatch_snapshot()
to authenticated, service_role;

grant execute on function
  public.be_invoice_studio_snapshot()
to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
