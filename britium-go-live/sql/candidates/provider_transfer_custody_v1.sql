-- ISOLATED UAT ONLY. Requires provider_transfer_wayplan_draft_v1.sql.
-- Custody is independent of delivery. It requires an actual Warehouse dispatch
-- scan AND the partner's physical signed receipt reference.
create table if not exists public.be_provider_transfer_custody_v1 (
  delivery_way_id text primary key,
  wayplan_id text not null references public.be_wayplan_dispatches(wayplan_id),
  provider_code text not null references public.be_data_entry_service_providers(provider_code),
  handover_location_code text not null references public.be_wayplan_service_locations(location_code),
  handover_manifest_ref text not null,
  provider_receiver_name text not null,
  provider_receipt_ref text not null,
  proof_reference text not null,
  dispatch_scanned_at timestamptz not null,
  physically_handed_over_at timestamptz not null default now(),
  confirmed_by uuid not null,
  created_at timestamptz not null default now(),
  constraint provider_receipt_nonblank check (
    length(btrim(provider_receiver_name))>=3
    and length(btrim(provider_receipt_ref))>=5
    and length(btrim(proof_reference))>=5
    and length(btrim(handover_manifest_ref))>=5
  )
);
alter table public.be_provider_transfer_custody_v1 enable row level security;
revoke all on table public.be_provider_transfer_custody_v1 from public,anon,authenticated;
-- A verified physical handover is recorded through an authorized RPC only.
create or replace function public.be_provider_transfer_confirm_handover_v1(
  p_way_id text,p_wayplan_id text,p_provider_code text,p_location_code text,
  p_manifest_ref text,p_receiver_name text,p_provider_receipt_ref text,p_proof_reference text
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $body$
declare
  v_way text:=upper(btrim(coalesce(p_way_id,'')));
  v_plan text:=btrim(coalesce(p_wayplan_id,''));
  v_provider text:=upper(btrim(coalesce(p_provider_code,'')));
  v_location text:=upper(btrim(coalesce(p_location_code,'')));
  v_actor uuid:=auth.uid();
  v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
  v_last_scan timestamptz;
  v_branch text;
begin
  if v_actor is null or v_role not in
     ('superadmin','super_admin','operation_manager','operations_manager',
      'warehouse','warehouse_staff','warehouse_lead','warehouse_manager',
      'operations','operations_admin','supervisor','admin')
    then raise exception 'Authorized Warehouse or Operations staff required'; end if;
  -- The Warehouse legacy assertion excludes some Operations Manager roles;
  -- this RPC has its own explicit role+branch+auth gate and does not bypass
  -- Supervisor release or the actual dispatch scan.
  if coalesce(auth.jwt()->>'is_anonymous','false')='true' then
    raise exception 'Anonymous sessions cannot confirm provider custody';
  end if;
  if length(btrim(coalesce(p_manifest_ref,'')))<5
    or length(btrim(coalesce(p_receiver_name,'')))<3
    or length(btrim(coalesce(p_provider_receipt_ref,'')))<5
    or length(btrim(coalesce(p_proof_reference,'')))<5
    then raise exception 'Physical manifest, receiver, provider receipt and evidence are mandatory';
  end if;
  select branch_code into v_branch
  from public.be_wayplan_dispatches
  where wayplan_id=v_plan
    and metadata->>'plan_type'='THIRD_PARTY_PROVIDER_TRANSFER'
    and upper(metadata->>'provider_code')=v_provider
    and upper(metadata->>'handover_location_code')=v_location;
  if v_branch is null then raise exception 'Approved third-party transfer Wayplan not found'; end if;
  perform public.be_branch_scope_v1(v_branch);
  if not exists(
    select 1 from public.be_wayplan_review_v43 r
    where r.wayplan_id=v_plan and r.review_status='DISPATCH_READY'
  ) then raise exception 'Supervisor DISPATCH_READY release required'; end if;
  if not exists (
    select 1 from public.be_wayplan_membership_v40 m
    where m.wayplan_id=v_plan and upper(m.delivery_way_id)=v_way
      and m.membership_status not in ('CANCELLED','COMPLETED','RTO')
  ) then raise exception 'Way is not active in this Wayplan'; end if;
  if not exists(
    select 1 from public.be_provider_handover_sites_v1 h
    where h.provider_code=v_provider and h.origin_branch_code=v_branch
      and upper(h.location_code)=v_location and h.active
      and h.verified_at is not null and h.verified_by is not null
  ) then raise exception 'Approved provider handover site is no longer active'; end if;
  select max(scanned_at) into v_last_scan
  from public.be_dispatch_scans_v39 ds
  where upper(ds.delivery_way_id)=v_way and ds.wayplan_code=v_plan
    and ds.scan_status='SCANNED';
  if v_last_scan is null then
    raise exception 'Physical Warehouse Dispatch Scan is required before partner handover';
  end if;
  if exists (
    select 1 from public.be_warehouse_return_scans_v39 rs
    where upper(rs.delivery_way_id)=v_way and rs.scanned_at>=v_last_scan
  ) then raise exception 'Parcel already physically returned after dispatch'; end if;
  if not exists (
    select 1 from public.be_data_entry_parcel_details d
    where upper(d.delivery_way_id)=v_way
      and upper(coalesce(d.parcel_status,'')) not in
        ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED')
  ) then raise exception 'Way no longer belongs to an active parcel'; end if;
  if exists (
    select 1 from public.be_thirdparty_cs_current_v1 cs
    where upper(cs.delivery_way_id)=v_way
      and upper(coalesce(cs.outcome,'')) in ('DELIVERED','RTO')
  ) then raise exception 'CS has already recorded a terminal third-party outcome'; end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-custody:'||v_way,0));
  if exists(select 1 from public.be_provider_transfer_custody_v1 where delivery_way_id=v_way)
    then raise exception 'Provider custody already confirmed for this Way ID'; end if;
  insert into public.be_provider_transfer_custody_v1(
    delivery_way_id,wayplan_id,provider_code,handover_location_code,
    handover_manifest_ref,provider_receiver_name,provider_receipt_ref,
    proof_reference,dispatch_scanned_at,confirmed_by
  ) values (
    v_way,v_plan,v_provider,v_location,btrim(p_manifest_ref),btrim(p_receiver_name),
    btrim(p_provider_receipt_ref),btrim(p_proof_reference),v_last_scan,v_actor
  );
  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details
  ) values (
    v_actor,coalesce(auth.jwt()->>'email',''),public.be_current_user_role(),
    'PROVIDER_HANDOVER_CONFIRMED_V1','DELIVERY_WAY',v_way,
    jsonb_build_object('wayplan_id',v_plan,'provider_code',v_provider,
      'handover_location_code',v_location,'provider_receipt_ref',p_provider_receipt_ref,
      'manifest_ref',p_manifest_ref,'dispatch_scan_at',v_last_scan,
      'customer_delivery_confirmed',false,'settlement_posted',false)
  );
  return jsonb_build_object('ok',true,'delivery_way_id',v_way,
    'provider_code',v_provider,'wayplan_id',v_plan,
    'handover_recorded',true,'customer_delivery_confirmed',false,
    'settlement_posted',false,'build','PROVIDER_HANDOVER_CONFIRM_V1');
end;
$body$;
revoke all on function public.be_provider_transfer_confirm_handover_v1(
  text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.be_provider_transfer_confirm_handover_v1(
  text,text,text,text,text,text,text,text) to authenticated;
