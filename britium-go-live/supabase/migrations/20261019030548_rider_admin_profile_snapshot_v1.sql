create or replace function public.be_rider_admin_profile_snapshot_v1()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp
as $$
declare v_uid uuid := auth.uid(); v_profile public.be_rider_auth_profiles%rowtype;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into v_profile from public.be_rider_auth_profiles
 where auth_user_id=v_uid and lower(role)='superadmin' and lower(status)='active'
 limit 1;
 if not found then raise exception 'Active Rider App administrator approval required' using errcode='42501'; end if;
 return jsonb_build_object('ok',true,'identity',jsonb_build_object('auth_user_id',v_uid,'role','superadmin','worker_code',null,'email',v_profile.email,'display_name',v_profile.full_name,'branch_code',null),'workforce','{}'::jsonb,'profile',jsonb_build_object('id',v_uid,'role','superadmin','email',v_profile.email),'counts',jsonb_build_object('jobs',0,'delivery_jobs',0,'notifications',0),'admin_mode',true);
end $$;
revoke all on function public.be_rider_admin_profile_snapshot_v1() from public,anon;
grant execute on function public.be_rider_admin_profile_snapshot_v1() to authenticated;