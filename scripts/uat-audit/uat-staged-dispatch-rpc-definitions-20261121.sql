-- STAGED UAT RPC restoration: original production definitions, EXECUTE revoked until authorization review.
-- Do not run against production. Target has 18 users and 16 UAT branch roster rows.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $target_gate$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL THEN RAISE EXCEPTION 'Not the branch hosted UAT database'; END IF;
IF (SELECT count(*) FROM auth.users) <>18 OR (SELECT count(*) FROM public.be_user_account_registry) <>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116) <>16 THEN RAISE EXCEPTION 'Identity preservation gate failed'; END IF;
IF to_regprocedure('public.be_current_role()') IS NOT NULL THEN RAISE EXCEPTION 'Refusing to overwrite existing function public.be_current_role()'; END IF;
IF to_regprocedure('public.be_branch_scope_v1(text)') IS NOT NULL THEN RAISE EXCEPTION 'Refusing to overwrite existing function public.be_branch_scope_v1(text)'; END IF;
IF to_regprocedure('public.be_branch_department_scope_v1(text,boolean)') IS NOT NULL THEN RAISE EXCEPTION 'Refusing to overwrite existing function public.be_branch_department_scope_v1(text,boolean)'; END IF;
IF to_regprocedure('public.be_branch_warehouse_scope_v1(boolean)') IS NOT NULL THEN RAISE EXCEPTION 'Refusing to overwrite existing function public.be_branch_warehouse_scope_v1(boolean)'; END IF;
IF to_regprocedure('public.be_branch_wayplan_allowed_v1(text)') IS NOT NULL THEN RAISE EXCEPTION 'Refusing to overwrite existing function public.be_branch_wayplan_allowed_v1(text)'; END IF;
IF to_regprocedure('public.be_operational_way_id_v70(text)') IS NOT NULL THEN RAISE EXCEPTION 'Refusing to overwrite existing function public.be_operational_way_id_v70(text)'; END IF;
IF to_regprocedure('public.be_dispatch_command_snapshot_v63()') IS NOT NULL THEN RAISE EXCEPTION 'Refusing to overwrite existing function public.be_dispatch_command_snapshot_v63()'; END IF;
END $target_gate$;
CREATE FUNCTION public.be_current_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when exists(
      select 1 from public.be_superadmin_delegations_v65 d
      where d.target_auth_user_id=auth.uid() and d.active
    ) then 'superadmin'
    else coalesce(
      (select lower(replace(coalesce(nullif(role_code,''),nullif(app_role,''),nullif(user_role,''),role),'-','_'))
       from public.be_user_account_registry
       where auth_user_id=auth.uid()
         and coalesce(active,is_active,true)
         and lower(coalesce(status,'active')) in ('active','enabled')
       order by updated_at desc nulls last limit 1),
      ''
    )
  end
