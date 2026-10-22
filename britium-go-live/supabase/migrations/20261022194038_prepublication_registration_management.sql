-- Recoverable removal of an unpublished registration; pickup evidence is retained.
create schema if not exists private;
create table if not exists private.be_removed_data_entry_registrations(
 id uuid primary key default gen_random_uuid(),pickup_id text not null,parcel_sequence integer not null,
 delivery_way_id text not null,removed_at timestamptz not null default now(),removed_by uuid not null,
 reason text not null,snapshot jsonb not null
);
alter table private.be_removed_data_entry_registrations enable row level security;
revoke all on private.be_removed_data_entry_registrations from public,anon,authenticated;
create or replace function public.be_data_entry_registration_delete_v1(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_pickup text:=nullif(btrim(p_payload->>'pickup_id'),'');
 v_sequence integer:=case when p_payload->>'parcel_sequence' ~ '^[1-9][0-9]*$' then (p_payload->>'parcel_sequence')::integer end;
 v_reason text:=nullif(btrim(p_payload->>'reason'),'');
 v_expected timestamptz:=nullif(p_payload->>'expected_updated_at','')::timestamptz;
 v_access jsonb;v_d public.be_data_entry_parcel_details%rowtype;v_p public.parcels%rowtype;
 v_way text;v_snapshot jsonb;v_archive uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 v_access:=public.be_data_entry_require_access_v57('delete',false);
 if v_pickup is null or v_sequence is null or length(coalesce(v_reason,''))<3 or v_expected is null then
   return jsonb_build_object('ok',false,'code','PICKUP_SEQUENCE_REASON_VERSION_REQUIRED','message','Reload the registration and enter a reason before deleting.');
 end if;
 perform pg_advisory_xact_lock(hashtextextended('WAYBILL:'||v_pickup,0));
 select delivery_way_id into v_way from public.be_data_entry_parcel_details where pickup_id=v_pickup and parcel_sequence=v_sequence;
 if v_way is null then return jsonb_build_object('ok',false,'code','REGISTRATION_NOT_FOUND','message','Registration was already removed or changed. Refresh the pickup.');end if;
 perform pg_advisory_xact_lock(hashtextextended(v_way,0));
 select * into v_p from public.parcels where way_id=v_way for update;
 select * into v_d from public.be_data_entry_parcel_details where pickup_id=v_pickup and parcel_sequence=v_sequence for update;
 if not found then return jsonb_build_object('ok',false,'code','REGISTRATION_NOT_FOUND');end if;
 if v_d.updated_at is distinct from v_expected then return jsonb_build_object('ok',false,'code','REGISTRATION_CHANGED','message','Someone changed this registration. Refresh and review it before deleting.');end if;
 if coalesce(v_d.is_printed,false) or v_d.printed_at is not null or v_p.financial_locked_at is not null
 or upper(coalesce(v_d.print_status,'')) in ('PRINTED','PUBLISHED','CREATED')
 or exists(select 1 from public.be_waybill_ledger where delivery_way_id=v_way) then
 return jsonb_build_object('ok',false,'code','WAYBILL_ALREADY_PUBLISHED','message','A waybill exists or was printed. This registration cannot be deleted here.');end if;
 if v_p.assigned_rider_id is not null or v_p.wayplan_id is not null or v_p.financial_settled_at is not null or v_p.financial_settlement_batch_id is not null or coalesce(v_d.actual_collect,0)<>0 or v_d.dispatch_scanned_at is not null or v_d.inbound_scanned_at is not null or v_d.closed_at is not null or nullif(v_d.assigned_rider_id,'') is not null
 or upper(coalesce(v_d.warehouse_status,'')) not in ('','PENDING','NOT_RECEIVED','WAITING','AWAITING_INBOUND','PENDING_INBOUND')
 or upper(coalesce(v_d.finance_status,'')) in ('PAID','SETTLED','CONFIRMED','APPROVED','CLOSED')
 or exists(select 1 from public.be_warehouse_inventory_rows where parcel_id=v_p.id)
 or exists(select 1 from public.manifest_items where parcel_id=v_p.id)
 or exists(select 1 from public.rider_earnings where parcel_id=v_p.id)
 or exists(select 1 from public.be_journal_lines where source_reference=v_way)
 or exists(select 1 from public.shipments where way_id in (v_way,v_p.tracking_code) and upper(coalesce(status,'')) not in ('','CREATED','REGISTERED','PENDING','DRAFT')) then
 return jsonb_build_object('ok',false,'code','DOWNSTREAM_ACTIVITY_EXISTS','message','Warehouse, delivery or finance activity exists. This record cannot be deleted from Data Entry.');end if;
 select jsonb_build_object('detail',to_jsonb(v_d),'parcel',case when v_p.id is null then null else to_jsonb(v_p) end,
 'register_rows',coalesce((select jsonb_agg(to_jsonb(r)) from public.be_data_entry_register_rows r where r.delivery_way_id=v_way),'[]'::jsonb),
 'shipments',coalesce((select jsonb_agg(to_jsonb(s)) from public.shipments s where s.way_id in (v_way,v_p.tracking_code)),'[]'::jsonb),
 'drafts',coalesce((select jsonb_agg(to_jsonb(d)) from public.be_data_entry_pending_drafts d where d.pickup_id=v_pickup and d.parcel_sequence=v_sequence),'[]'::jsonb)) into v_snapshot;
 insert into private.be_removed_data_entry_registrations(pickup_id,parcel_sequence,delivery_way_id,removed_by,reason,snapshot)
 values(v_pickup,v_sequence,v_way,auth.uid(),v_reason,v_snapshot) returning id into v_archive;
 delete from public.be_data_entry_pending_drafts where pickup_id=v_pickup and parcel_sequence=v_sequence;
 delete from public.be_data_entry_register_rows where delivery_way_id=v_way;
 delete from public.be_data_entry_parcel_details where id=v_d.id;
 delete from public.shipments where way_id in (v_way,v_p.tracking_code);
 delete from public.parcels where id=v_p.id;
 update public.be_portal_pickup_requests set registered_parcel_count=(select count(*) from public.be_data_entry_parcel_details where pickup_id=v_pickup),updated_at=now() where pickup_id=v_pickup;
 insert into public.be_audit_events(actor_id,actor_email,actor_role,action,resource_type,resource_id,details,upload_code,event_type,entity_type,entity_id,payload)
 values(auth.uid(),v_access->>'actor_email',v_access->>'actor_role','DATA_ENTRY_UNPUBLISHED_REGISTRATION_DELETED','DATA_ENTRY_REGISTRATION',v_way,
 jsonb_build_object('reason',v_reason,'recovery_id',v_archive,'evidence_retained',true),v_pickup,'DATA_ENTRY_UNPUBLISHED_REGISTRATION_DELETED','DATA_ENTRY_REGISTRATION',v_way,
 jsonb_build_object('reason',v_reason,'recovery_id',v_archive,'pickup_id',v_pickup,'parcel_sequence',v_sequence));
 return jsonb_build_object('ok',true,'deleted',true,'recovery_id',v_archive,'delivery_way_id',v_way,'evidence_retained',true);
end $$;
revoke all on function public.be_data_entry_registration_delete_v1(jsonb) from public,anon;
grant execute on function public.be_data_entry_registration_delete_v1(jsonb) to authenticated;

create or replace function public.be_data_entry_registration_state_v1(p_pickup_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform public.be_data_entry_require_access_v57('view',false);
 select coalesce(jsonb_agg(jsonb_build_object('parcel_sequence',d.parcel_sequence,'updated_at',d.updated_at,
 'published',coalesce(d.is_printed,false) or d.printed_at is not null or upper(coalesce(d.print_status,'')) in ('PRINTED','PUBLISHED','CREATED')
 or exists(select 1 from public.parcels p where p.way_id=d.delivery_way_id and p.financial_locked_at is not null)
 or exists(select 1 from public.be_waybill_ledger w where w.delivery_way_id=d.delivery_way_id))),'[]'::jsonb) into v_rows
 from public.be_data_entry_parcel_details d where d.pickup_id=p_pickup_id;
 return jsonb_build_object('ok',true,'rows',v_rows);
end $$;
revoke all on function public.be_data_entry_registration_state_v1(text) from public,anon;
grant execute on function public.be_data_entry_registration_state_v1(text) to authenticated;

-- Save boundary patch
-- Keep the canonical save chain intact and reject edits after waybill publication.
do $patch$
declare v_def text;v_guard text:= $guard$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING errcode='42501';END IF;
  IF v_pickup IS NOT NULL AND v_sequence IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.be_data_entry_parcel_details WHERE pickup_id=v_pickup AND parcel_sequence=v_sequence) THEN PERFORM public.be_data_entry_require_access_v57('update',false);END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('WAYBILL:'||v_pickup,0));
    IF EXISTS(
      SELECT 1 FROM public.be_data_entry_parcel_details d
      WHERE d.pickup_id=v_pickup AND d.parcel_sequence=v_sequence
      AND (coalesce(d.is_printed,false) OR d.printed_at IS NOT NULL
        OR upper(coalesce(d.print_status,'')) IN ('PRINTED','PUBLISHED','CREATED')
        OR EXISTS(SELECT 1 FROM public.parcels p WHERE p.way_id=d.delivery_way_id AND p.financial_locked_at IS NOT NULL)
        OR EXISTS(SELECT 1 FROM public.be_waybill_ledger w WHERE w.delivery_way_id=d.delivery_way_id))
    ) THEN RETURN jsonb_build_object('ok',false,'persisted',false,'errors',jsonb_build_array(jsonb_build_object('code','WAYBILL_ALREADY_PUBLISHED','message','This waybill is already published. Data Entry edits are locked.')));END IF;
  END IF;
  IF v_source IS NULL THEN
$guard$;
begin
 select pg_get_functiondef('public.be_data_entry_financial_v2_save(jsonb)'::regprocedure) into v_def;
 if position('Data Entry edits are locked.' in v_def)=0 then
   if position(E'BEGIN\n  IF v_source IS NULL THEN' in v_def)=0 then raise exception 'Canonical save wrapper changed; review the publication guard before applying.';end if;
   v_def:=replace(v_def,E'BEGIN\n  IF v_source IS NULL THEN',v_guard);
   v_def:=replace(v_def,'v_result := public.be_data_entry_financial_v2_save_legacy_v33(v_payload);',
   $version$v_result := public.be_data_entry_financial_v2_save_legacy_v33(v_payload);
   IF coalesce((v_result->>'persisted')::boolean,false) THEN
    v_result:=v_result||jsonb_build_object('registration_updated_at',(SELECT updated_at FROM public.be_data_entry_parcel_details WHERE pickup_id=v_pickup AND parcel_sequence=v_sequence));
   END IF;$version$);
   execute v_def;
 end if;
end $patch$;
