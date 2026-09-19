-- V65: duplicate Way cleanup, authoritative dispatch timestamps,
-- and revocable delegated-superadmin authority for Yangon Operations Manager.

create table if not exists public.be_duplicate_way_archive_v65 (
  id uuid primary key default gen_random_uuid(),
  source_waybill_no text not null,
  archived_delivery_way_id text not null,
  survivor_delivery_way_id text not null,
  archived_pickup_id text,
  archived_parcel_sequence integer,
  archived_township text,
  survivor_township text,
  row_snapshot jsonb not null,
  receipt_snapshot jsonb,
  archived_at timestamptz not null default now(),
  archived_by text not null default 'V65_DUPLICATE_CLEANUP',
  reason text not null,
  unique(archived_delivery_way_id)
);

-- Preserve legitimate receipt history on the corrected survivor before archiving duplicates.
-- D0905-GRS-020 survivor already has the newest real receipt.
insert into public.be_warehouse_receipts_v36(
  pickup_id,parcel_sequence,delivery_way_id,warehouse_status,parcel_condition,
  discrepancy_code,discrepancy_remark,warehouse_code,staging_zone,
  declared_weight_kg,actual_weight_kg,scanned_at,scanned_by,ready_at,ready_by,
  label_printed_at,label_printed_by,label_scan_attempts,label_scan_passed,
  qa_approved_at,qa_approved_by,created_at,updated_at,receipt_method,
  receiving_scan_skipped,receiving_scan_skipped_at,receiving_scan_skipped_by,
  receiving_scan_skip_reason,warehouse_entered_at
)
select
  'P0914-BLK-275',243,'D0906-GRS-028',
  r.warehouse_status,r.parcel_condition,r.discrepancy_code,r.discrepancy_remark,
  r.warehouse_code,r.staging_zone,r.declared_weight_kg,r.actual_weight_kg,
  r.scanned_at,r.scanned_by,r.ready_at,r.ready_by,r.label_printed_at,r.label_printed_by,
  r.label_scan_attempts,r.label_scan_passed,r.qa_approved_at,r.qa_approved_by,
  r.created_at,now(),r.receipt_method,r.receiving_scan_skipped,
  r.receiving_scan_skipped_at,r.receiving_scan_skipped_by,r.receiving_scan_skip_reason,
  r.warehouse_entered_at
from public.be_warehouse_receipts_v36 r
where r.pickup_id='P0911-BLK-289' and r.parcel_sequence=251
on conflict(pickup_id,parcel_sequence) do update set
  warehouse_status=excluded.warehouse_status,
  parcel_condition=excluded.parcel_condition,
  discrepancy_code=excluded.discrepancy_code,
  discrepancy_remark=excluded.discrepancy_remark,
  warehouse_code=excluded.warehouse_code,
  staging_zone=excluded.staging_zone,
  scanned_at=coalesce(public.be_warehouse_receipts_v36.scanned_at,excluded.scanned_at),
  scanned_by=coalesce(public.be_warehouse_receipts_v36.scanned_by,excluded.scanned_by),
  ready_at=coalesce(public.be_warehouse_receipts_v36.ready_at,excluded.ready_at),
  ready_by=coalesce(public.be_warehouse_receipts_v36.ready_by,excluded.ready_by),
  warehouse_entered_at=coalesce(public.be_warehouse_receipts_v36.warehouse_entered_at,excluded.warehouse_entered_at),
  updated_at=now();

insert into public.be_warehouse_receipts_v36(
  pickup_id,parcel_sequence,delivery_way_id,warehouse_status,parcel_condition,
  discrepancy_code,discrepancy_remark,warehouse_code,staging_zone,
  declared_weight_kg,actual_weight_kg,scanned_at,scanned_by,ready_at,ready_by,
  label_printed_at,label_printed_by,label_scan_attempts,label_scan_passed,
  qa_approved_at,qa_approved_by,created_at,updated_at,receipt_method,
  receiving_scan_skipped,receiving_scan_skipped_at,receiving_scan_skipped_by,
  receiving_scan_skip_reason,warehouse_entered_at
)
select
  'P0912-BLK-001',228,'P0912-BLK-001-228',
  r.warehouse_status,r.parcel_condition,r.discrepancy_code,r.discrepancy_remark,
  r.warehouse_code,r.staging_zone,r.declared_weight_kg,r.actual_weight_kg,
  r.scanned_at,r.scanned_by,r.ready_at,r.ready_by,r.label_printed_at,r.label_printed_by,
  r.label_scan_attempts,r.label_scan_passed,r.qa_approved_at,r.qa_approved_by,
  r.created_at,now(),r.receipt_method,r.receiving_scan_skipped,
  r.receiving_scan_skipped_at,r.receiving_scan_skipped_by,r.receiving_scan_skip_reason,
  r.warehouse_entered_at
