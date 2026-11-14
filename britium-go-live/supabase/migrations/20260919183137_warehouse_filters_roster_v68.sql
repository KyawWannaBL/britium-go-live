-- V68: warehouse lifecycle clarity, exact operational roster source,
-- and Supervisor crew assignment controls.

create table if not exists public.be_wayplan_roster_allowlist_v68 (
  role_code text not null,
  workforce_code text not null,
  display_name text not null,
  phone text,
  branch_code text not null default 'YGN',
  employment_type text,
  active boolean not null default true,
  source_file text,
  updated_at timestamptz not null default now(),
  primary key(role_code,workforce_code)
);

-- Exact roster requested from the attached September operational spreadsheets.
delete from public.be_wayplan_roster_allowlist_v68 where branch_code='YGN';

insert into public.be_wayplan_roster_allowlist_v68
(role_code,workforce_code,display_name,phone,branch_code,employment_type,active,source_file)
values
('DRIVER','DRV001','zaw min htike','09-778740993','YGN',null,true,'be_master_drivers_rows (11)_1.csv'),
('DRIVER','DRV003','myo thu','09-450227237','YGN',null,true,'be_master_drivers_rows (11)_1.csv'),
('DRIVER','DRV004','wai phyo lwin','09-260 741 691','YGN',null,true,'be_master_drivers_rows (11)_1.csv'),
('DRIVER','DRV005','win naing tun','09-679 874 786','YGN',null,true,'be_master_drivers_rows (11)_1.csv'),
('DRIVER','DRV006','kyaw zaw hein','09-757 052 761','YGN',null,true,'be_master_drivers_rows (11)_1.csv'),
('DRIVER','DRV007','kyaw swar hein','09-974140666','YGN',null,true,'be_master_drivers_rows (11)_1.csv'),
('DRIVER','DRV008','wai yan ko ko','09-420968559','YGN',null,true,'be_master_drivers_rows (11)_1.csv'),
('DRIVER','DRV009','myo aung','09-680520599','YGN',null,true,'be_master_drivers_rows (11)_1.csv'),
('DRIVER','DRV010','kyaw zin latt','09-791385454','YGN',null,true,'be_master_drivers_rows (11)_1.csv'),
('RIDER','RID005','Aye Chan Soe','09-259 725 323','YGN','Permanent',true,'be_master_riders_rows1_1.csv'),
('RIDER','RID008','Bo Bo Kyaw','09-699647795','YGN','Contract',true,'be_master_riders_rows1_1.csv'),
('RIDER','RID009','Nawng Lat Mahkaw','09-400040529','YGN','Contract',true,'be_master_riders_rows1_1.csv'),
('HELPER','HLP001','Moe Satt Zin Tun','09-975 135 311','YGN','Permanent',true,'be_master_helpers_rows1_1.csv'),
('HELPER','HLP002','Paing Zay Htut','09-750 629 255','YGN','Permanent',true,'be_master_helpers_rows1_1.csv'),
('HELPER','HLP004','Aung Chan Myae','09-979 796 688','YGN','Contract',true,'be_master_helpers_rows1_1.csv'),
('HELPER','HLP007','Myo Pa Pa Aung','09-779617044','YGN','Contract',true,'be_master_helpers_rows1_1.csv'),
('HELPER','HLP015','Thet Phoo Ko Ko','09-687112764','YGN','Contract',true,'be_master_helpers_rows1_1.csv'),
('HELPER','HLP016','Yan Naing Cho','09-786622258','YGN',null,true,'be_master_helpers_rows1_1.csv');

-- Synchronize master names/phones without deleting historical staff rows.
update public.be_master_drivers d
set driver_name=a.display_name,name=a.display_name,
    phone_primary=a.phone,phone=a.phone,branch_code=a.branch_code,
    status='active',updated_at=now()
from public.be_wayplan_roster_allowlist_v68 a
where a.role_code='DRIVER' and a.workforce_code=d.driver_code;

update public.be_master_riders r
set rider_name=a.display_name,name=a.display_name,
    phone_primary=a.phone,phone=a.phone,branch_code=a.branch_code,
    employment_type=coalesce(a.employment_type,r.employment_type),
    status='active',updated_at=now()
from public.be_wayplan_roster_allowlist_v68 a
where a.role_code='RIDER' and a.workforce_code=r.rider_code;

