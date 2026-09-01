-- BRITIUM_WAREHOUSE_EMERGENCY_DISPATCH_V1_20260826
-- Superadmin-only, audited emergency bulk dispatch scan override.

begin;
create schema if not exists private;
create table if not exists private.be_warehouse_emergency_dispatch_audit (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_uid uuid not null,
  actor_email text not null,
  actor_role text not null,
  wayplan_id text not null,
  warehouse_code text not null,
  emergency_reason text not null,
  confirmation_text text not null,
  eligible_count integer not null default 0,
  processed_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  processed_tracking_numbers jsonb not null default '[]'::jsonb,
  skipped_tracking_numbers jsonb not null default '[]'::jsonb,
  failures jsonb not null default '[]'::jsonb,
  request_payload jsonb not null default '{}'::jsonb
);
create index if not exists be_warehouse_emergency_dispatch_audit_wayplan_at_idx
  on private.be_warehouse_emergency_dispatch_audit (wayplan_id, occurred_at desc);
create or replace function private.be_warehouse_emergency_dispatch_is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, private, auth
as $function$
  select (select auth.uid()) is not null
     and lower(btrim(coalesce(public.be_current_role(), ''))) in (
       'superadmin', 'super_admin', 'super-admin', 'super admin'
     );
$function$;
create or replace function private.be_warehouse_emergency_dispatch_preview_impl(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $function$
declare
  v_wayplan text := nullif(btrim(coalesce(p_payload->>'wayplan_id', '')), '');
  v_total integer := 0;
  v_eligible integer := 0;
  v_already_scanned integer := 0;
  v_not_received integer := 0;
  v_excluded integer := 0;
  v_tracking jsonb := '[]'::jsonb;
begin
  if not private.be_warehouse_emergency_dispatch_is_superadmin() then
    raise exception using errcode = '42501', message = 'Superadmin authority is required for emergency dispatch override';
  end if;
  if v_wayplan is null then
    raise exception 'Wayplan ID is required';
  end if;

  with candidates as (
    select distinct
      coalesce(nullif(i.delivery_way_id, ''), nullif(i.tracking_no, '')) as tracking_no,
      i.inbound_scan_at,
      i.dispatch_scan_at,
      upper(coalesce(i.warehouse_scan_status, '')) as warehouse_status,
      i.rto_at,
      i.dropoff_at,
      greatest(
        coalesce(i.return_scan_1_at, '-infinity'::timestamptz),
        coalesce(i.return_scan_2_at, '-infinity'::timestamptz),
        coalesce(i.return_scan_3_at, '-infinity'::timestamptz)
      ) as latest_return_at
    from public.be_wayplan_items i
    where coalesce(nullif(i.wayplan_code, ''), nullif(i.wayplan_no, ''), nullif(i.wayplan_id, '')) = v_wayplan
  ), classified as (
    select *,
      dispatch_scan_at is null
      and inbound_scan_at is not null
      and rto_at is null
      and dropoff_at is null
      and latest_return_at = '-infinity'::timestamptz
      and warehouse_status not in ('RTO', 'DROP_OFF', 'DISPATCH_SCANNED', 'OUT_FOR_DELIVERY')
      and tracking_no is not null as eligible
    from candidates
  )
  select
    count(*)::integer,
    count(*) filter (where eligible)::integer,
    count(*) filter (where dispatch_scan_at is not null or warehouse_status in ('DISPATCH_SCANNED','OUT_FOR_DELIVERY'))::integer,
    count(*) filter (where inbound_scan_at is null)::integer,
    count(*) filter (where rto_at is not null or dropoff_at is not null or latest_return_at <> '-infinity'::timestamptz)::integer,
    coalesce(jsonb_agg(tracking_no order by tracking_no) filter (where eligible), '[]'::jsonb)
  into v_total, v_eligible, v_already_scanned, v_not_received, v_excluded, v_tracking
  from classified;

  if v_total = 0 then
    raise exception 'No Warehouse parcel rows were found for wayplan %', v_wayplan;
  end if;

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'total_rows', v_total,
    'eligible_count', v_eligible,
    'already_scanned_count', v_already_scanned,
    'not_received_count', v_not_received,
    'excluded_count', v_excluded,
    'eligible_tracking_numbers', v_tracking,
    'required_confirmation', 'EMERGENCY DISPATCH ' || v_wayplan
  );
