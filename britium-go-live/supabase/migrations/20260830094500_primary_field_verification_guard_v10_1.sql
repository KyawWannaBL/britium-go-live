-- BRITIUM_PRIMARY_FIELD_VERIFICATION_GUARD_V10_1
-- Rider/driver may finalize. Helper remains optional and may accept, assist with evidence, and report exceptions.
begin;

do $$ begin
  if to_regprocedure('public.be_rider_pickup_action_primary_guard_legacy_v101(jsonb)') is null
     and to_regprocedure('public.be_rider_pickup_action(jsonb)') is not null then
    alter function public.be_rider_pickup_action(jsonb) rename to be_rider_pickup_action_primary_guard_legacy_v101;
  end if;
  if to_regprocedure('public.be_rider_submit_partial_pickup_verification_primary_guard_legacy_v101(jsonb)') is null
     and to_regprocedure('public.be_rider_submit_partial_pickup_verification(jsonb)') is not null then
    alter function public.be_rider_submit_partial_pickup_verification(jsonb) rename to be_rider_submit_partial_pickup_verification_primary_guard_legacy_v101;
  end if;
  if to_regprocedure('public.be_rider_wayplan_action_primary_guard_legacy_v101(jsonb)') is null
     and to_regprocedure('public.be_rider_wayplan_action(jsonb)') is not null then
    alter function public.be_rider_wayplan_action(jsonb) rename to be_rider_wayplan_action_primary_guard_legacy_v101;
  end if;
end $$;

create or replace function private.be_field_primary_context_v101()
returns jsonb language sql stable security definer set search_path=public,auth,pg_temp as $$
  select coalesce(public.be_current_field_team_identity(),'{}'::jsonb);
$$;
revoke all on function private.be_field_primary_context_v101() from public,anon;

create or replace function public.be_rider_pickup_action(p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_identity jsonb:=private.be_field_primary_context_v101(); v_role text:=lower(v_identity->>'role'); v_action text:=upper(coalesce(p_payload->>'action',''));
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role not in ('rider','driver','helper') then return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED'); end if;
  if v_role='helper' and v_action in ('VERIFY_PICKUP','PICKUP_VERIFY','PICKUP_VERIFIED','VERIFY','COLLECT','PICKUP_COLLECTED','COLLECTED','DELIVERED_TO_WAREHOUSE','START_DELIVERY','OUT_FOR_DELIVERY','DELIVER','DELIVERED') then
    return jsonb_build_object('ok',false,'error','PRIMARY_WORKER_REQUIRED','message','Only the assigned rider or driver can finalize pickup or delivery. Helper may upload evidence and report exceptions.');
  end if;
  return public.be_rider_pickup_action_primary_guard_legacy_v101(p_payload||jsonb_build_object('authenticated_worker_code',v_identity->>'worker_code','authenticated_worker_role',v_role));
end $$;
revoke all on function public.be_rider_pickup_action(jsonb) from public,anon;
grant execute on function public.be_rider_pickup_action(jsonb) to authenticated;

create or replace function public.be_rider_submit_partial_pickup_verification(p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_identity jsonb:=private.be_field_primary_context_v101(); v_role text:=lower(v_identity->>'role'); v_result jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role not in ('rider','driver','helper') then return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED'); end if;
  if v_role='helper' then
    v_result:=public.be_rider_submit_partial_pickup_verification_primary_guard_legacy_v101(p_payload||jsonb_build_object('verified_count',0,'partial_verification',true,'helper_evidence_only',true));
    return v_result||jsonb_build_object('helper_evidence_only',true,'message','Evidence saved. Assigned rider or driver must finalize pickup verification.');
  end if;
  return public.be_rider_submit_partial_pickup_verification_primary_guard_legacy_v101(p_payload||jsonb_build_object('authenticated_worker_code',v_identity->>'worker_code','authenticated_worker_role',v_role));
end $$;
revoke all on function public.be_rider_submit_partial_pickup_verification(jsonb) from public,anon;
grant execute on function public.be_rider_submit_partial_pickup_verification(jsonb) to authenticated;

create or replace function public.be_rider_wayplan_action(p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_identity jsonb:=private.be_field_primary_context_v101(); v_role text:=lower(v_identity->>'role'); v_action text:=lower(coalesce(p_payload->>'action',''));
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role not in ('rider','driver','helper') then return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED'); end if;
  if v_role='helper' and v_action in ('deliver','delivered','complete','complete_delivery','start_delivery','out_for_delivery') then
    return jsonb_build_object('ok',false,'error','PRIMARY_WORKER_REQUIRED','message','Only the assigned rider or driver can finalize delivery.');
  end if;
  return public.be_rider_wayplan_action_primary_guard_legacy_v101(p_payload||jsonb_build_object('authenticated_worker_code',v_identity->>'worker_code','authenticated_worker_role',v_role));
end $$;
revoke all on function public.be_rider_wayplan_action(jsonb) from public,anon;
grant execute on function public.be_rider_wayplan_action(jsonb) to authenticated;

commit;