from public.be_warehouse_receipts_v36 r
where r.pickup_id='P0911-BLK-289' and r.parcel_sequence=252
on conflict(pickup_id,parcel_sequence) do update set
  warehouse_status=excluded.warehouse_status,
  parcel_condition=excluded.parcel_condition,
  discrepancy_code=excluded.discrepancy_code,
  discrepancy_remark=excluded.discrepancy_remark,
  warehouse_code=excluded.warehouse_code,
  staging_zone=excluded.staging_zone,
  scanned_at=coalesce(public.be_warehouse_receipts_v36.scanned_at,excluded.scanned_at),
  scanned_by=coalesce(public.be_warehouse_receipts_v36.scanned_by,excluded.scanned_by),
  ready_at=coalesce(public.be_warehouse_receipts_v36.ready_at,excluded.ready_at),
  ready_by=coalesce(public.be_warehouse_receipts_v36.ready_by,excluded.ready_by),
  warehouse_entered_at=coalesce(public.be_warehouse_receipts_v36.warehouse_entered_at,excluded.warehouse_entered_at),
  updated_at=now();

-- Archive known duplicate rows and keep one corrected operational row per real Way ID.
with map(source_waybill_no,archived_id,survivor_id) as (
  values
    ('D0905-GRS-020','P0911-BLK-289-250','P0912-BLK-001-229'),
    ('D0906-GRS-029','P0911-BLK-289-252','P0912-BLK-001-228'),
    ('D0906-GRS-028','P0911-BLK-289-251','D0906-GRS-028'),
    ('D0906-GRS-028','P0912-BLK-001-225','D0906-GRS-028')
)
insert into public.be_duplicate_way_archive_v65(
  source_waybill_no,archived_delivery_way_id,survivor_delivery_way_id,
  archived_pickup_id,archived_parcel_sequence,archived_township,survivor_township,
  row_snapshot,receipt_snapshot,reason
)
select
  m.source_waybill_no,d.delivery_way_id,m.survivor_id,d.pickup_id,d.parcel_sequence,
  d.township,s.township,to_jsonb(d),
  (
    select to_jsonb(r)
    from public.be_warehouse_receipts_v36 r
    where r.pickup_id=d.pickup_id and r.parcel_sequence=d.parcel_sequence
  ),
  case
    when d.township is distinct from s.township then 'DUPLICATE_SOURCE_WAYBILL_WRONG_TOWNSHIP'
    else 'DUPLICATE_SOURCE_WAYBILL_OLDER_CORRECTED_COPY'
  end
from map m
join public.be_data_entry_parcel_details d on d.delivery_way_id=m.archived_id
join public.be_data_entry_parcel_details s on s.delivery_way_id=m.survivor_id
on conflict(archived_delivery_way_id) do nothing;

update public.be_data_entry_parcel_details d
set parcel_status='duplicate_archived',
    warehouse_status='DUPLICATE_ARCHIVED',
    way_management_status='DUPLICATE_ARCHIVED',
    supervisor_status='DUPLICATE_ARCHIVED',
    financial_quote=coalesce(d.financial_quote,'{}'::jsonb)||jsonb_build_object(
      'duplicate_archived_v65',true,
      'duplicate_archived_at',now(),
      'duplicate_survivor_delivery_way_id',
        case d.delivery_way_id
          when 'P0911-BLK-289-250' then 'P0912-BLK-001-229'
          when 'P0911-BLK-289-252' then 'P0912-BLK-001-228'
          when 'P0911-BLK-289-251' then 'D0906-GRS-028'
          when 'P0912-BLK-001-225' then 'D0906-GRS-028'
        end
    ),
    updated_at=now()
