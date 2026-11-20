-- UAT CANDIDATE ONLY. Requires provider_handover_sites_v1.sql to be installed first.
-- Manual administrative approval of an existing mapped physical handover location.
-- This is NOT a dispatch scan, provider custody acceptance, or delivery confirmation.
create or replace function public.be_provider_handover_site_approve_v1(
  p_provider_code text,
  p_origin_branch_code text,
  p_location_code text,
  p_verification_note text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_role text := replace(lower(coalesce(public.be_current_role(),'')),'-','_');
  v_provider text := upper(btrim(coalesce(p_provider_code,'')));
  v_branch text := upper(btrim(coalesce(p_origin_branch_code,'')));
  v_location text := upper(btrim(coalesce(p_location_code,'')));
  v_note text := btrim(coalesce(p_verification_note,''));
  v_site record;
  v_provider_type text;
begin
  if v_user is null then
    raise exception 'Authenticated management approval is required';
  end if;
  if v_role not in ('superadmin','super_admin','operation_manager','operations_manager') then
    raise exception 'Management authority is required to approve a provider handover site';
  end if;
  if v_branch not in ('YGN','MDY','NPT') then
    raise exception 'Choose a valid origin branch';
  end if;
  if length(v_note)<8 then
    raise exception 'Document the physical handover verification (minimum eight characters)';
  end if;
  select provider_type into v_provider_type
  from public.be_data_entry_service_providers
  where provider_code=v_provider and is_active=true;
  if v_provider_type is null or upper(v_provider_type) not in ('OUTSOURCE','BRANCH','TERMINAL') then
    raise exception 'Select an active authorized external provider, branch or terminal';
  end if;
  select location_code,location_name,latitude,longitude,location_type
    into v_site
  from public.be_wayplan_service_locations
  where upper(location_code)=v_location and active=true
    and latitude between 9 and 29
    and longitude between 92 and 102;
  if not found then
    raise exception 'Select an existing active, geocoded physical service location';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_provider||':'||v_branch||':'||v_location,0));
  insert into public.be_provider_handover_sites_v1 (
    provider_code,origin_branch_code,location_code,active,
    verified_at,verified_by,verification_note,updated_at
  ) values (
    v_provider,v_branch,v_site.location_code,true,
    now(),v_user,v_note,now()
  )
  on conflict (provider_code,origin_branch_code,location_code)
  do update set active=true,verified_at=excluded.verified_at,
    verified_by=excluded.verified_by,
    verification_note=excluded.verification_note,updated_at=now();
  -- Audit records keep the physical site and the explicit management decision.
  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details
  ) values (
    v_user,coalesce(auth.jwt()->>'email',''),public.be_current_user_role(),
    'PROVIDER_HANDOVER_SITE_APPROVED_V1','PROVIDER_HANDOVER_SITE',
    v_provider||':'||v_branch||':'||v_location,
    jsonb_build_object(
      'provider_code',v_provider,'origin_branch_code',v_branch,
      'location_code',v_location,'location_name',v_site.location_name,
      'latitude',v_site.latitude,'longitude',v_site.longitude,
      'verification_note',v_note,'verified_by',v_user
    )
  );
  return jsonb_build_object(
    'ok',true,'provider_code',v_provider,'origin_branch_code',v_branch,
    'location_code',v_location,'location_name',v_site.location_name,
    'verified_by',v_user,'site_approved',true,
    'dispatch_created',false,'custody_transfer_created',false,
    'build','PROVIDER_HANDOVER_SITE_APPROVE_V1'
  );
end;
$function$;

revoke all on function public.be_provider_handover_site_approve_v1(text,text,text,text) from public,anon;
grant execute on function public.be_provider_handover_site_approve_v1(text,text,text,text) to authenticated;
