-- V155: preserve Rider delivery state across mobile snapshot refresh.
-- RIDER_ACCEPTED must stay RIDER_ACCEPTED so the UI advances to Start Delivery.
-- ARRIVED_AT_CUSTOMER must stay ARRIVED_AT_CUSTOMER so proof/COD verification remains available.

do $patch_base$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_field_team_mobile_snapshot'
  limit 1;

  if v_def is null then raise exception 'be_field_team_mobile_snapshot not found'; end if;

  v_old := 'when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'''')) in (''OUT_FOR_DELIVERY'',''ARRIVED_AT_CUSTOMER'') then ''OUT_FOR_DELIVERY''
      else ''READY_FOR_DELIVERY'' end as mobile_status';

  v_new := 'when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''''))=''ARRIVED_AT_CUSTOMER'' then ''ARRIVED_AT_CUSTOMER''
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'''')) in (''OUT_FOR_DELIVERY'',''DELIVERY_STARTED'') then ''OUT_FOR_DELIVERY''
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'''')) in (''RIDER_ACCEPTED'',''DELIVERY_ACCEPTED'',''ACCEPTED_FOR_DELIVERY'') then ''RIDER_ACCEPTED''
      when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'''')) in (''DISPATCHED'',''READY_FOR_DELIVERY'',''ASSIGNED_FOR_DELIVERY'',''DELIVERY_ASSIGNED'') then ''READY_FOR_DELIVERY''
      else upper(coalesce(nullif(s.stop_status,''''),nullif(s.rider_status,''''),nullif(s.dispatch_status,''''),''READY_FOR_DELIVERY'')) end as mobile_status';

  if position(v_old in v_def)=0 then
    raise exception 'Base mobile snapshot status anchor changed; V155 stopped safely';
  end if;

  v_def:=replace(v_def,v_old,v_new);
  v_def:=replace(v_def,'be_field_team_mobile_snapshot_delivery_v12_14_20260901','be_field_team_mobile_snapshot_delivery_v155');
  execute v_def;
end
$patch_base$;

do $patch_v77$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_field_team_mobile_snapshot_v77'
  limit 1;

  if v_def is null then raise exception 'be_field_team_mobile_snapshot_v77 not found'; end if;

  v_old := 'when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''''))=''ARRIVED_AT_CUSTOMER'' then ''ARRIVED_AT_CUSTOMER''
        when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''''))=''OUT_FOR_DELIVERY'' then ''OUT_FOR_DELIVERY''
        else ''READY_FOR_DELIVERY''';

  v_new := 'when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,''''))=''ARRIVED_AT_CUSTOMER'' then ''ARRIVED_AT_CUSTOMER''
        when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'''')) in (''OUT_FOR_DELIVERY'',''DELIVERY_STARTED'') then ''OUT_FOR_DELIVERY''
        when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'''')) in (''RIDER_ACCEPTED'',''DELIVERY_ACCEPTED'',''ACCEPTED_FOR_DELIVERY'') then ''RIDER_ACCEPTED''
        when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'''')) in (''DISPATCHED'',''READY_FOR_DELIVERY'',''ASSIGNED_FOR_DELIVERY'',''DELIVERY_ASSIGNED'') then ''READY_FOR_DELIVERY''
        else upper(coalesce(nullif(s.stop_status,''''),nullif(s.rider_status,''''),nullif(s.dispatch_status,''''),''READY_FOR_DELIVERY''))';

  if position(v_old in v_def)=0 then
    raise exception 'V77 mobile snapshot status anchor changed; V155 stopped safely';
  end if;

  v_def:=replace(v_def,v_old,v_new);
  v_def:=replace(v_def,'RIDER_MOBILE_OPERATIONAL_WAY_ID_V77_2','RIDER_MOBILE_STATUS_PROJECTION_V155');
  execute v_def;
end
$patch_v77$;

comment on function public.be_field_team_mobile_snapshot(jsonb)
is 'V155: preserves RIDER_ACCEPTED, OUT_FOR_DELIVERY and ARRIVED_AT_CUSTOMER delivery states across Rider App refresh.';

comment on function public.be_field_team_mobile_snapshot_v77(jsonb)
is 'V155: role-aware Rider snapshot preserving delivery workflow state instead of flattening accepted/arrival states.';