where d.delivery_way_id in (
  'P0911-BLK-289-250','P0911-BLK-289-252','P0911-BLK-289-251','P0912-BLK-001-225'
);

update public.be_wayplan_membership_v40
set membership_status='CANCELLED',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'cancel_reason','DUPLICATE_ARCHIVED_V65','cancelled_at',now()
    ),
    updated_at=now()
where delivery_way_id in (
  'P0911-BLK-289-250','P0911-BLK-289-252','P0911-BLK-289-251','P0912-BLK-001-225'
)
and membership_status in ('PLANNED','READY_FOR_DISPATCH');

-- Operational warehouse view must never surface archived duplicates.
create or replace view public.be_v_warehouse_receipt_v36 as
with ranked_data as (
  select d.*,
         row_number() over (
           partition by
             upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id)),
             lower(regexp_replace(coalesce(d.recipient_name,''),'\\s+','','g')),
             regexp_replace(coalesce(d.contact_no_1,''),'[^0-9]','','g')
           order by
             case when upper(d.delivery_way_id)=upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id)) then 0 else 1 end,
             d.updated_at desc nulls last,
             d.created_at desc nulls last
         ) as canonical_rank
  from public.be_data_entry_parcel_details d
  where coalesce(d.parcel_status,'')<>'duplicate_archived'
    and coalesce(d.way_management_status,'')<>'DUPLICATE_ARCHIVED'
)
select
  d.pickup_id,
  d.parcel_sequence,
  d.delivery_way_id,
  wb.waybill_no as batch_waybill_no,
  coalesce(nullif(lp.sender_name,''),'Britium Merchant') as merchant_name,
  d.recipient_name,
  d.contact_no_1 as recipient_phone,
  d.township,
  d.recipient_address,
  d.destination,
  coalesce(d.item_price,0) as item_price,
  coalesce(d.delivery_fee,0) as delivery_fee,
  coalesce(d.surcharge,0) as surcharge,
  coalesce(d.actual_collect,0) as actual_collect,
  coalesce(d.weight_kg,0) as declared_weight_kg,
  d.remark,
  coalesce(r.warehouse_status,'PENDING') as warehouse_status,
  coalesce(r.parcel_condition,'UNINSPECTED') as parcel_condition,
  r.discrepancy_code,
  ec.label as discrepancy_name,
  r.discrepancy_remark,
  r.warehouse_code,
  r.staging_zone,
  r.actual_weight_kg,
  r.scanned_at,
  r.scanned_by,
  r.ready_at,
  r.ready_by,
  r.label_printed_at,
  r.label_printed_by,
  coalesce(r.label_scan_attempts,0) as label_scan_attempts,
  coalesce(r.label_scan_passed,false) as label_scan_passed,
  r.qa_approved_at,
  r.qa_approved_by,
  coalesce(r.updated_at,d.updated_at,d.saved_at) as updated_at
from ranked_data d
left join public.be_warehouse_receipts_v36 r
  on r.pickup_id=d.pickup_id and r.parcel_sequence=d.parcel_sequence
left join public.be_warehouse_exception_codes_v36 ec on ec.code=r.discrepancy_code
left join lateral (
  select w.waybill_no
  from public.be_parcel_waybills w
  where w.pickup_id=d.pickup_id
  order by w.updated_at desc nulls last,w.created_at desc nulls last
  limit 1
) wb on true
left join lateral (
  select p.sender_name
  from public.parcels p
  where p.tracking_code=d.delivery_way_id or p.way_id=d.delivery_way_id
  limit 1
) lp on true
where d.canonical_rank=1;

