-- Temporary provider classification for parcel follow-up.
-- Operational review metadata ONLY. Never changes actual custody,
-- booked service provider, Wayplan, tariff, COD or settlement.
create schema if not exists private;

create table if not exists private.be_parcel_temp_provider_v1 (
  delivery_way_id text primary key,
  territory_provider_code text,
  provisional_provider_code text not null,
  township text,
  reason text not null,
  selected_by uuid not null,
  selected_at timestamptz not null default now()
);
create table if not exists private.be_parcel_temp_provider_audit_v1 (
  id bigint generated always as identity primary key,
  delivery_way_id text not null,
  original_suggestion text,
  previous_provisional_provider text,
  new_provisional_provider text not null,
  reason text not null,
  changed_by uuid not null,
  changed_at timestamptz not null default now()
);
revoke all on private.be_parcel_temp_provider_v1 from public,anon,authenticated;
revoke all on private.be_parcel_temp_provider_audit_v1 from public,anon,authenticated;

create or replace function public.be_parcel_temp_provider_snapshot_v1(p_way_id text)
returns jsonb language plpgsql stable security definer
set search_path=public,private,auth,pg_temp
as $body$
declare
  v_way text:=upper(btrim(coalesce(p_way_id,'')));
  v_role text:=lower(coalesce(public.be_current_role(),''));
  v_township text;
  v_auto text;
  v_record private.be_parcel_temp_provider_v1%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if v_role not in ('superadmin','operation_manager','operations_manager','operation_supervisor','customer_service','bd_manager','data_entry','warehouse','warehouse_lead','warehouse_manager') then
    raise exception 'PROVIDER_REVIEW_NOT_AUTHORIZED' using errcode='42501';
  end if;
  if v_way='' or length(v_way)>100 then raise exception 'WAY_ID_REQUIRED' using errcode='22023'; end if;
  select d.township into v_township from public.be_data_entry_parcel_details d
   where upper(btrim(d.delivery_way_id))=v_way order by d.updated_at desc limit 1;
  if v_township is null then
    select w.township into v_township from public.be_warehouse_inventory w
    where upper(btrim(coalesce(w.delivery_way_id,w.way_id,w.waybill_no)))=v_way limit 1;
  end if;
  if v_township is null then raise exception 'PARCEL_NOT_FOUND_OR_DESTINATION_UNKNOWN' using errcode='22023'; end if;
  v_auto:=public.be_data_entry_service_provider_route_v17(v_township)->>'provider_code';
  select * into v_record from private.be_parcel_temp_provider_v1 where delivery_way_id=v_way;
  return jsonb_build_object(
    'ok',true,'way_id',v_way,'township',v_township,
    'territory_suggestion',v_auto,
    'provisional_provider',v_record.provisional_provider_code,
    'provisional_reason',v_record.reason,
    'reviewed_at',v_record.selected_at,
    'reviewed_by',v_record.selected_by,
    'is_temporary',true,'booked_provider_unchanged',true,
    'finance_unchanged',true
  );
end $body$;

create or replace function public.be_parcel_temp_provider_set_v1(
  p_way_id text,p_provider_code text,p_reason text
) returns jsonb language plpgsql volatile security definer
set search_path=public,private,auth,pg_temp
as $body$
declare
  v_way text:=upper(btrim(coalesce(p_way_id,'')));
  v_provider text:=upper(btrim(coalesce(p_provider_code,'')));
  v_role text:=lower(coalesce(public.be_current_role(),''));
  v_township text;
  v_auto text;
  v_old text;
  v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if v_role not in ('superadmin','operation_manager','operations_manager','operation_supervisor') then
    raise exception 'OPERATIONS_MANAGER_REQUIRED_FOR_PROVISIONAL_PROVIDER' using errcode='42501';
  end if;
  if v_way='' or length(v_way)>100 or length(v_reason)<12 or length(v_reason)>600 then
    raise exception 'WAY_AND_REVIEW_REASON_REQUIRED' using errcode='22023';
  end if;
  if not exists(select 1 from public.be_data_entry_service_providers p where p.provider_code=v_provider and p.is_active) then
    raise exception 'PROVIDER_NOT_ACTIVE' using errcode='22023';
  end if;
  select d.township into v_township from public.be_data_entry_parcel_details d
   where upper(btrim(d.delivery_way_id))=v_way order by d.updated_at desc limit 1;
  if v_township is null then
    select w.township into v_township from public.be_warehouse_inventory w
    where upper(btrim(coalesce(w.delivery_way_id,w.way_id,w.waybill_no)))=v_way limit 1;
  end if;
  if v_township is null then raise exception 'PARCEL_NOT_FOUND_OR_DESTINATION_UNKNOWN' using errcode='22023'; end if;
  v_auto:=public.be_data_entry_service_provider_route_v17(v_township)->>'provider_code';
  select provisional_provider_code into v_old from private.be_parcel_temp_provider_v1
   where delivery_way_id=v_way for update;

  insert into private.be_parcel_temp_provider_v1(
    delivery_way_id,territory_provider_code,provisional_provider_code,township,reason,selected_by,selected_at
  ) values(v_way,v_auto,v_provider,v_township,v_reason,auth.uid(),now())
  on conflict(delivery_way_id) do update set
    territory_provider_code=excluded.territory_provider_code,
    provisional_provider_code=excluded.provisional_provider_code,
    township=excluded.township,
    reason=excluded.reason,selected_by=excluded.selected_by,selected_at=excluded.selected_at;

  insert into private.be_parcel_temp_provider_audit_v1(
    delivery_way_id,original_suggestion,previous_provisional_provider,new_provisional_provider,reason,changed_by
  ) values(v_way,v_auto,v_old,v_provider,v_reason,auth.uid());
  return jsonb_build_object(
    'ok',true,'way_id',v_way,'provisional_provider',v_provider,
    'territory_suggestion',v_auto,'is_temporary',true,
    'booked_provider_unchanged',true,'tariff_unchanged',true,
    'custody_unchanged',true,'finance_unchanged',true
  );
end $body$;

revoke all on function public.be_parcel_temp_provider_snapshot_v1(text) from public,anon;
grant execute on function public.be_parcel_temp_provider_snapshot_v1(text) to authenticated;
revoke all on function public.be_parcel_temp_provider_set_v1(text,text,text) from public,anon;
grant execute on function public.be_parcel_temp_provider_set_v1(text,text,text) to authenticated;