insert into public.be_master_helpers(
  helper_id,helper_code,helper_name,name,phone_primary,phone,assigned_zone,
  branch_code,employment_type,status,created_at,updated_at
)
select a.workforce_code,a.workforce_code,a.display_name,a.display_name,a.phone,a.phone,null,
       a.branch_code,a.employment_type,'active',now(),now()
from public.be_wayplan_roster_allowlist_v68 a
where a.role_code='HELPER'
on conflict(helper_id) do update set
  helper_code=excluded.helper_code,helper_name=excluded.helper_name,name=excluded.name,
  phone_primary=excluded.phone_primary,phone=excluded.phone,branch_code=excluded.branch_code,
  employment_type=coalesce(excluded.employment_type,public.be_master_helpers.employment_type),
  status='active',updated_at=now();

-- Roster options now follow the attached operational allowlist exactly.
create or replace function public.be_wayplan_assignment_options_v44()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_base jsonb;
  v_drivers jsonb:='[]'::jsonb;
  v_riders jsonb:='[]'::jsonb;
  v_helpers jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  v_base:=public.be_wayplan_assignment_options_v44_legacy_20260826();

  select coalesce(jsonb_agg(jsonb_build_object(
    'record_key',a.workforce_code,'id',a.workforce_code,'name',a.display_name,
    'phone',coalesce(a.phone,''),'zone','','branch_code',a.branch_code,'status','active',
    'master_role','DRIVER','label','🚚 '||a.display_name,
    'mobile_auth_ready',exists(
      select 1 from public.be_mobile_workforce_accounts m
      where upper(coalesce(nullif(m.worker_code,''),nullif(m.workforce_code,''),nullif(m.account_code,''),nullif(m.driver_code,'')))=upper(a.workforce_code)
        and upper(coalesce(m.role,''))='DRIVER' and m.auth_user_id is not null
        and coalesce(m.active,true) and coalesce(m.is_active,true)
    )
  ) order by a.display_name),'[]'::jsonb)
  into v_drivers
  from public.be_wayplan_roster_allowlist_v68 a
  where a.role_code='DRIVER' and a.active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'record_key',a.workforce_code,'id',a.workforce_code,'name',a.display_name,
    'phone',coalesce(a.phone,''),'zone','','branch_code',a.branch_code,'status','active',
    'master_role','RIDER','label','🚴 '||a.display_name,
    'mobile_auth_ready',exists(
      select 1 from public.be_mobile_workforce_accounts m
      where upper(coalesce(nullif(m.worker_code,''),nullif(m.workforce_code,''),nullif(m.account_code,''),nullif(m.rider_code,'')))=upper(a.workforce_code)
        and upper(coalesce(m.role,''))='RIDER' and m.auth_user_id is not null
        and coalesce(m.active,true) and coalesce(m.is_active,true)
    )
  ) order by a.display_name),'[]'::jsonb)
  into v_riders
  from public.be_wayplan_roster_allowlist_v68 a
  where a.role_code='RIDER' and a.active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'record_key',a.workforce_code,'id',a.workforce_code,'name',a.display_name,
    'phone',coalesce(a.phone,''),'zone','','branch_code',a.branch_code,'status','active',
    'master_role','HELPER','label','📦 '||a.display_name,
    'acting_as_helper',false,'manageable_as_helper',true,
    'mobile_auth_ready',exists(
      select 1 from public.be_mobile_workforce_accounts m
      where upper(coalesce(nullif(m.worker_code,''),nullif(m.workforce_code,''),nullif(m.account_code,''),nullif(m.helper_code,'')))=upper(a.workforce_code)
        and upper(coalesce(m.role,''))='HELPER' and m.auth_user_id is not null
        and coalesce(m.active,true) and coalesce(m.is_active,true)
    )
  ) order by a.display_name),'[]'::jsonb)
  into v_helpers
  from public.be_wayplan_roster_allowlist_v68 a
  where a.role_code='HELPER' and a.active;

  return coalesce(v_base,'{}'::jsonb)||jsonb_build_object(
    'ok',true,'build','WAYPLAN_ASSIGNMENT_ROSTER_V68',
    'drivers',v_drivers,'riders',v_riders,'helpers',v_helpers,'helper_master',v_helpers,
    'helper_optional',true,'roster_source','ATTACHED_OPERATIONAL_SPREADSHEETS',
    'counts',jsonb_build_object(
      'active_drivers',jsonb_array_length(v_drivers),
      'active_riders',jsonb_array_length(v_riders),
      'active_helpers',jsonb_array_length(v_helpers)
    )
  );
