-- BRITIUM_WAREHOUSE_EMERGENCY_CONTROLS_V2_20260827
-- Exact-scope, audited, Superadmin-only emergency scan bypass controls.

begin;

create schema if not exists private;

create or replace function private.be_emergency_is_superadmin_v2()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select (select auth.uid()) is not null
     and exists (
       select 1
       from public.be_user_account_registry r
       where r.auth_user_id = (select auth.uid())
         and regexp_replace(lower(coalesce(r.role, r.role_code, r.app_role, r.user_role, '')), '[^a-z0-9]+', '', 'g') = 'superadmin'
         and coalesce(r.is_active, r.active, true)
         and lower(coalesce(r.status, 'active')) = 'active'
     );
$function$;

create or replace function private.be_warehouse_emergency_dispatch_is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select private.be_emergency_is_superadmin_v2();
$function$;

create table if not exists private.be_warehouse_emergency_inbound_audit (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_uid uuid not null,
  actor_email text not null,
  pickup_id text not null,
  warehouse_code text not null,
  emergency_reason text not null,
  confirmation_text text not null,
  eligible_count integer not null,
  processed_count integer not null,
  exceptions_left_on_hold integer not null default 0,
  result jsonb not null default '{}'::jsonb
);

create index if not exists be_warehouse_emergency_inbound_audit_pickup_at_idx
  on private.be_warehouse_emergency_inbound_audit (pickup_id, occurred_at desc);

create or replace function public.be_superadmin_emergency_capabilities()
returns jsonb
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select jsonb_build_object(
    'ok', true,
    'is_superadmin', private.be_emergency_is_superadmin_v2(),
    'can_skip_inbound', private.be_emergency_is_superadmin_v2(),
    'can_skip_dispatch', private.be_emergency_is_superadmin_v2(),
    'can_manage_wayplans', private.be_emergency_is_superadmin_v2()
  );
$function$;

create or replace function public.be_warehouse_emergency_inbound_preview(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_pickup text := nullif(btrim(coalesce(p_payload->>'pickup_id', '')), '');
  v_total integer := 0;
  v_ready integer := 0;
  v_exception integer := 0;
  v_eligible integer := 0;
begin
  if not private.be_emergency_is_superadmin_v2() then
    raise exception using errcode='42501', message='Superadmin authority is required';
  end if;
  if v_pickup is null then raise exception 'Exact Pickup ID is required'; end if;

  select count(*)::integer into v_total
  from public.be_data_entry_parcel_details d where d.pickup_id=v_pickup;
  if v_total=0 then raise exception 'Pickup ID % was not found', v_pickup; end if;

  select
    count(*) filter (where r.warehouse_status='WAREHOUSE_READY')::integer,
    count(*) filter (where r.warehouse_status='WAREHOUSE_EXCEPTION')::integer
  into v_ready, v_exception
  from public.be_warehouse_receipts_v36 r where r.pickup_id=v_pickup;

  v_eligible := greatest(v_total - v_ready - v_exception, 0);
  return jsonb_build_object(
    'ok',true,'pickup_id',v_pickup,'total_parcels',v_total,
    'eligible_count',v_eligible,'already_ready_count',v_ready,
    'exceptions_on_hold',v_exception,
    'required_confirmation','EMERGENCY INBOUND '||v_pickup
  );
end;
$function$;

create or replace function public.be_warehouse_emergency_inbound_override(
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_pickup text := nullif(btrim(coalesce(p_payload->>'pickup_id','')), '');
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason','')), '');
  v_confirm text := btrim(coalesce(p_payload->>'confirmation',''));
  v_warehouse text := coalesce(nullif(btrim(coalesce(p_payload->>'warehouse_code','')), ''), 'YGN-MAIN');
  v_uid uuid := (select auth.uid());
  v_email text;
  v_preview jsonb;
  v_result jsonb;
  v_audit uuid;
begin
  if not private.be_emergency_is_superadmin_v2() then
    raise exception using errcode='42501', message='Superadmin authority is required';
  end if;
  if v_pickup is null then raise exception 'Exact Pickup ID is required'; end if;
  if v_reason is null or char_length(v_reason)<20 then raise exception 'Emergency reason must contain at least 20 characters'; end if;
  if v_confirm <> 'EMERGENCY INBOUND '||v_pickup then raise exception 'Confirmation text does not match the Pickup ID'; end if;

  select lower(coalesce(r.email,r.account_email,r.user_email,r.login_email,'')) into v_email
  from public.be_user_account_registry r where r.auth_user_id=v_uid
  order by r.updated_at desc nulls last limit 1;
  if coalesce(v_email,'')='' then raise exception 'Active Superadmin registry email was not found'; end if;

  v_preview := public.be_warehouse_emergency_inbound_preview(jsonb_build_object('pickup_id',v_pickup));
  if coalesce((v_preview->>'eligible_count')::integer,0)=0 then raise exception 'No eligible parcels require inbound bypass'; end if;

  v_result := public.be_warehouse_skip_receiving_scan_v39(v_pickup,v_reason,v_warehouse,'READY_FOR_DISPATCH',v_email);

  insert into private.be_warehouse_emergency_inbound_audit(
    actor_uid,actor_email,pickup_id,warehouse_code,emergency_reason,
    confirmation_text,eligible_count,processed_count,exceptions_left_on_hold,result
  ) values (
    v_uid,v_email,v_pickup,v_warehouse,v_reason,v_confirm,
    (v_preview->>'eligible_count')::integer,
    coalesce((v_result->>'ready_count')::integer,0),
    coalesce((v_result->>'exceptions_left_on_hold')::integer,0),v_result
  ) returning id into v_audit;

  return v_result || jsonb_build_object('ok',true,'audit_id',v_audit,'emergency_override',true);
end;
$function$;

revoke all on function private.be_emergency_is_superadmin_v2() from public, anon, authenticated;
revoke all on function private.be_warehouse_emergency_dispatch_is_superadmin() from public, anon, authenticated;
revoke all on table private.be_warehouse_emergency_inbound_audit from public, anon, authenticated;

revoke all on function public.be_superadmin_emergency_capabilities() from public, anon;
revoke all on function public.be_warehouse_emergency_inbound_preview(jsonb) from public, anon;
revoke all on function public.be_warehouse_emergency_inbound_override(jsonb) from public, anon;
grant execute on function public.be_superadmin_emergency_capabilities() to authenticated;
grant execute on function public.be_warehouse_emergency_inbound_preview(jsonb) to authenticated;
grant execute on function public.be_warehouse_emergency_inbound_override(jsonb) to authenticated;

comment on function public.be_warehouse_emergency_inbound_override(jsonb) is
  'Superadmin-only exact-pickup emergency inbound scan bypass with mandatory reason, confirmation and private audit.';

commit;
;
