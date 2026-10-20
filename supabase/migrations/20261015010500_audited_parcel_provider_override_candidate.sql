-- Release candidate. Keep off production until provider pricing/wayplan consumers honor effective provider.
create table if not exists public.be_parcel_provider_overrides_v1 (
  delivery_way_id text primary key,
  automatic_provider_code text not null,
  override_provider_code text not null references public.be_data_entry_service_providers(provider_code),
  override_reason text not null check (length(btrim(override_reason)) >= 12),
  changed_by uuid not null,
  changed_at timestamptz not null default now(),
  revision integer not null default 1
);
create table if not exists public.be_parcel_provider_override_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  delivery_way_id text not null,
  previous_provider_code text,
  new_provider_code text not null,
  reason text not null,
  actor_id uuid not null,
  changed_at timestamptz not null default now()
);
alter table public.be_parcel_provider_overrides_v1 enable row level security;
alter table public.be_parcel_provider_override_audit_v1 enable row level security;
revoke all on public.be_parcel_provider_overrides_v1,public.be_parcel_provider_override_audit_v1 from anon,authenticated;
create or replace function public.be_set_parcel_provider_override_v1(p_way_id text,p_provider_code text,p_reason text)
returns jsonb language plpgsql security definer set search_path='public','auth','pg_temp' as $$
declare v_role text; v_default text; v_previous text; v_way text:=upper(btrim(coalesce(p_way_id,''))); v_provider text:=upper(btrim(coalesce(p_provider_code,'')));
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 v_role:=lower(coalesce(public.be_current_role(),''));
 if v_role not in ('superadmin','operation_manager','operations_manager','operation_supervisor','customer_service','bd_manager','data_entry') then raise exception 'PROVIDER_OVERRIDE_NOT_AUTHORIZED'; end if;
 if length(btrim(coalesce(p_reason,'')))<12 then raise exception 'OVERRIDE_REASON_REQUIRED'; end if;
 if not exists(select 1 from public.be_data_entry_service_providers where provider_code=v_provider and is_active) then raise exception 'PROVIDER_NOT_ACTIVE'; end if;
 if not exists(select 1 from public.be_data_entry_parcel_details where delivery_way_id=v_way and closed_at is null) then raise exception 'PARCEL_NOT_FOUND_OR_CLOSED'; end if;
 select provider_code into v_default from jsonb_to_record(public.be_data_entry_service_provider_route_v17(
 (select township from public.be_data_entry_parcel_details where delivery_way_id=v_way limit 1))) as x(provider_code text);
 select override_provider_code into v_previous from public.be_parcel_provider_overrides_v1 where delivery_way_id=v_way for update;
 insert into public.be_parcel_provider_overrides_v1(delivery_way_id,automatic_provider_code,override_provider_code,override_reason,changed_by)
 values(v_way,coalesce(v_default,'UNRESOLVED'),v_provider,p_reason,auth.uid())
 on conflict(delivery_way_id) do update set override_provider_code=excluded.override_provider_code,override_reason=excluded.override_reason,changed_by=excluded.changed_by,changed_at=now(),revision=be_parcel_provider_overrides_v1.revision+1;
 insert into public.be_parcel_provider_override_audit_v1(delivery_way_id,previous_provider_code,new_provider_code,reason,actor_id) values(v_way,coalesce(v_previous,v_default),v_provider,p_reason,auth.uid());
 return jsonb_build_object('ok',true,'way_id',v_way,'automatic_provider_code',v_default,'override_provider_code',v_provider,'effective_pricing_pending_review',true);
end $$;
revoke all on function public.be_set_parcel_provider_override_v1(text,text,text) from public,anon;
grant execute on function public.be_set_parcel_provider_override_v1(text,text,text) to authenticated;