end;
$function$;

-- Supervisor can revise crew before dispatch release.
create or replace function public.be_wayplan_supervisor_assign_crew_v68(
  p_wayplan_id text,
  p_driver_code text,
  p_rider_code text default null,
  p_helper_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_role text:=lower(public.be_current_user_role());
  v_review text;
  v_options jsonb;
  v_driver jsonb;
  v_rider jsonb;
  v_helper jsonb;
  v_actor text:=coalesce(auth.jwt()->>'email',auth.uid()::text);
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_role not in ('superadmin','super_admin','admin','supervisor','operations','operations_admin','management','director') then
    raise exception 'Supervisor authority is required.';
  end if;

  select review_status into v_review from public.be_wayplan_review_v43 where wayplan_id=p_wayplan_id;
  if v_review is null then raise exception 'Wayplan review record not found.'; end if;
  if upper(v_review) in ('DISPATCH_READY','DISPATCHED') then
    raise exception 'Crew editing is locked after the Wayplan is released to Dispatch.';
  end if;

  v_options:=public.be_wayplan_assignment_options_v44();
  select x into v_driver from jsonb_array_elements(v_options->'drivers') x where x->>'id'=p_driver_code;
  if v_driver is null then raise exception 'Choose an active Driver from the approved roster.'; end if;

  if nullif(p_rider_code,'') is not null then
    select x into v_rider from jsonb_array_elements(v_options->'riders') x where x->>'id'=p_rider_code;
    if v_rider is null then raise exception 'Choose an active Rider or leave Rider empty.'; end if;
  end if;

  if nullif(p_helper_code,'') is not null then
    select x into v_helper from jsonb_array_elements(v_options->'helpers') x where x->>'id'=p_helper_code;
    if v_helper is null then raise exception 'Choose an active Helper or leave Helper empty.'; end if;
  end if;

  if p_driver_code=coalesce(p_rider_code,'') or p_driver_code=coalesce(p_helper_code,'')
     or (nullif(p_rider_code,'') is not null and p_rider_code=coalesce(p_helper_code,'')) then
    raise exception 'Driver, Rider and Helper must be different people/codes.';
  end if;

  update public.be_wayplan_dispatches
  set driver_code=p_driver_code,driver_name=v_driver->>'name',
      rider_code=nullif(p_rider_code,''),rider_name=coalesce(v_rider->>'name',''),
      helper_code=nullif(p_helper_code,''),helper_name=coalesce(v_helper->>'name',''),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'supervisor_crew_updated_at',now(),'supervisor_crew_updated_by',v_actor
      ),
      updated_at=now()
  where wayplan_id=p_wayplan_id;

  update public.be_wayplan_dispatch_stops
  set rider_code=nullif(p_rider_code,''),rider_name=coalesce(v_rider->>'name',''),updated_at=now()
  where wayplan_id=p_wayplan_id;

  insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details)
  values(auth.uid(),v_actor,public.be_current_user_role(),'SUPERVISOR_CREW_UPDATED_V68','WAYPLAN',p_wayplan_id,
    jsonb_build_object('driver_code',p_driver_code,'rider_code',nullif(p_rider_code,''),'helper_code',nullif(p_helper_code,'')));

  return jsonb_build_object(
    'ok',true,'wayplan_id',p_wayplan_id,
    'driver',v_driver,'rider',v_rider,'helper',v_helper,
    'review_status',v_review,'build','SUPERVISOR_CREW_ASSIGNMENT_V68'
  );
end;
$function$;

grant execute on function public.be_wayplan_supervisor_assign_crew_v68(text,text,text,text) to authenticated;

-- Warehouse lifecycle snapshot: return columns come ONLY from return-scan audit rows.
create or replace function public.be_warehouse_scan_lifecycle_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_raw jsonb;
  v_rows jsonb;
  v_stats jsonb;