-- Wayplan regional queue applies the same canonical duplicate suppression.
create or replace function public.be_dispatch_ready_queue_v19(
  p_limit integer default 200,
  p_region_code text default 'YANGON'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_region text := upper(coalesce(nullif(btrim(p_region_code),''),'YANGON'));
  v_active boolean := false;
  v_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Unsupported Wayplan region.'; end if;

  select r.is_active into v_active
  from public.be_wayplan_region_runtime_v19 r
  where r.region_code=v_region;

  if not coalesce(v_active,false) then
    return jsonb_build_object('ok',true,'enabled',false,'region_code',v_region,'queue','[]'::jsonb,'count',0,'build','WAYPLAN_REGION_QUEUE_V65_CANONICAL');
  end if;

  select coalesce(jsonb_agg(to_jsonb(z) - 'canonical_rank' order by z.created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select y.*
    from (
      select
        q.*,
        d.delivery_region,
        d.delivery_route_mode,
        d.location_required,
        coalesce(d.financial_quote->>'service_provider_code','BRITIUM') as service_provider_code,
        row_number() over (
          partition by
            upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id)),
            lower(regexp_replace(coalesce(d.recipient_name,''),'\\s+','','g')),
            regexp_replace(coalesce(d.contact_no_1,''),'[^0-9]','','g')
          order by
            case when upper(d.delivery_way_id)=upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id)) then 0 else 1 end,
            d.updated_at desc nulls last,
            d.created_at desc nulls last
        ) as canonical_rank
      from public.be_v_dispatch_ready_queue q
      join public.be_data_entry_parcel_details d on d.delivery_way_id=q.delivery_way_id
      where d.delivery_region=v_region
        and d.delivery_route_mode='DOORSTEP_MAP'
        and d.location_required
        and coalesce(d.parcel_status,'')<>'duplicate_archived'
        and coalesce(d.way_management_status,'')<>'DUPLICATE_ARCHIVED'
        and exists (
          select 1 from public.be_delivery_location_registry location
          where location.delivery_way_id=d.delivery_way_id
            and location.review_status='ACCEPTED'
            and upper(coalesce(location.coordinate_source,'')) ~ '^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)'
            and location.latitude between 9 and 29
            and location.longitude between 92 and 102
        )
    ) y
    where y.canonical_rank=1
    order by y.created_at desc
    limit greatest(coalesce(p_limit,200),1)
  ) z;

  return jsonb_build_object(
    'ok',true,'enabled',true,'region_code',v_region,'queue',v_rows,
    'count',jsonb_array_length(v_rows),'build','WAYPLAN_REGION_QUEUE_V65_CANONICAL'
  );
end
$function$;

-- Make dispatch time authoritative and synchronized to the parcel record.
create or replace function public.be_sync_dispatch_scan_timestamp_v65()
returns trigger
language plpgsql
security definer
set search_path='public'
as $function$
begin
  if new.scan_status='SCANNED' and new.scanned_at is not null then
    update public.be_data_entry_parcel_details
    set dispatch_scanned_at=new.scanned_at,
        updated_at=greatest(coalesce(updated_at,new.scanned_at),new.scanned_at)
    where delivery_way_id=new.delivery_way_id;

    update public.be_wayplan_dispatch_stops
    set loaded_to_vehicle_at=new.scanned_at,
        scan_count=greatest(coalesce(scan_count,0),1),
        warehouse_status='DISPATCH_SCANNED',
        updated_at=now()
    where wayplan_id=new.wayplan_code
      and delivery_way_id=new.delivery_way_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists be_sync_dispatch_scan_timestamp_v65 on public.be_dispatch_scans_v39;
create trigger be_sync_dispatch_scan_timestamp_v65
after insert or update of scan_status,scanned_at
on public.be_dispatch_scans_v39
for each row execute function public.be_sync_dispatch_scan_timestamp_v65();

-- Backfill canonical parcel timestamp from the authoritative scan ledger.
update public.be_data_entry_parcel_details d
set dispatch_scanned_at=s.scanned_at
from public.be_dispatch_scans_v39 s
where s.delivery_way_id=d.delivery_way_id
  and s.scan_status='SCANNED'
  and (d.dispatch_scanned_at is distinct from s.scanned_at);