end;
$function$;
create or replace function private.be_warehouse_emergency_dispatch_apply_impl(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth
as $function$
declare
  v_wayplan text := nullif(btrim(coalesce(p_payload->>'wayplan_id', '')), '');
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason', '')), '');
  v_confirmation text := btrim(coalesce(p_payload->>'confirmation', ''));
  v_warehouse text := coalesce(nullif(btrim(coalesce(p_payload->>'warehouse_code', '')), ''), 'YGN-MAIN');
  v_actor_uid uuid := (select auth.uid());
  v_actor_email text := lower(coalesce((select auth.jwt()->>'email'), ''));
  v_actor_role text := coalesce(public.be_current_role(), 'unknown');
  v_preview jsonb;
  v_row record;
  v_result jsonb;
  v_processed jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_failures jsonb := '[]'::jsonb;
  v_processed_count integer := 0;
  v_skipped_count integer := 0;
  v_failed_count integer := 0;
  v_audit_id uuid;
begin
  if not private.be_warehouse_emergency_dispatch_is_superadmin() then
    raise exception using errcode = '42501', message = 'Superadmin authority is required for emergency dispatch override';
  end if;
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;
  if v_reason is null or char_length(v_reason) < 20 then
    raise exception 'Emergency reason must contain at least 20 characters';
  end if;
  if v_confirmation <> 'EMERGENCY DISPATCH ' || v_wayplan then
    raise exception 'Confirmation text does not match the selected wayplan';
  end if;

  v_preview := private.be_warehouse_emergency_dispatch_preview_impl(jsonb_build_object('wayplan_id', v_wayplan));
  if coalesce((v_preview->>'eligible_count')::integer, 0) = 0 then
    raise exception 'No eligible received and unscanned parcels were found for wayplan %', v_wayplan;
  end if;

  perform 1
  from public.be_wayplan_items i
  where coalesce(nullif(i.wayplan_code, ''), nullif(i.wayplan_no, ''), nullif(i.wayplan_id, '')) = v_wayplan
    and i.dispatch_scan_at is null
    and i.inbound_scan_at is not null
  for update;

  for v_row in
    select distinct coalesce(nullif(i.delivery_way_id, ''), nullif(i.tracking_no, '')) as tracking_no
    from public.be_wayplan_items i
    where coalesce(nullif(i.wayplan_code, ''), nullif(i.wayplan_no, ''), nullif(i.wayplan_id, '')) = v_wayplan
      and i.dispatch_scan_at is null
      and i.inbound_scan_at is not null
      and i.rto_at is null
      and i.dropoff_at is null
      and i.return_scan_1_at is null
      and i.return_scan_2_at is null
      and i.return_scan_3_at is null
      and upper(coalesce(i.warehouse_scan_status, '')) not in ('RTO','DROP_OFF','DISPATCH_SCANNED','OUT_FOR_DELIVERY')
      and coalesce(nullif(i.delivery_way_id, ''), nullif(i.tracking_no, '')) is not null
    order by 1
  loop
    begin
      v_result := public.be_dispatch_scan_parcel_v39(v_row.tracking_no, v_wayplan, v_actor_email);
      if coalesce(v_result->>'ok', 'true') = 'false' then
        v_skipped_count := v_skipped_count + 1;
        v_skipped := v_skipped || jsonb_build_array(v_row.tracking_no);
      else
        update public.be_wayplan_items
        set dispatch_scan_at = now(),
            dispatch_scan_by = v_actor_email,
            dispatch_scan_code = v_warehouse || ':EMERGENCY_SUPERADMIN',
            warehouse_scan_status = 'DISPATCH_SCANNED',
            updated_at = now()
        where tracking_no = v_row.tracking_no or delivery_way_id = v_row.tracking_no;

        update public.be_dispatch_job_assignments
        set dispatch_scan_at = coalesce(dispatch_scan_at, now()),
            updated_by_email = v_actor_email,
            updated_at = now()
        where tracking_no = v_row.tracking_no;

        update public.be_wayplan_membership_v40
        set membership_status = 'DISPATCHED', updated_at = now()
        where wayplan_id = v_wayplan and delivery_way_id = v_row.tracking_no;

        v_processed_count := v_processed_count + 1;
        v_processed := v_processed || jsonb_build_array(v_row.tracking_no);
      end if;
    exception when others then
      v_failed_count := v_failed_count + 1;
      v_failures := v_failures || jsonb_build_array(jsonb_build_object(
        'tracking_no', v_row.tracking_no,
        'sqlstate', sqlstate,
        'message', sqlerrm
      ));
    end;
  end loop;

  if v_processed_count = 0 then
    raise exception 'Emergency override processed no parcels; inspect the canonical dispatch validation results';
  end if;

  insert into private.be_warehouse_emergency_dispatch_audit (
    actor_uid, actor_email, actor_role, wayplan_id, warehouse_code,
    emergency_reason, confirmation_text, eligible_count, processed_count,
    skipped_count, failed_count, processed_tracking_numbers,
    skipped_tracking_numbers, failures, request_payload
  ) values (
    v_actor_uid, v_actor_email, v_actor_role, v_wayplan, v_warehouse,
    v_reason, v_confirmation, (v_preview->>'eligible_count')::integer,
    v_processed_count, v_skipped_count, v_failed_count, v_processed,
    v_skipped, v_failures, p_payload - 'confirmation'
  ) returning id into v_audit_id;

  return jsonb_build_object(
    'ok', true,
    'audit_id', v_audit_id,
    'wayplan_id', v_wayplan,
    'processed_count', v_processed_count,
    'skipped_count', v_skipped_count,
    'failed_count', v_failed_count,
    'processed_tracking_numbers', v_processed,
    'failures', v_failures
  );
end;
$function$;
create or replace function public.be_warehouse_emergency_dispatch_preview(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, private
as $function$
  select private.be_warehouse_emergency_dispatch_preview_impl(p_payload);
$function$;
create or replace function public.be_warehouse_emergency_dispatch_override(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, private
as $function$
  select private.be_warehouse_emergency_dispatch_apply_impl(p_payload);
$function$;
revoke all on function private.be_warehouse_emergency_dispatch_is_superadmin() from public, anon;
revoke all on function private.be_warehouse_emergency_dispatch_preview_impl(jsonb) from public, anon;
revoke all on function private.be_warehouse_emergency_dispatch_apply_impl(jsonb) from public, anon;
grant execute on function private.be_warehouse_emergency_dispatch_preview_impl(jsonb) to authenticated;
grant execute on function private.be_warehouse_emergency_dispatch_apply_impl(jsonb) to authenticated;
revoke all on function public.be_warehouse_emergency_dispatch_preview(jsonb) from public, anon;
revoke all on function public.be_warehouse_emergency_dispatch_override(jsonb) from public, anon;
grant execute on function public.be_warehouse_emergency_dispatch_preview(jsonb) to authenticated;
grant execute on function public.be_warehouse_emergency_dispatch_override(jsonb) to authenticated;
revoke all on table private.be_warehouse_emergency_dispatch_audit from public, anon, authenticated;
comment on function public.be_warehouse_emergency_dispatch_override(jsonb) is
  'Superadmin-only audited emergency dispatch scan override. Normal users must scan every parcel.';
commit;