begin
  v_raw := public.be_warehouse_scan_lifecycle_snapshot_unfiltered_20260827();

  select coalesce(jsonb_agg(
    (
      t.e
      || jsonb_build_object(
        'canonical_delivery_way_id',t.e->>'delivery_way_id',
        'source_waybill_no',coalesce(src.source_waybill_no,nullif(t.e->>'waybill_no',''),t.e->>'delivery_way_id'),
        'display_way_id',coalesce(src.source_waybill_no,nullif(t.e->>'waybill_no',''),t.e->>'delivery_way_id'),
        'tracking_no',coalesce(src.source_waybill_no,nullif(t.e->>'waybill_no',''),t.e->>'delivery_way_id'),
        'waybill_no',coalesce(src.source_waybill_no,nullif(t.e->>'waybill_no',''),t.e->>'delivery_way_id'),
        'return_scan_1_at',ret.return_scan_1_at,
        'return_reason_1',ret.return_reason_1,
        'return_reason_1_name',ret.return_reason_1_name,
        'return_scan_2_at',ret.return_scan_2_at,
        'return_reason_2',ret.return_reason_2,
        'return_reason_2_name',ret.return_reason_2_name,
        'return_scan_3_at',ret.return_scan_3_at,
        'return_reason_3',ret.return_reason_3,
        'return_reason_3_name',ret.return_reason_3_name,
        'return_attempt_count',coalesce(ret.return_count,0),
        'warehouse_scan_status',case
          when nullif(t.e->>'rto_at','') is not null or upper(coalesce(t.e->>'delivery_status',''))='RTO' then 'RTO'
          when coalesce(ret.return_count,0)>0 then 'RETURN_SCANNED'
          when nullif(t.e->>'dispatch_scan_at','') is not null then 'DISPATCH_SCANNED'
          when nullif(t.e->>'inbound_scan_at','') is not null then 'RECEIVED'
          else coalesce(t.e->>'warehouse_scan_status','PENDING')
        end
      )
    ) order by t.ord
  ),'[]'::jsonb)
  into v_rows
  from jsonb_array_elements(coalesce(v_raw->'rows','[]'::jsonb)) with ordinality as t(e,ord)
  left join lateral (
    select nullif(d.financial_quote->>'source_waybill_no','') as source_waybill_no
    from public.be_data_entry_parcel_details d
    where d.delivery_way_id=t.e->>'delivery_way_id'
    order by d.updated_at desc nulls last,d.saved_at desc nulls last
    limit 1
  ) src on true
  left join lateral (
    select
      max(h.scanned_at) filter(where h.attempt_number=1) as return_scan_1_at,
      max(h.reason_code) filter(where h.attempt_number=1) as return_reason_1,
      max(h.reason_name) filter(where h.attempt_number=1) as return_reason_1_name,
      max(h.scanned_at) filter(where h.attempt_number=2) as return_scan_2_at,
      max(h.reason_code) filter(where h.attempt_number=2) as return_reason_2,
      max(h.reason_name) filter(where h.attempt_number=2) as return_reason_2_name,
      max(h.scanned_at) filter(where h.attempt_number=3) as return_scan_3_at,
      max(h.reason_code) filter(where h.attempt_number=3) as return_reason_3,
      max(h.reason_name) filter(where h.attempt_number=3) as return_reason_3_name,
      count(*)::integer as return_count
    from public.be_warehouse_return_scans_v39 h
    where h.delivery_way_id=t.e->>'delivery_way_id'
  ) ret on true
  where not public.be_is_pre_golive_uat_key_v1(t.e->>'delivery_way_id');

  select jsonb_build_object(
    'rows',count(*),
    'received',count(*) filter(where nullif(e->>'inbound_scan_at','') is not null
      or upper(coalesce(e->>'warehouse_status',e->>'warehouse_scan_status','')) in ('RECEIVED','WAREHOUSE_RECEIVED','WAREHOUSE_READY')),
    'dispatch_scanned',count(*) filter(where nullif(e->>'dispatch_scan_at','') is not null),
    'returns',count(*) filter(where coalesce((e->>'return_attempt_count')::int,0)>0),
    'priority',count(*) filter(where coalesce((e->>'next_attempt_priority')::boolean,false)),
    'rto',count(*) filter(where nullif(e->>'rto_at','') is not null or upper(coalesce(e->>'delivery_status',''))='RTO')
  ) into v_stats
  from jsonb_array_elements(v_rows) e;

  return v_raw || jsonb_build_object(
    'rows',v_rows,'stats',v_stats,'active_scope','POST_GOLIVE_ONLY',
    'pre_golive_uat_isolated',true,'way_id_display','SOURCE_WAYBILL',
    'return_source','be_warehouse_return_scans_v39','build','WAREHOUSE_LIFECYCLE_STRICT_RETURN_V68'
  );
end;
$function$;
