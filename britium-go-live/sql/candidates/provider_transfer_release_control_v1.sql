-- Provider transfer go-live capability switch.
-- Install on isolated UAT first; all features default to FALSE.
create table if not exists public.be_provider_transfer_release_control_v1 (
  control_key text primary key check (control_key='PROVIDER_TRANSFER_V1'),
  draft_enabled boolean not null default false,
  custody_enabled boolean not null default false,
  mixed_trip_enabled boolean not null default false,
  last_approval_evidence text,
  approved_by uuid,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint provider_release_approval_required check (
    not (draft_enabled or custody_enabled or mixed_trip_enabled)
    or (approved_by is not null and approved_at is not null
      and length(btrim(coalesce(last_approval_evidence,'')))>=20)
  )
);
alter table public.be_provider_transfer_release_control_v1 enable row level security;
revoke all on table public.be_provider_transfer_release_control_v1 from public,anon,authenticated;
insert into public.be_provider_transfer_release_control_v1(control_key)
values ('PROVIDER_TRANSFER_V1') on conflict do nothing;

create or replace function public.be_provider_transfer_capabilities_v1()
returns jsonb language plpgsql stable security definer
set search_path=public,auth,pg_temp as $body$
declare
  v_control record;
  v_authenticated boolean:=auth.uid() is not null;
begin
  -- No role details, personal data or privileged metadata are returned.
  if not v_authenticated then
    return jsonb_build_object('ok',false,'draft_enabled',false,
      'custody_enabled',false,'mixed_trip_enabled',false);
  end if;
  select * into v_control from public.be_provider_transfer_release_control_v1
    where control_key='PROVIDER_TRANSFER_V1';
  return jsonb_build_object('ok',true,
    'draft_enabled',coalesce(v_control.draft_enabled,false),
    'custody_enabled',coalesce(v_control.custody_enabled,false),
    'mixed_trip_enabled',coalesce(v_control.mixed_trip_enabled,false),
    'build','PROVIDER_TRANSFER_CAPABILITIES_V1');
end;
$body$;
revoke all on function public.be_provider_transfer_capabilities_v1() from public,anon;
grant execute on function public.be_provider_transfer_capabilities_v1() to authenticated;

create or replace function public.be_provider_transfer_approve_release_v1(
  p_draft boolean,p_custody boolean,p_mixed boolean,p_evidence_ref text
) returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $body$
declare
  v_actor uuid:=auth.uid();
  v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
  v_evidence text:=btrim(coalesce(p_evidence_ref,''));
begin
  if v_actor is null or v_role not in ('superadmin','super_admin')
    then raise exception 'Super Admin approval required to change provider release capability'; end if;
  if coalesce(p_mixed,false) and not coalesce(p_draft,false) then
    raise exception 'Mixed trips require transfer draft capability'; end if;
  if (coalesce(p_draft,false) or coalesce(p_custody,false) or coalesce(p_mixed,false)) then
    if length(v_evidence)<20
      then raise exception 'Reference reviewed end-to-end UAT, handover and rollback evidence'; end if;
    if not exists(
      select 1 from public.be_provider_handover_sites_v1 h
      join public.be_wayplan_service_locations loc on loc.location_code=h.location_code
      where h.active and h.verified_at is not null and h.verified_by is not null
      and loc.active
    ) then raise exception 'At least one verified active provider handover site is required'; end if;
  end if;
  update public.be_provider_transfer_release_control_v1
  set draft_enabled=coalesce(p_draft,false),custody_enabled=coalesce(p_custody,false),
      mixed_trip_enabled=coalesce(p_mixed,false),
      last_approval_evidence=nullif(v_evidence,''),
      approved_by=case when coalesce(p_draft,false) or coalesce(p_custody,false) or coalesce(p_mixed,false)
        then v_actor else null end,
      approved_at=case when coalesce(p_draft,false) or coalesce(p_custody,false) or coalesce(p_mixed,false)
        then now() else null end,
      updated_at=now()
  where control_key='PROVIDER_TRANSFER_V1';
  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details
  ) values (v_actor,coalesce(auth.jwt()->>'email',''),public.be_current_user_role(),
    'PROVIDER_TRANSFER_RELEASE_CONTROL_V1','SYSTEM_CAPABILITY','PROVIDER_TRANSFER_V1',
    jsonb_build_object('draft_enabled',p_draft,'custody_enabled',p_custody,
      'mixed_trip_enabled',p_mixed,'uat_evidence_ref',v_evidence));
  return public.be_provider_transfer_capabilities_v1();
end;
$body$;
revoke all on function public.be_provider_transfer_approve_release_v1(boolean,boolean,boolean,text) from public,anon;
grant execute on function public.be_provider_transfer_approve_release_v1(boolean,boolean,boolean,text) to authenticated;
