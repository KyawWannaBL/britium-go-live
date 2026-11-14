alter table public.be_pickup_count_change_requests_v1 add column if not exists reviewed_by uuid, add column if not exists reviewed_at timestamptz, add column if not exists review_note text;
create or replace function public.be_superadmin_review_pickup_count_v1(p_request_id uuid,p_approve boolean,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_uid uuid:=auth.uid();v_email text;v_request public.be_pickup_count_change_requests_v1%rowtype;v_pickup public.be_portal_pickup_requests%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 select lower(email) into v_email from auth.users where id=v_uid;
 if not exists(select 1 from public.be_user_roles where lower(email)=v_email and lower(role)='superadmin') then raise exception 'Enterprise superadmin authorization required' using errcode='42501';end if;
 select * into v_request from public.be_pickup_count_change_requests_v1 where id=p_request_id for update;
 if not found or v_request.status<>'PENDING_REVIEW' then raise exception 'Review request missing or already processed';end if;
 if v_request.requested_by=v_uid then raise exception 'Requester cannot self-approve';end if;
 select * into v_pickup from public.be_portal_pickup_requests where pickup_id=v_request.pickup_id for update;
 if not found then raise exception 'Pickup not found';end if;
 if p_approve then
 if coalesce(v_pickup.parcel_count,v_pickup.expected_parcels,0)<>v_request.original_count then raise exception 'Pickup quantity changed since request';end if;
 if upper(coalesce(v_pickup.pickup_status,'')) like '%VERIF%' or upper(coalesce(v_pickup.workflow_stage,'')) like '%VERIF%'
 or exists(select 1 from public.be_pickup_verification_parcels where pickup_id=v_request.pickup_id) then raise exception 'Verification or capture already started';end if;
 update public.be_portal_pickup_requests set parcel_count=v_request.requested_count,expected_parcels=v_request.requested_count,expected_parcel_count=v_request.requested_count,updated_at=now() where id=v_pickup.id;
 end if;
 update public.be_pickup_count_change_requests_v1 set status=case when p_approve then 'APPROVED' else 'REJECTED' end,reviewed_by=v_uid,reviewed_at=now(),review_note=p_note where id=p_request_id;
 return jsonb_build_object('ok',true,'status',case when p_approve then 'APPROVED' else 'REJECTED' end,'pickup_id',v_request.pickup_id);
end $$;
revoke all on function public.be_superadmin_review_pickup_count_v1(uuid,boolean,text) from public,anon;
grant execute on function public.be_superadmin_review_pickup_count_v1(uuid,boolean,text) to authenticated;