$function$
;
REVOKE ALL ON FUNCTION public.be_current_role() FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_branch_scope_v1(p_branch text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare r text:=replace(public.be_current_role(),'-','_'); b text; requested text:=nullif(upper(btrim(p_branch)),'');
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
 select upper(branch_code) into b from public.be_user_account_registry
 where auth_user_id=auth.uid() and coalesce(active,true) and coalesce(is_active,true)
 and lower(status) in ('active','enabled') limit 1;
 if not found or coalesce(r,'') in ('','guest') then raise exception 'ACCOUNT_INACTIVE' using errcode='42501'; end if;
 if r in ('superadmin','super_admin','app_owner','sys') then return requested; end if;
 if r in ('branch_manager','branch_office_manager','branch_office','branch_staff','branch_admin') then
  if b is null or (requested is not null and requested<>b) or not exists(
   select 1 from public.be_employee_territory_assignments a where a.user_id=auth.uid() and a.active and a.can_read
    and a.scope_type='BRANCH' and upper(a.branch_code)=b
  ) then raise exception 'BRANCH_SCOPE_DENIED' using errcode='42501'; end if;
  return b;
 end if;
 -- Existing HQ roles retain their existing operational scope, but cannot use branch controls to elevate it.
 return requested;
end $function$
;
REVOKE ALL ON FUNCTION public.be_branch_scope_v1(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_branch_department_scope_v1(p_branch text DEFAULT NULL::text, p_write boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare r text:=replace(public.be_current_role(),'-','_'); b text;
begin
 if r not in ('branch_manager','branch_office_manager','superadmin','super_admin','app_owner','sys') then raise exception 'DEPARTMENT_ACCESS_DENIED' using errcode='42501';end if;
 b:=public.be_branch_scope_v1(p_branch);
 if b is null then raise exception 'SELECT_ONE_BRANCH';end if;
 if p_write and r in ('branch_manager','branch_office_manager') and not exists(
  select 1 from public.be_employee_territory_assignments a where a.user_id=auth.uid() and a.active and a.scope_type='BRANCH' and upper(a.branch_code)=b and a.can_create and a.can_update
 ) then raise exception 'BRANCH_WRITE_DENIED' using errcode='42501';end if;
 return b;
end $function$
;
REVOKE ALL ON FUNCTION public.be_branch_department_scope_v1(text,boolean) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_branch_warehouse_scope_v1(p_write boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
 if replace(public.be_current_role(),'-','_') not in('branch_manager','branch_office_manager') then return null;end if;
 return public.be_branch_department_scope_v1(null,p_write);
end $function$
;
REVOKE ALL ON FUNCTION public.be_branch_warehouse_scope_v1(boolean) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_branch_wayplan_allowed_v1(p_wayplan text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare b text; r text:=replace(public.be_current_role(),'-','_');
begin
 if auth.uid() is null then return false; end if;
 b:=public.be_branch_scope_v1(null);
 if r not in ('branch_manager','branch_office_manager','branch_office','branch_staff','branch_admin') then return true; end if;
 return exists(select 1 from public.be_wayplan_dispatches d where d.wayplan_id=p_wayplan and upper(d.branch_code)=b);
end $function$
;
REVOKE ALL ON FUNCTION public.be_branch_wayplan_allowed_v1(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_operational_way_id_v70(p_internal_way_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (
      select nullif(d.financial_quote->>'source_waybill_no','')
      from public.be_data_entry_parcel_details d
      where d.delivery_way_id=p_internal_way_id
      order by d.updated_at desc nulls last,d.saved_at desc nulls last
      limit 1
    ),
    p_internal_way_id
  );
$function$
;
REVOKE ALL ON FUNCTION public.be_operational_way_id_v70(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_dispatch_command_snapshot_v63()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$ begin /* BRANCH_DISPATCH_SNAPSHOT_V1 */ perform public.be_branch_warehouse_scope_v1(false);return (
with active_wayplans as (
  select
    d.wayplan_id,d.wayplan_id as wayplan_code,d.wayplan_status,d.total_stops,
    d.vehicle_code,d.vehicle_name,d.driver_code,d.driver_name,
    nullif(d.rider_code,'') as rider_code,nullif(d.rider_name,'') as rider_name,
    nullif(d.helper_code,'') as helper_code,nullif(d.helper_name,'') as helper_name,
    d.created_at,d.updated_at,d.dispatched_at,
    coalesce(r.review_status,'DRAFT') as review_status,r.submitted_at,r.reviewed_at,
    r.dispatch_ready_at,r.dispatched_at as review_dispatched_at
  from public.be_wayplan_dispatches d
  left join public.be_wayplan_review_v43 r on r.wayplan_id=d.wayplan_id
  where (public.be_branch_warehouse_scope_v1(false) is null or public.be_branch_wayplan_allowed_v1(d.wayplan_id)) and upper(coalesce(d.wayplan_status,'')) not in ('CANCELLED','COMPLETED')
), plan_counts as (
  select w.*,
    coalesce(m.parcel_count,0) parcel_count,coalesce(m.planned_count,0) planned_count,
    coalesce(m.ready_count,0) ready_count,coalesce(m.dispatched_count,0) dispatched_count,
    coalesce(s.scanned_count,0) scanned_count
  from active_wayplans w
  left join lateral (
    select
      count(*) filter(where membership_status not in ('CANCELLED','COMPLETED','RTO'))::integer parcel_count,
      count(*) filter(where membership_status='PLANNED')::integer planned_count,
      count(*) filter(where membership_status='READY_FOR_DISPATCH')::integer ready_count,
      count(*) filter(where membership_status='DISPATCHED')::integer dispatched_count
    from public.be_wayplan_membership_v40 m where m.wayplan_id=w.wayplan_id
  ) m on true
  left join lateral (
    select count(distinct ds.delivery_way_id)::integer scanned_count
    from public.be_dispatch_scans_v39 ds
    where ds.wayplan_code=w.wayplan_id and ds.scan_status='SCANNED'
  ) s on true
), jobs as (
  select
    s.wayplan_id as wayplan_code,
    coalesce(nullif(s.waybill_no,''),public.be_operational_way_id_v70(s.delivery_way_id),s.delivery_way_id) as tracking_no,
    coalesce(nullif(s.waybill_no,''),public.be_operational_way_id_v70(s.delivery_way_id),s.delivery_way_id) as delivery_way_id,
    s.delivery_way_id as internal_delivery_way_id,
    coalesce(nullif(s.waybill_no,''),public.be_operational_way_id_v70(s.delivery_way_id),s.delivery_way_id) as waybill_no,
    coalesce(w.vehicle_code,m.vehicle_code,'UNASSIGNED') as asset_code,
    coalesce(w.vehicle_name,w.vehicle_code,m.vehicle_code,'UNASSIGNED') as asset_name,
    coalesce(s.recipient_name,p.recipient_name) recipient_name,
    coalesce(s.recipient_phone,p.contact_no_1,p.contact_no_2) recipient_phone,
    coalesce(s.recipient_phone,p.contact_no_1,p.contact_no_2) phone_number,
    coalesce(s.township,s.delivery_township,s.recipient_township,p.township) delivery_township,
    coalesce(s.address,s.delivery_address,p.recipient_address) recipient_address,
    coalesce(s.cod_amount,s.amount_to_collect,p.actual_collect,p.cod_amount,0) cod_amount,
    coalesce(p.delivery_charges,p.delivery_fee,0) delivery_charges,
    coalesce(s.cod_amount,s.amount_to_collect,p.actual_collect,p.cod_amount,0)+coalesce(p.delivery_charges,p.delivery_fee,0) total_collected_amount,
    coalesce(s.parcel_weight_kg,p.weight_kg,0) weight_kg,
    s.stop_sequence parcel_sequence,s.stop_sequence route_sequence,
    coalesce(s.rider_status,'PENDING') delivery_status,
    case when upper(coalesce(w.wayplan_status,''))='DISPATCHED' then 'OUT_FOR_DELIVERY'
         when w.review_status='DISPATCH_READY' then 'DISPATCH_READY'
         else w.review_status end dispatch_status,
    coalesce(s.warehouse_status,p.warehouse_status,'') warehouse_status,
    m.membership_status,coalesce(s.scan_count,0) scan_count,
    exists(select 1 from public.be_dispatch_scans_v39 ds
      where ds.wayplan_code=s.wayplan_id and ds.delivery_way_id=s.delivery_way_id and ds.scan_status='SCANNED') dispatch_scanned,
    w.review_status,w.driver_code,w.driver_name,w.rider_code,w.rider_name,w.helper_code,w.helper_name,
    p.pickup_id,p.merchant_id merchant_code,null::text merchant_name
  from public.be_wayplan_dispatch_stops s
  join plan_counts w on w.wayplan_id=s.wayplan_id
  left join public.be_wayplan_membership_v40 m on m.wayplan_id=s.wayplan_id and m.delivery_way_id=s.delivery_way_id
  left join public.be_data_entry_parcel_details p on p.delivery_way_id=s.delivery_way_id
), assets as (
  select distinct coalesce(vehicle_code,'UNASSIGNED') asset_code,
    coalesce(vehicle_name,vehicle_code,'UNASSIGNED') asset_name,
    'DELIVERY'::text operation_type,true active
  from plan_counts
), wp_json as (
  select coalesce(jsonb_agg(
    to_jsonb(p)||jsonb_build_object(
      'wayplan_no',p.wayplan_id,
      'scan_remaining',greatest(p.parcel_count-p.scanned_count,0),
      'publish_ready',p.review_status='DISPATCH_READY' and p.ready_count=p.parcel_count and p.scanned_count=p.parcel_count and p.parcel_count>0,
      'next_step',case
        when p.review_status in ('DRAFT','PENDING_REVIEW') then 'Supervisor approval required'
        when p.review_status='APPROVED' then 'Release approved Wayplan to DISPATCH_READY'
        when p.review_status='DISPATCH_READY' and p.scanned_count<p.parcel_count then format('%s parcel(s) still require mandatory Dispatch scan',p.parcel_count-p.scanned_count)
        when p.review_status='DISPATCH_READY' then 'Ready to publish'
        when p.review_status='DISPATCHED' then 'Published to field operation'
        else 'Review Wayplan status' end
    )
    order by case p.review_status when 'DISPATCH_READY' then 1 when 'APPROVED' then 2 when 'PENDING_REVIEW' then 3 when 'DRAFT' then 4 when 'DISPATCHED' then 5 else 6 end,p.updated_at desc
  ),'[]'::jsonb) value from plan_counts p
), job_json as (
  select coalesce(jsonb_agg(to_jsonb(j) order by j.wayplan_code,j.parcel_sequence,j.tracking_no),'[]'::jsonb) value from jobs j
), asset_json as (
  select coalesce(jsonb_agg(to_jsonb(a) order by a.asset_code),'[]'::jsonb) value from assets a
), stats as (
  select jsonb_build_object(
    'wayplans',(select count(*) from plan_counts),'jobs',(select count(*) from jobs),
    'pending',(select count(*) from jobs where review_status in ('DRAFT','PENDING_REVIEW','APPROVED','DISPATCH_READY')),
    'out_for_delivery',(select count(*) from jobs where upper(coalesce(dispatch_status,''))='OUT_FOR_DELIVERY'),
    'delivered',(select count(*) from jobs where upper(coalesce(delivery_status,'')) in ('DELIVERED','COMPLETED','DROP_OFF')),
    'failed',(select count(*) from jobs where upper(coalesce(delivery_status,'')) in ('ATTEMPTED_FAILED','DELIVERY_FAILED','FAILED')),
    'rto',(select count(*) from jobs where upper(coalesce(delivery_status,''))='RTO'),
    'cod',coalesce((select sum(cod_amount) from jobs),0)
  ) value
)
select jsonb_build_object(
  'ok',true,'build','DISPATCH_COMMAND_V70_ORIGINAL_WAY_ID',
  'stats',(select value from stats),'wayplans',(select value from wp_json),
  'jobs',(select value from job_json),'assets',(select value from asset_json),
  'zones','[]'::jsonb,'source','CANONICAL_WAYPLAN_V40_V43',
  'operational_way_id','ORIGINAL_SOURCE_WAYBILL'
));end $function$
;
REVOKE ALL ON FUNCTION public.be_dispatch_command_snapshot_v63() FROM PUBLIC, anon, authenticated;
COMMIT;
