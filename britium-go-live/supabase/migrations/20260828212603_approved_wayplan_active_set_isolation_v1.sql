begin;
create table if not exists private.be_approved_wayplan_isolation_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_email text,
  active_count integer not null,
  isolated_ledger_count integer not null default 0,
  cancelled_stop_count integer not null default 0,
  cancelled_membership_count integer not null default 0,
  committed boolean not null,
  created_at timestamptz not null default now()
);
revoke all on private.be_approved_wayplan_isolation_audit_v1 from public, anon, authenticated;
create or replace function public.be_approved_wayplan_active_set_isolate_v1(
  p_active_ids jsonb default '[]'::jsonb,
  p_commit boolean default false,
  p_confirmation text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_email text := coalesce(auth.jwt()->>'email', 'unknown');
  v_active_count integer := 0;
  v_ledger_count integer := 0;
  v_stop_count integer := 0;
  v_membership_count integer := 0;
begin
  if v_actor is null or not private.be_emergency_is_superadmin_v2() then
    raise exception 'Superadmin authorization is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_active_ids) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'Active IDs must be a JSON array.');
  end if;
  if p_commit and p_confirmation is distinct from 'ISOLATE ABSENT ACTIVE ROWS' then
    return jsonb_build_object('ok', false, 'error', 'Exact isolation confirmation is required.');
  end if;

  create temporary table pg_temp.be_current_active_ids (delivery_way_id text primary key) on commit drop;
  insert into pg_temp.be_current_active_ids(delivery_way_id)
  select distinct nullif(btrim(value), '')
  from jsonb_array_elements_text(p_active_ids)
  where nullif(btrim(value), '') is not null;
  select count(*)::integer into v_active_count from pg_temp.be_current_active_ids;
  if v_active_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'Refusing to isolate against an empty active set.');
  end if;

  select count(*)::integer into v_ledger_count
  from public.be_waybill_ledger w
  where not exists (select 1 from pg_temp.be_current_active_ids a where a.delivery_way_id in (w.delivery_way_id, w.waybill_no))
    and (coalesce(w.metadata, '{}'::jsonb) ? 'approved_workbook_code' or coalesce(w.metadata->>'source', '') like 'APPROVED_WAYPLAN_WORKBOOK%')
    and upper(coalesce(w.status, '') || ' ' || coalesce(w.dispatch_status, '') || ' ' || coalesce(w.wayplan_status, ''))
        !~ '(RTO|DELIVERED|DROP.?OFF|CLOSED|CANCELLED|SETTLED)';

  if p_commit then
    update public.be_wayplan_membership_v40 m
    set membership_status = 'CANCELLED', updated_at = now(),
        metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object('isolation_reason','ABSENT_FROM_CURRENT_OUTBOUND_WORKBOOK','isolated_at',now(),'isolated_by',v_email)
    where not exists (select 1 from pg_temp.be_current_active_ids a where a.delivery_way_id = m.delivery_way_id)
      and upper(coalesce(m.membership_status, '')) not in ('COMPLETED','RTO','CANCELLED');
    get diagnostics v_membership_count = row_count;

    update public.be_wayplan_dispatch_stops s
    set stop_status = 'CANCELLED', updated_at = now()
    where not exists (select 1 from pg_temp.be_current_active_ids a where a.delivery_way_id = s.delivery_way_id)
      and upper(coalesce(s.stop_status, '')) not in ('COMPLETED','RTO','CANCELLED');
    get diagnostics v_stop_count = row_count;

    update public.be_waybill_ledger w
    set status = 'INVENTORY_HOLD', dispatch_status = 'REMOVED_FROM_CURRENT_OUTBOUND',
        wayplan_status = 'NOT_IN_CURRENT_OUTBOUND', warehouse_status = 'PENDING_REVIEW', updated_at = now(),
        metadata = coalesce(w.metadata, '{}'::jsonb) || jsonb_build_object('active_set_isolation_v1',true,'isolated_at',now(),'isolated_by',v_email)
    where not exists (select 1 from pg_temp.be_current_active_ids a where a.delivery_way_id in (w.delivery_way_id, w.waybill_no))
      and (coalesce(w.metadata, '{}'::jsonb) ? 'approved_workbook_code' or coalesce(w.metadata->>'source', '') like 'APPROVED_WAYPLAN_WORKBOOK%')
      and upper(coalesce(w.status, '') || ' ' || coalesce(w.dispatch_status, '') || ' ' || coalesce(w.wayplan_status, ''))
          !~ '(RTO|DELIVERED|DROP.?OFF|CLOSED|CANCELLED|SETTLED)';
    get diagnostics v_ledger_count = row_count;
  end if;

  insert into private.be_approved_wayplan_isolation_audit_v1(actor_id, actor_email, active_count, isolated_ledger_count, cancelled_stop_count, cancelled_membership_count, committed)
  values(v_actor, v_email, v_active_count, v_ledger_count, v_stop_count, v_membership_count, p_commit);

  return jsonb_build_object('ok',true,'mode',case when p_commit then 'COMMIT' else 'PREVIEW' end,'active_count',v_active_count,'isolated_ledger_count',v_ledger_count,'cancelled_stop_count',v_stop_count,'cancelled_membership_count',v_membership_count);
end;
$function$;
revoke all on function public.be_approved_wayplan_active_set_isolate_v1(jsonb,boolean,text) from public, anon;
grant execute on function public.be_approved_wayplan_active_set_isolate_v1(jsonb,boolean,text) to authenticated;
commit;