-- Revocable delegated-SUPERADMIN authority.
create table if not exists public.be_superadmin_delegations_v65 (
  target_email text primary key,
  target_auth_user_id uuid not null,
  active boolean not null default false,
  granted_at timestamptz,
  granted_by text,
  grant_reason text,
  revoked_at timestamptz,
  revoked_by text,
  revoke_reason text,
  original_account_registry jsonb,
  original_user_registry_role text,
  original_user_role text,
  original_auth_app_metadata jsonb,
  original_auth_user_metadata jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.be_superadmin_set_delegation_v65(
  p_target_email text,
  p_active boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','pg_temp'
as $function$
declare
  v_actor_email text;
  v_actor_is_permanent boolean:=false;
  v_target_email text:=lower(btrim(coalesce(p_target_email,'')));
  v_target_auth uuid;
  v_account public.be_user_account_registry%rowtype;
  v_user_registry_role text;
  v_user_roles_role text;
  v_auth_app jsonb;
  v_auth_user jsonb;
  v_saved public.be_superadmin_delegations_v65%rowtype;
begin
  if session_user='postgres' then
    v_actor_email:='system@britiumexpress.com';
    v_actor_is_permanent:=true;
  else
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    select lower(coalesce(email,account_email,user_email,login_email,'')),
           lower(coalesce(role_code,'')) in ('superadmin','super_admin')
           and not coalesce((metadata->>'delegated_superadmin_v65')::boolean,false)
      into v_actor_email,v_actor_is_permanent
    from public.be_user_account_registry
    where auth_user_id=auth.uid()
      and coalesce(active,is_active,true)
      and lower(coalesce(status,'active')) in ('active','enabled')
    order by updated_at desc nulls last
    limit 1;
  end if;

  if not coalesce(v_actor_is_permanent,false) then
    raise exception 'Permanent SUPERADMIN authority is required to grant or revoke delegated SUPERADMIN access';
  end if;
  if v_target_email='' then raise exception 'Target email is required'; end if;

  select * into v_account
  from public.be_user_account_registry
  where lower(coalesce(email,account_email,user_email,login_email,''))=v_target_email
  order by updated_at desc nulls last
  limit 1;
  if not found then raise exception 'Target account not found: %',v_target_email; end if;

  v_target_auth:=v_account.auth_user_id;
  if v_target_auth is null then raise exception 'Target account has no Auth user mapping'; end if;

  select raw_app_meta_data,raw_user_meta_data
    into v_auth_app,v_auth_user
  from auth.users where id=v_target_auth;

  select role into v_user_registry_role
  from public.be_user_registry
  where lower(email)=v_target_email
  order by created_at desc nulls last limit 1;

  select role into v_user_roles_role
  from public.be_user_roles
  where lower(email)=v_target_email
  order by updated_at desc nulls last limit 1;

  if p_active then
    insert into public.be_superadmin_delegations_v65(
      target_email,target_auth_user_id,active,granted_at,granted_by,grant_reason,
      revoked_at,revoked_by,revoke_reason,
      original_account_registry,original_user_registry_role,original_user_role,
      original_auth_app_metadata,original_auth_user_metadata,updated_at
    ) values(
      v_target_email,v_target_auth,true,now(),v_actor_email,p_reason,
      null,null,null,
      to_jsonb(v_account),v_user_registry_role,v_user_roles_role,
      coalesce(v_auth_app,'{}'::jsonb),coalesce(v_auth_user,'{}'::jsonb),now()
    )
    on conflict(target_email) do update set
      target_auth_user_id=excluded.target_auth_user_id,
      active=true,granted_at=now(),granted_by=v_actor_email,grant_reason=p_reason,
      revoked_at=null,revoked_by=null,revoke_reason=null,updated_at=now(),
      original_account_registry=case
        when public.be_superadmin_delegations_v65.active then public.be_superadmin_delegations_v65.original_account_registry
        else excluded.original_account_registry end,
      original_user_registry_role=case
        when public.be_superadmin_delegations_v65.active then public.be_superadmin_delegations_v65.original_user_registry_role
        else excluded.original_user_registry_role end,
      original_user_role=case
        when public.be_superadmin_delegations_v65.active then public.be_superadmin_delegations_v65.original_user_role
        else excluded.original_user_role end,
      original_auth_app_metadata=case
        when public.be_superadmin_delegations_v65.active then public.be_superadmin_delegations_v65.original_auth_app_metadata
        else excluded.original_auth_app_metadata end,
      original_auth_user_metadata=case
        when public.be_superadmin_delegations_v65.active then public.be_superadmin_delegations_v65.original_auth_user_metadata
        else excluded.original_auth_user_metadata end;

    update public.be_user_account_registry
    set role='superadmin',role_code='superadmin',app_role='superadmin',
        user_role='superadmin',role_id='superadmin',
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'delegated_superadmin_v65',true,
          'delegated_superadmin_granted_by',v_actor_email,
          'delegated_superadmin_granted_at',now()
        ),
        updated_at=now()
    where auth_user_id=v_target_auth;

    update public.be_user_registry set role='superadmin'
    where lower(email)=v_target_email;

    update public.be_user_roles set role='superadmin',updated_at=now()
    where lower(email)=v_target_email;

    update auth.users
    set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object(
          'role','superadmin','app_role','superadmin','role_code','superadmin',
          'delegated_superadmin_v65',true
        ),
        raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object(
          'role','superadmin','app_role','superadmin','role_code','superadmin',
          'delegated_superadmin_v65',true
        ),
        updated_at=now()
    where id=v_target_auth;

    insert into public.be_audit_events(actor_email,actor_role,action,resource_type,resource_id,details)
    values(v_actor_email,'SUPERADMIN','SUPERADMIN_DELEGATION_GRANTED_V65','USER',v_target_email,
      jsonb_build_object('target_auth_user_id',v_target_auth,'reason',p_reason,'revocable',true));

    return jsonb_build_object('ok',true,'target_email',v_target_email,'active',true,'role','SUPERADMIN','relogin_required',true);
  end if;

  select * into v_saved
  from public.be_superadmin_delegations_v65
  where target_email=v_target_email;
  if not found or not v_saved.active then
    return jsonb_build_object('ok',true,'target_email',v_target_email,'active',false,'message','No active delegation to revoke');
  end if;

  update public.be_user_account_registry u
  set role=coalesce(v_saved.original_account_registry->>'role','admin'),
      role_code=coalesce(v_saved.original_account_registry->>'role_code','admin'),
      app_role=coalesce(v_saved.original_account_registry->>'app_role','user'),
      user_role=coalesce(v_saved.original_account_registry->>'user_role','admin'),
      role_id=coalesce(v_saved.original_account_registry->>'role_id','admin'),
      metadata=coalesce(v_saved.original_account_registry->'metadata','{}'::jsonb),
      updated_at=now()
  where u.auth_user_id=v_target_auth;

  if v_saved.original_user_registry_role is not null then
    update public.be_user_registry set role=v_saved.original_user_registry_role
    where lower(email)=v_target_email;
  end if;

  if v_saved.original_user_role is not null then
    update public.be_user_roles set role=v_saved.original_user_role,updated_at=now()
    where lower(email)=v_target_email;
  end if;

  update auth.users
  set raw_app_meta_data=coalesce(v_saved.original_auth_app_metadata,'{}'::jsonb),
      raw_user_meta_data=coalesce(v_saved.original_auth_user_metadata,'{}'::jsonb),
      updated_at=now()
  where id=v_target_auth;

  update public.be_superadmin_delegations_v65
  set active=false,revoked_at=now(),revoked_by=v_actor_email,revoke_reason=p_reason,updated_at=now()
  where target_email=v_target_email;

  insert into public.be_audit_events(actor_email,actor_role,action,resource_type,resource_id,details)
  values(v_actor_email,'SUPERADMIN','SUPERADMIN_DELEGATION_REVOKED_V65','USER',v_target_email,
    jsonb_build_object('target_auth_user_id',v_target_auth,'reason',p_reason));

  return jsonb_build_object('ok',true,'target_email',v_target_email,'active',false,'relogin_required',true);
end;
$function$;

grant execute on function public.be_superadmin_set_delegation_v65(text,boolean,text) to authenticated;

create or replace function public.be_superadmin_delegation_status_v65()
returns jsonb
language sql
stable
security definer
set search_path='public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'target_email',target_email,'active',active,'granted_at',granted_at,
    'granted_by',granted_by,'grant_reason',grant_reason,
    'revoked_at',revoked_at,'revoked_by',revoked_by,'revoke_reason',revoke_reason
  ) order by updated_at desc),'[]'::jsonb)
  from public.be_superadmin_delegations_v65;
$function$;
grant execute on function public.be_superadmin_delegation_status_v65() to authenticated;

-- Grant the requested revocable delegation now.
select public.be_superadmin_set_delegation_v65(
  'optmgr_ygn_001@britiumventures.com',
  true,
  'Managing Director authorized Operations Manager to hold revocable SUPERADMIN-equivalent authority for Yangon operations and Wayplan management.'
);
