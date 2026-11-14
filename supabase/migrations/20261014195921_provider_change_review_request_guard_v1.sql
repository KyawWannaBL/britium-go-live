create table if not exists public.be_parcel_provider_change_requests_v1 (
 id uuid primary key default gen_random_uuid(),
 delivery_way_id text not null,
 requested_provider_code text not null references public.be_data_entry_service_providers(provider_code),
 automatic_provider_code text not null,
 reason text not null check(length(btrim(reason))>=12),
 requested_by uuid not null,
 requested_at timestamptz not null default now(),
 status text not null default 'PENDING_REVIEW' check(status in ('PENDING_REVIEW','REJECTED','APPLIED')),
 reviewed_by uuid,
 reviewed_at timestamptz,
 review_note text
);
create unique index if not exists be_provider_change_one_pending_v1 on public.be_parcel_provider_change_requests_v1(delivery_way_id) where status='PENDING_REVIEW';
alter table public.be_parcel_provider_change_requests_v1 enable row level security;
revoke all on public.be_parcel_provider_change_requests_v1 from public,anon,authenticated;
create or replace function public.be_request_parcel_provider_change_v1(p_way_id text,p_provider_code text,p_reason text)
returns jsonb language plpgsql security definer set search_path='public','auth','pg_temp' as $$
declare v_role text; v_way text:=upper(btrim(coalesce(p_way_id,''))); v_provider text:=upper(btrim(coalesce(p_provider_code,''))); v_township text; v_status text; v_closed timestamptz; v_auto text; v_id uuid;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 v_role:=lower(coalesce(public.be_current_role(),''));
 if v_role not in ('superadmin','operation_manager','operations_manager','operation_supervisor','customer_service','bd_manager','data_entry') then raise exception 'PROVIDER_CHANGE_NOT_AUTHORIZED' using errcode='42501'; end if;
 if length(btrim(coalesce(p_reason,'')))<12 then raise exception 'PROVIDER_CHANGE_REASON_REQUIRED'; end if;
 if not exists(select 1 from public.be_data_entry_service_providers where provider_code=v_provider and is_active) then raise exception 'PROVIDER_NOT_ACTIVE'; end if;
 select township,parcel_status,closed_at into v_township,v_status,v_closed
 from public.be_data_entry_parcel_details where delivery_way_id=v_way order by updated_at desc limit 1;
 if not found then raise exception 'WAY_NOT_FOUND'; end if;
 if v_closed is not null or upper(coalesce(v_status,'')) in ('DELIVERED','RTO','RETURNED','COMPLETED','SETTLED','CANCELLED') then raise exception 'PARCEL_ALREADY_FINALIZED'; end if;
 v_auto:=public.be_data_entry_service_provider_route_v17(v_township)->>'provider_code';
 if v_auto=v_provider then raise exception 'SAME_AS_AUTOMATIC_PROVIDER'; end if;
 insert into public.be_parcel_provider_change_requests_v1(delivery_way_id,requested_provider_code,automatic_provider_code,reason,requested_by)
 values(v_way,v_provider,coalesce(v_auto,'UNRESOLVED'),btrim(p_reason),auth.uid()) returning id into v_id;
 return jsonb_build_object('ok',true,'request_id',v_id,'status','PENDING_REVIEW','pricing_unchanged',true,'provider_assignment_unchanged',true);
end $$;
revoke all on function public.be_request_parcel_provider_change_v1(text,text,text) from public,anon;
grant execute on function public.be_request_parcel_provider_change_v1(text,text,text) to authenticated;