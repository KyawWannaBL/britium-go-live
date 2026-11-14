create table if not exists public.be_pickup_count_change_requests_v1 (
 id uuid primary key default gen_random_uuid(), pickup_id text not null, requested_count integer not null check(requested_count between 1 and 500),
 original_count integer not null, reason text not null, requested_by uuid not null, requested_at timestamptz not null default now(), status text not null default 'PENDING_REVIEW');
alter table public.be_pickup_count_change_requests_v1 enable row level security;
revoke all on public.be_pickup_count_change_requests_v1 from anon,authenticated;
create or replace function public.be_rider_request_pickup_count_change_v1(p_pickup_id text,p_count integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid();v_identity jsonb;v_code text;v_email text;v_row public.be_portal_pickup_requests%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_count is null or p_count<1 or p_count>500 or length(trim(coalesce(p_reason,'')))<8 then raise exception 'Valid parcel count and reason required'; end if;
 v_identity:=public.be_current_field_team_identity();
 v_code:=upper(coalesce(v_identity->>'worker_code',''));v_email:=lower(coalesce(v_identity->>'email',''));
 select * into v_row from public.be_portal_pickup_requests where pickup_id=p_pickup_id for update;
 if not found then raise exception 'Pickup not found';end if;
 if not (v_code in (upper(coalesce(v_row.assigned_rider_code,'')),upper(coalesce(v_row.assigned_driver_code,'')),upper(coalesce(v_row.assigned_helper_code,'')))
 or v_email in (lower(coalesce(v_row.assigned_rider_email,'')),lower(coalesce(v_row.assigned_driver_email,'')),lower(coalesce(v_row.assigned_helper_email,'')))) then raise exception 'Not assigned to this pickup' using errcode='42501'; end if;
 if upper(coalesce(v_row.pickup_status,'')) like '%VERIF%' or upper(coalesce(v_row.workflow_stage,'')) like '%VERIF%' or exists(select 1 from public.be_pickup_verification_parcels where pickup_id=p_pickup_id) then raise exception 'Pickup verification or parcel capture already started'; end if;
 insert into public.be_pickup_count_change_requests_v1(pickup_id,original_count,requested_count,reason,requested_by)
 values(p_pickup_id,coalesce(v_row.parcel_count,v_row.expected_parcels,0),p_count,trim(p_reason));
 return jsonb_build_object('ok',true,'status','PENDING_REVIEW','message','Count discrepancy submitted for supervisor review before verification');
end $$;
revoke all on function public.be_rider_request_pickup_count_change_v1(text,integer,text) from public,anon;
grant execute on function public.be_rider_request_pickup_count_change_v1(text,integer,text) to authenticated;